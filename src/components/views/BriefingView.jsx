import { useMemo, useState, memo } from "react";
import { localDate, diffDays } from '../../utils/date.js';
import { isLeafNode } from '../../utils/scheduler.js';
import { computeAttention, attentionCounts } from '../../utils/attention.js';
import { statusChangePatch } from '../../utils/completion.js';
import { nextStatus } from '../../utils/treeEdit.js';
import { hasChain, chainShorts, chainTooltip } from '../../utils/handoff.js';
import { detectJiraFieldId, linkHealth, parseJiraTable, reconcile, statusPatches } from '../../utils/jiraSync.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { buildMemberShortMap } from '../../App.jsx';
import { CriticalPathBadge } from '../shared/CriticalPathBadge.jsx';
import { useT } from '../../i18n.jsx';

const S_DOT = { open: '○', wip: '◐', done: '✓' };
const S_COLOR = { open: 'var(--tx3)', wip: 'var(--am)', done: 'var(--gr)' };
const ATTN_TONE = { overdue: 'var(--re)', drift: 'var(--ac)', atRisk: 'var(--am)', blocked: 'var(--am)', unestimated: 'var(--tx3)' };
const ATTN_ICON = { overdue: '⏰', drift: '⇄', atRisk: '⚠', blocked: '⛔', unestimated: '○' };
const REASON_KEY = { overdue: 'bv.overdue', late: 'bv.lateEnd', exploratoryClose: 'bv.exploratoryDeadline', blocked: 'bv.attn.blocked', unestimated: 'bv.attn.unestimated', drift: 'bv.attn.drift' };

function fmtDateDE(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : localDate(d);
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function fmtDateFull(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : localDate(d);
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' });
}

function weeksBetween(a, b) {
  const days = Math.abs(diffDays(a, b));
  return Math.round(days / 7);
}

// Status dot, clicked to cycle open → wip → done → open — the same field a
// keyboard Space does in the Work Tree (utils/treeEdit.js `nextStatus`), but
// also stamping the completedAt/-Start/progress side effects QuickEdit's
// status dropdown already applies (utils/completion.js `statusChangePatch`),
// since Run mode is exactly the "I'm starting this now" / "this is done"
// moment those dates exist to capture. Writes through the same onUpdate →
// updateNode → mutate() path every other status control in the app uses —
// one undo step, no second write path.
function StatusCycleButton({ node, onUpdate, t }) {
  if (!node || !onUpdate) return null;
  const next = nextStatus(node.status);
  return (
    <button type="button" className="btn btn-ghost btn-xs"
      style={{ padding: '1px 4px', fontSize: 11, flexShrink: 0, color: S_COLOR[node.status], lineHeight: 1 }}
      data-htip={t('bv.cycleStatusTip', t(next))}
      data-testid={`bv-status-${node.id}`}
      onClick={e => { e.stopPropagation(); onUpdate({ ...node, ...statusChangePatch(node, next) }); }}>
      {S_DOT[node.status]}
    </button>
  );
}

const JIRA_MAX_ROWS = 8;

// One informational drift/health row — id + name + whatever the caller wants
// on the right (a status pill, a key, nothing). Deliberately not the
// StatusCycleButton row style: these are read as a worklist (matching the
// old Jira-Abgleich dialog's Row component), not edited in place.
function JiraRow({ id, name, right, onClick, testId }) {
  return (
    <div onClick={onClick} data-testid={testId}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 10, cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', width: 70, flexShrink: 0 }}>{id}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tx2)' }}>{name}</span>
      {right}
    </div>
  );
}

function JiraSection({ title, tone, count, hint, children }) {
  if (!count) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: tone }}>{title}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{count}</span>
      </div>
      {hint && <div style={{ fontSize: 9, color: 'var(--tx3)', marginBottom: 3, fontStyle: 'italic' }}>{hint}</div>}
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '4px 8px' }}>{children}</div>
    </div>
  );
}

function BriefingViewImpl({ tree, scheduled, vacations, members, teams, stats, confidence = {}, cpSet, cpLabels = {}, rootFilter, teamFilter, personFilter, hideDone = false, horizonIds = null, diffChangedIds = null, diffVisibleIds = null, customFields, onOpenItem, onUpdate, onApplyStatus, onExportTodo }) {
  const { t } = useT();

  const HORIZON_OPTS = [
    { id: '7', label: t('bv.thisWeek') },
    { id: '14', label: t('bv.next2weeks') },
    { id: '28', label: t('bv.next4weeks') },
  ];

  const [horizonDays, setHorizonDays] = useState(() => {
    try { return +(localStorage.getItem('planr_briefing_horizon') || '14'); } catch { return 14; }
  });
  const setHd = v => { setHorizonDays(v); try { localStorage.setItem('planr_briefing_horizon', String(v)); } catch {} };

  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const horizonEnd = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() + horizonDays); return d; }, [now, horizonDays]);

  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const shortMap = useMemo(() => buildMemberShortMap(members), [members]);
  const memberFullName = id => members.find(m => m.id === id)?.name || id || '?';

  // Filter helpers
  const filteredScheduled = useMemo(() => {
    let items = scheduled;
    if (rootFilter) items = items.filter(s => s.id === rootFilter || s.id.startsWith(rootFilter + '.'));
    if (teamFilter) items = items.filter(s => s.team === teamFilter);
    if (personFilter) items = items.filter(s => (s.personId === personFilter) || (s.assign || []).includes(personFilter));
    if (hideDone) items = items.filter(s => s.status !== 'done' || diffVisibleIds?.has(s.id) || diffVisibleIds?.has(s.treeId || ''));
    // Global "Plan" horizon and "Review" diff filters narrow the briefing pool
    // so the daily/weekly card list reflects the same scope as the rest of
    // the app.
    if (horizonIds) items = items.filter(s => horizonIds.has(s.id) || horizonIds.has(s.treeId || ''));
    if (diffChangedIds) items = items.filter(s => diffChangedIds.has(s.id) || diffChangedIds.has(s.treeId || ''));
    return items;
  }, [scheduled, rootFilter, teamFilter, personFilter, hideDone, horizonIds, diffChangedIds, diffVisibleIds]);

  // ── Jira drift — the return path of the Jira export, inline instead of a
  // dialog you have to open. Phase 7 will make Jira a live source; until
  // then this is the same parse-and-compare (utils/jiraSync.js) the old
  // "Jira-Abgleich" modal used, its result rendered as rows you act on.
  const jiraFields = customFields?.length ? customFields : DEFAULT_CUSTOM_FIELDS;
  const jiraFieldId = useMemo(() => detectJiraFieldId(jiraFields, tree), [jiraFields, tree]);
  const jiraHealth = useMemo(() => linkHealth(tree, jiraFieldId), [tree, jiraFieldId]);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraText, setJiraText] = useState('');
  // Ids the user has *un*checked — defaulting to "all accepted" makes the
  // common case (take everything Jira says) one click; the inverted set
  // survives re-parsing the paste without resurrecting stale unchecks.
  const [jiraRejected, setJiraRejected] = useState(() => new Set());
  const jiraParsed = useMemo(() => (jiraText.trim() ? parseJiraTable(jiraText) : null), [jiraText]);
  const jiraResult = useMemo(
    () => (jiraParsed?.rows?.length ? reconcile({ tree, rows: jiraParsed.rows, jiraFieldId }) : null),
    [jiraParsed, tree, jiraFieldId],
  );
  const jiraStatusDiff = jiraResult?.statusDiff || [];
  const jiraAccepted = useMemo(
    () => new Set(jiraStatusDiff.map(d => d.id).filter(id => !jiraRejected.has(id))),
    [jiraStatusDiff, jiraRejected],
  );
  const toggleJiraRow = id => setJiraRejected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const applyJiraDiffs = (diffs, ids) => {
    const patches = statusPatches(diffs, ids, tree);
    if (patches.length) onApplyStatus?.(patches);
  };

  // ── Attention list — one ranked feed instead of five chip-filtered panels.
  // See utils/attention.js for what earns a row and why the ranking order is
  // overdue > drift > at-risk > blocked > unestimated.
  const attentionItems = useMemo(() => computeAttention({
    tree, scheduled, confidence, now, rootFilter, teamFilter, personFilter,
    driftItems: jiraStatusDiff.map(d => ({ id: d.id, name: d.name, key: d.key, target: d.target, jiraStatus: d.jiraStatus })),
  }), [tree, scheduled, confidence, now, rootFilter, teamFilter, personFilter, jiraStatusDiff]);
  const attnCounts = useMemo(() => attentionCounts(attentionItems), [attentionItems]);

  // Vacations in horizon
  const vacationsInHorizon = useMemo(() => {
    return vacations.filter(v => {
      if (!v.from || !v.to) return false;
      const vFrom = localDate(v.from);
      const vTo = localDate(v.to);
      return vFrom <= horizonEnd && vTo >= now;
    });
  }, [vacations, now, horizonEnd]);

  // Per-person queues — what each person is on NOW (wip, or already running)
  // vs NEXT (scheduled to start within the horizon), straight off the
  // scheduler's own assignments. A handoff chain (utils/handoff.js) shows as
  // one row with the "⇄ AB→CD" badge PlanReview already uses, not two.
  const personCards = useMemo(() => {
    const cards = new Map();

    filteredScheduled.forEach(s => {
      if (s.status === 'done') return;
      const isNow = s.status === 'wip' || (s.startD && s.startD < now && s.endD && s.endD >= now);
      const isNext = !isNow && s.startD && s.startD <= horizonEnd && s.endD && s.endD >= now;
      if (!isNow && !isNext) return;

      const personId = s.personId || null;
      if (!personId) return; // skip unassigned for per-person cards

      if (!cards.has(personId)) {
        const member = members.find(m => m.id === personId);
        const memberTeam = teams.find(tm => tm.id === member?.team);
        cards.set(personId, {
          personId,
          name: member?.name || personId,
          teamColor: memberTeam?.color || 'var(--ac)',
          teamName: memberTeam?.name || '',
          now: [],
          next: [],
        });
      }
      cards.get(personId)[isNow ? 'now' : 'next'].push(s);
    });

    for (const card of cards.values()) {
      card.now.sort((a, b) => (a.startD || 0) - (b.startD || 0));
      card.next.sort((a, b) => (a.startD || 0) - (b.startD || 0));
    }

    return [...cards.values()]
      .filter(c => {
        if (personFilter && c.personId !== personFilter) return false;
        if (teamFilter) {
          const m = members.find(x => x.id === c.personId);
          if (m?.team !== teamFilter) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredScheduled, members, teams, now, horizonEnd, personFilter, teamFilter]);

  // Initials from name
  const initials = name => {
    const words = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : words.map(w => w[0]).join('').toUpperCase();
  };

  // Milestone / root items with near-term deadline
  const milestones = useMemo(() => {
    return tree
      .filter(r => {
        if (r.id.includes('.')) return false; // roots only
        if (!r.date) return false;
        const dl = localDate(r.date);
        return dl >= now && dl <= horizonEnd;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [tree, now, horizonEnd]);

  const today = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const activeItemsCount = personCards.reduce((sum, card) => sum + card.now.length + card.next.length, 0);
  const noContent = personCards.length === 0 && milestones.length === 0 && attentionItems.length === 0 && vacationsInHorizon.length === 0;
  const summaryCards = [
    { label: t('bv.activeItems'), value: activeItemsCount, tone: 'var(--ac)' },
    { label: t('bv.activePeople'), value: personCards.length, tone: 'var(--gr)' },
    { label: t('bv.upcomingCount'), value: milestones.length, tone: 'var(--am)' },
    { label: t('bv.attentionCount'), value: attentionItems.length, tone: attentionItems.length ? 'var(--re)' : 'var(--tx3)' },
    { label: t('bv.vacationCount'), value: vacationsInHorizon.length, tone: 'var(--tx2)' },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{t('tab.briefing')}</div>
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{today}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', marginRight: 4 }}>{t('bv.horizon')}</span>
          {HORIZON_OPTS.map(h => (
            <button key={h.id} className={`btn btn-xs ${horizonDays === +h.id ? 'btn-pri' : 'btn-sec'}`}
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => setHd(+h.id)}>{h.label}</button>
          ))}
          {onExportTodo && (
            <button className="btn btn-sec btn-xs"
              style={{ padding: '3px 8px', fontSize: 11, marginLeft: 6 }}
              onClick={() => onExportTodo(horizonDays)}
              data-htip={t('bv.exportTodoHint')}>
              {t('bv.exportTodo')}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 18 }}>
        {summaryCards.map(card => (
          <div key={card.label} className="sum-card" style={{ minWidth: 0 }}>
            <div className="sum-v" style={{ color: card.tone }}>{card.value}</div>
            <div className="sum-l">{card.label}</div>
          </div>
        ))}
      </div>

      {noContent && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '24px 20px', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
          {t('bv.noActivity')}
        </div>
      )}

      {/* ══════ Attention — one ranked list, not five chips ══════ */}
      <div className="section-h" style={{ marginTop: 0 }}>
        {t('bv.attention')}
        {attentionItems.length > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginLeft: 6 }}>
          {['overdue', 'drift', 'atRisk', 'blocked', 'unestimated'].filter(k => attnCounts[k]).map(k => `${attnCounts[k]} ${t(k === 'atRisk' ? 'bv.attn.atRisk' : `bv.attn.${k}`)}`).join(' · ')}
        </span>}
      </div>
      {attentionItems.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '8px 0', marginBottom: 18 }}>{t('bv.attn.empty')}</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
          {attentionItems.map((item, i) => {
            const node = iMap[item.id];
            const leaf = node ? isLeafNode(tree, node.id) : false;
            return (
              <div key={`${item.kind}:${item.id}:${i}`}
                data-testid={`bv-attn-${item.kind}-${item.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: 'var(--bg3)', border: `1px solid ${ATTN_TONE[item.kind]}`, borderLeftWidth: 3 }}
                onClick={() => onOpenItem?.(item.id)}>
                <span style={{ fontSize: 11, color: ATTN_TONE[item.kind], flexShrink: 0 }}>{ATTN_ICON[item.kind]}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{item.id}</span>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <span style={{ fontSize: 10, color: ATTN_TONE[item.kind], flexShrink: 0 }}>{t(REASON_KEY[item.reason] || REASON_KEY[item.kind])}</span>
                {item.kind === 'drift' && (
                  <button className="btn btn-pri btn-xs" style={{ padding: '2px 6px', fontSize: 9, flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); applyJiraDiffs([item], new Set([item.id])); }}
                    data-htip={t('js.applyTip')}>
                    {t('bv.attn.apply')} → {t(item.target)}
                  </button>
                )}
                {item.date && item.kind !== 'drift' && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{item.date}</span>}
                {leaf && item.kind !== 'drift' && node && <StatusCycleButton node={node} onUpdate={onUpdate} t={t} />}
              </div>
            );
          })}
        </div>}

      {/* Vacations in horizon */}
      {vacationsInHorizon.length > 0 && (
        <>
          <div className="section-h">{t('bv.vacations')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {vacationsInHorizon.map((v, i) => {
              const member = members.find(m => m.id === v.person);
              if (!member) return null;
              if (personFilter && member.id !== personFilter) return null;
              const tm = teams.find(t => t.id === member.team);
              const wks = weeksBetween(localDate(v.from), localDate(v.to));
              return (
                <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '8px 12px', borderLeft: `3px solid ${tm?.color || 'var(--ac)'}` }}>
                  <span style={{ fontWeight: 600 }}>{member.name}</span>
                  <span style={{ color: 'var(--tx3)', marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>
                    {fmtDateDE(localDate(v.from))}–{fmtDateDE(localDate(v.to))}
                  </span>
                  {wks > 0 && <span style={{ color: 'var(--tx3)', marginLeft: 6, fontSize: 10 }}>({wks}w)</span>}
                  {v.note && <span style={{ color: 'var(--tx3)', marginLeft: 8, fontSize: 11 }}>{v.note}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══════ Per-person queues — now / next ══════ */}
      {personCards.length > 0 && (
        <>
          <div className="section-h">{t('bv.queues')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {personCards.map(card => {
              const myVacs = vacationsInHorizon.filter(v => v.person === card.personId);
              const renderItem = s => {
                const isWip = s.status === 'wip';
                const nodeItem = iMap[s.treeId || s.id];
                const allAssign = nodeItem?.assign || [];
                const others = allAssign.filter(id => id !== card.personId)
                  .map(id => members.find(m => m.id === id)?.name || id);
                const hasDeadline = nodeItem?.decideBy;
                const isOverdue = hasDeadline && localDate(nodeItem.decideBy) < now;
                const isStartingSoon = !isWip && s.startD && diffDays(now, s.startD) <= 3 && s.startD >= now;
                const primary = allAssign.map(id => shortMap[id] || (id || '').slice(0, 2).toUpperCase()).join('/') || shortMap[card.personId];
                return (
                  <div key={s.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: isWip ? 'rgba(34,197,94,.08)' : 'var(--bg3)', border: `1px solid ${isWip ? 'var(--gr)' : 'var(--b2)'}` }}
                    onClick={() => onOpenItem?.(s.id)}>
                    {nodeItem && <StatusCycleButton node={nodeItem} onUpdate={onUpdate} t={t} />}
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{s.id}</span>
                    {cpSet?.has(s.id) && <CriticalPathBadge id={s.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
                    <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </span>
                    {hasChain(s) && (
                      <span style={{ fontSize: 9, color: 'var(--am)', fontFamily: 'var(--mono)', fontWeight: 600, flexShrink: 0, padding: '1px 5px', border: '1px solid var(--am)', borderRadius: 3 }}
                        data-htip={chainTooltip(s, memberFullName)}>⇄ {chainShorts(s, shortMap, primary)}</span>
                    )}
                    {others.length > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--tx3)', flexShrink: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {others.join(', ')}
                      </span>
                    )}
                    {isStartingSoon && (
                      <span style={{ fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontFamily: 'var(--mono)' }}>
                        {t('bv.startsSoon')} {fmtDateDE(s.startD)}
                      </span>
                    )}
                    {hasDeadline && (
                      <span style={{ fontSize: 10, color: isOverdue ? 'var(--re)' : 'var(--tx3)', flexShrink: 0, fontFamily: 'var(--mono)' }}>
                        {isOverdue ? '⏰ ' : ''}{nodeItem.decideBy}
                      </span>
                    )}
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>
                      {s.effort?.toFixed(0)}d
                    </span>
                  </div>
                );
              };
              return (
                <div key={card.personId} style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '12px 14px', borderLeft: `3px solid ${card.teamColor}` }}>
                  {/* Person header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: card.teamColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {initials(card.name)}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{card.name}</span>
                    {card.teamName && <span style={{ fontSize: 11, color: card.teamColor, fontWeight: 500 }}>{card.teamName}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
                      {card.now.length + card.next.length} {t('bv.tasks')}
                    </span>
                  </div>

                  {myVacs.map((v, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--am)', marginBottom: 6, fontFamily: 'var(--mono)' }}>
                      {t('bv.onVacation')}: {fmtDateDE(localDate(v.from))}–{fmtDateDE(localDate(v.to))}
                      {v.note && ` · ${v.note}`}
                    </div>
                  ))}

                  {card.now.length > 0 && <>
                    <div style={{ fontSize: 9, color: 'var(--gr)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{t('bv.now')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: card.next.length ? 8 : 0 }}>
                      {card.now.map(renderItem)}
                    </div>
                  </>}
                  {card.next.length > 0 && <>
                    <div style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{t('bv.next')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {card.next.map(renderItem)}
                    </div>
                  </>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Upcoming milestones */}
      {milestones.length > 0 && (
        <>
          <div className="section-h">{t('bv.milestones')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {milestones.map(m => {
              const dl = localDate(m.date);
              const daysLeft = diffDays(now, dl);
              const st = stats?.[m.id];
              const projEndOk = st?._endD ? st._endD <= dl : true;
              return (
                <div key={m.id}
                  style={{ background: 'var(--bg2)', border: `1px solid ${projEndOk ? 'var(--b)' : 'var(--re)'}`, borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onClick={() => onOpenItem?.(m.id)}>
                  <span style={{ fontWeight: 700, flex: 1 }}>{m.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx2)' }}>{fmtDateFull(dl)}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: daysLeft <= 7 ? 'var(--re)' : 'var(--tx3)' }}>
                    {daysLeft === 0 ? t('bv.today') : `${daysLeft}d`}
                  </span>
                  {!projEndOk && <span className="badge bc">{t('s.atRisk')}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══════ Jira drift — the reconcile result as rows, not a dialog ══════ */}
      <div className="section-h" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {t('js.title')}
        <button className="btn btn-ghost btn-xs" style={{ padding: '1px 6px', fontSize: 10, marginLeft: 'auto' }}
          onClick={() => setJiraOpen(o => !o)}>
          {jiraOpen ? '▾' : '▸'} {jiraOpen ? t('js.tabCompare') : t('js.pasteLabel')}
        </button>
      </div>
      <div style={{ marginBottom: 18 }}>
        <p className="helper" style={{ marginTop: -4, marginBottom: 8, fontSize: 11 }}>
          {jiraFieldId
            ? t('js.fieldHint', (jiraFields.find(f => f.id === jiraFieldId)?.name || jiraFieldId))
            : <span style={{ color: 'var(--am)' }}>{t('js.noField')}</span>}
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--gr)' }} data-htip={t('js.tileLinkedTip')}>{jiraHealth.linked.length} {t('js.tileLinked')}</span>
          <span style={{ fontSize: 11, color: jiraHealth.unlinkedOpen.length ? 'var(--am)' : 'var(--tx3)' }} data-htip={t('js.tileUnlinkedTip')}>{jiraHealth.unlinkedOpen.length} {t('js.tileUnlinked')}</span>
          <span style={{ fontSize: 11, color: jiraHealth.duplicates.length ? 'var(--re)' : 'var(--tx3)' }} data-htip={t('js.tileDupesTip')}>{jiraHealth.duplicates.length} {t('js.tileDupes')}</span>
          {jiraResult && <>
            <span style={{ fontSize: 11, color: 'var(--gr)' }}>{jiraResult.matched} {t('js.tileMatched')}</span>
            <span style={{ fontSize: 11, color: jiraStatusDiff.length ? 'var(--am)' : 'var(--tx3)' }}>{jiraStatusDiff.length} {t('js.tileStatusDiff')}</span>
            <span style={{ fontSize: 11, color: jiraResult.missingInPlanr.length ? 'var(--ac)' : 'var(--tx3)' }}>{jiraResult.missingInPlanr.length} {t('js.tileOnlyJira')}</span>
            <span style={{ fontSize: 11, color: jiraResult.missingInJira.length ? 'var(--ac)' : 'var(--tx3)' }}>{jiraResult.missingInJira.length} {t('js.tileOnlyPlanr')}</span>
          </>}
        </div>

        {/* Link health — answerable from the plan alone, no paste needed
            (same two checks the old "Link check" tab ran). */}
        <JiraSection title={t('js.dupes')} tone="var(--re)" count={jiraHealth.duplicates.length} hint={t('js.dupesHint')}>
          {jiraHealth.duplicates.map(dupe => (
            <JiraRow key={dupe.key} id={dupe.key} name={dupe.ids.join(' · ')} onClick={() => onOpenItem?.(dupe.ids[0])} testId={`bv-jira-dupe-${dupe.key}`} />
          ))}
        </JiraSection>
        <JiraSection title={t('js.unlinkedOpen')} tone="var(--am)" count={jiraHealth.unlinkedOpen.length} hint={t('js.unlinkedHint')}>
          {jiraHealth.unlinkedOpen.slice(0, JIRA_MAX_ROWS).map(row => (
            <JiraRow key={row.id} id={row.id} name={row.name} onClick={() => onOpenItem?.(row.id)} testId={`bv-jira-unlinked-${row.id}`} />
          ))}
          {jiraHealth.unlinkedOpen.length > JIRA_MAX_ROWS && (
            <div style={{ fontSize: 9, color: 'var(--tx3)', textAlign: 'center', paddingTop: 2 }}>{t('js.more', jiraHealth.unlinkedOpen.length - JIRA_MAX_ROWS)}</div>
          )}
        </JiraSection>

        <JiraSection title={t('js.statusDiff')} tone="var(--am)" count={jiraStatusDiff.length} hint={t('js.statusDiffHint')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {jiraStatusDiff.map(diff => (
              <div key={diff.id + diff.key} data-testid={`bv-jira-diff-${diff.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}
                onClick={() => onOpenItem?.(diff.id)}>
                <input type="checkbox" checked={jiraAccepted.has(diff.id)} onClick={e => e.stopPropagation()} onChange={() => toggleJiraRow(diff.id)} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{diff.id}</span>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{diff.name}</span>
                <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{S_DOT[diff.planrStatus]} → {S_DOT[diff.target]} {diff.jiraStatus}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', width: 62, textAlign: 'right', flexShrink: 0 }}>{diff.key}</span>
              </div>
            ))}
            <button className="btn btn-pri btn-xs" style={{ alignSelf: 'flex-start', padding: '3px 10px', fontSize: 11, marginTop: 4 }}
              disabled={!jiraAccepted.size}
              data-testid="bv-jira-apply"
              onClick={() => applyJiraDiffs(jiraStatusDiff, jiraAccepted)}
              data-htip={t('js.applyTip')}>
              {t('js.apply', jiraAccepted.size)}
            </button>
          </div>
        </JiraSection>

        {/* Titles differ — reported only, never auto-applied (a rename is a
            judgment call, not a status). */}
        <JiraSection title={t('js.summaryDrift')} tone="var(--tx2)" count={jiraResult?.summaryDrift.length || 0} hint={t('js.summaryDriftHint')}>
          {(jiraResult?.summaryDrift || []).slice(0, JIRA_MAX_ROWS).map(row => (
            <JiraRow key={row.id} id={row.id} name={row.name} onClick={() => onOpenItem?.(row.id)}
              right={<span style={{ fontSize: 9, color: 'var(--tx3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('js.inJira')}: {row.jiraSummary}</span>} />
          ))}
        </JiraSection>
        <JiraSection title={t('js.onlyJira')} tone="var(--ac)" count={jiraResult?.missingInPlanr.length || 0} hint={t('js.onlyJiraHint')}>
          {(jiraResult?.missingInPlanr || []).slice(0, JIRA_MAX_ROWS).map(row => (
            <JiraRow key={row.key} id={row.key} name={row.summary || '—'}
              right={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {row.knownPlanrId && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--am)' }}>{t('js.linkTo', row.knownPlanrId)}</span>}
                {row.mapped && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{S_DOT[row.mapped]} {row.status}</span>}
              </span>} />
          ))}
        </JiraSection>
        <JiraSection title={t('js.onlyPlanr')} tone="var(--ac)" count={jiraResult?.missingInJira.length || 0} hint={t('js.onlyPlanrHint')}>
          {(jiraResult?.missingInJira || []).slice(0, JIRA_MAX_ROWS).map(row => (
            <JiraRow key={row.id} id={row.id} name={row.name} onClick={() => onOpenItem?.(row.id)}
              right={<span style={{ fontSize: 9, color: 'var(--tx3)' }}>{S_DOT[row.status]} {row.key}</span>} />
          ))}
        </JiraSection>

        {jiraOpen && (
          <div className="field">
            <label>{t('js.pasteLabel')}</label>
            <textarea
              value={jiraText}
              onChange={e => setJiraText(e.target.value)}
              placeholder={t('js.pastePlaceholder')}
              spellCheck={false}
              style={{ width: '100%', minHeight: 72, fontFamily: 'var(--mono)', fontSize: 10,
                background: 'var(--bg)', color: 'var(--tx2)', border: '1px solid var(--b)',
                borderRadius: 'var(--r)', padding: 8, resize: 'vertical' }} />
            {jiraParsed && (
              <div style={{ fontSize: 9, color: jiraParsed.error ? 'var(--re)' : 'var(--tx3)', marginTop: 3 }}>
                {jiraParsed.error === 'noKeyColumn' ? t('js.errNoKey')
                  : jiraParsed.error === 'noRows' ? t('js.errNoRows')
                  : `${t(jiraParsed.rows.length === 1 ? 'js.parsed1' : 'js.parsed', jiraParsed.rows.length)}${jiraParsed.skipped ? ` · ${t(jiraParsed.skipped === 1 ? 'js.skipped1' : 'js.skipped', jiraParsed.skipped)}` : ''}`}
              </div>
            )}
          </div>
        )}

        {jiraResult
          ? (!jiraStatusDiff.length && !jiraResult.summaryDrift.length && !jiraResult.missingInPlanr.length && !jiraResult.missingInJira.length && (
            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{t('js.inSync')}</div>
          ))
          : (!jiraHealth.unlinkedOpen.length && !jiraHealth.duplicates.length && (
            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{t('js.allClean')}</div>
          ))}
      </div>
    </div>
  );
}

export const BriefingView = memo(BriefingViewImpl);
