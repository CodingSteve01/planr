import { useMemo, useState, useEffect, useRef, memo } from 'react';
import { localDate } from '../../utils/date.js';
import { computeAttention, attentionCounts } from '../../utils/attention.js';
import { detectJiraFieldId, linkHealth, parseJiraTable, reconcile, statusPatches } from '../../utils/jiraSync.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { buildMemberShortMap } from '../../App.jsx';
import { useT } from '../../i18n.jsx';
import { inTeam } from '../../utils/memberTeams.js';
import { BRIEFING_JOB_EVENT } from '../../utils/events.js';
import { AttentionSection } from './briefing/AttentionSection.jsx';
import { VacationsSection } from './briefing/VacationsSection.jsx';
import { QueuesSection } from './briefing/QueuesSection.jsx';
import { MilestonesSection } from './briefing/MilestonesSection.jsx';
import { JiraDriftSection } from './briefing/JiraDriftSection.jsx';

function BriefingViewImpl({
  tree,
  scheduled,
  vacations,
  members,
  teams,
  stats,
  confidence = {},
  cpSet,
  cpLabels = {},
  rootFilter,
  teamFilter,
  personFilter,
  hideDone = false,
  horizonIds = null,
  diffChangedIds = null,
  diffVisibleIds = null,
  customFields,
  onOpenItem,
  onUpdate,
  onApplyStatus,
  onExportTodo,
}) {
  const { t } = useT();

  const HORIZON_OPTS = [
    { id: '7', label: t('bv.thisWeek') },
    { id: '14', label: t('bv.next2weeks') },
    { id: '28', label: t('bv.next4weeks') },
  ];

  const [horizonDays, setHorizonDays] = useState(() => {
    try {
      return +(localStorage.getItem('planr_briefing_horizon') || '14');
    } catch {
      return 14;
    }
  });
  const setHd = v => {
    setHorizonDays(v);
    try {
      localStorage.setItem('planr_briefing_horizon', String(v));
    } catch {}
  };

  const now = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const horizonEnd = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + horizonDays);
    return d;
  }, [now, horizonDays]);

  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const shortMap = useMemo(() => buildMemberShortMap(members), [members]);
  const memberFullName = id => members.find(m => m.id === id)?.name || id || '?';

  // Filter helpers
  const filteredScheduled = useMemo(() => {
    let items = scheduled;
    if (rootFilter) items = items.filter(s => s.id === rootFilter || s.id.startsWith(rootFilter + '.'));
    if (teamFilter) items = items.filter(s => s.team === teamFilter);
    if (personFilter) items = items.filter(s => s.personId === personFilter || (s.assign || []).includes(personFilter));
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
  // Reconciling Jira is a weekly job, and it used to live two thirds down this
  // screen behind a collapsed section. The command opens the section and puts
  // the cursor in the box, so the job starts with a paste.
  const jiraBoxRef = useRef(null);
  const [focusJira, setFocusJira] = useState(false);
  useEffect(() => {
    const onJob = e => {
      if (e.detail?.job !== 'jira') return;
      setJiraOpen(true);
      setFocusJira(true);
    };
    window.addEventListener(BRIEFING_JOB_EVENT, onJob);
    return () => window.removeEventListener(BRIEFING_JOB_EVENT, onJob);
  }, []);
  // A flag rather than a `setTimeout(…, 0)` after opening the section. The
  // timeout won a race it had no business being in: the box does not exist
  // until the section has rendered, and if React re-rendered it again after
  // the tick the focus went with it. This runs when the box is actually there.
  useEffect(() => {
    if (!focusJira || !jiraOpen || !jiraBoxRef.current) return;
    jiraBoxRef.current.focus();
    setFocusJira(false);
  }, [focusJira, jiraOpen]);
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
  const toggleJiraRow = id =>
    setJiraRejected(prev => {
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
  const attentionItems = useMemo(
    () =>
      computeAttention({
        tree,
        scheduled,
        confidence,
        now,
        rootFilter,
        teamFilter,
        personFilter,
        driftItems: jiraStatusDiff.map(d => ({ id: d.id, name: d.name, key: d.key, target: d.target, jiraStatus: d.jiraStatus })),
      }),
    [tree, scheduled, confidence, now, rootFilter, teamFilter, personFilter, jiraStatusDiff],
  );
  const [expandedAttn, setExpandedAttn] = useState(() => new Set());
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
          if (!inTeam(m, teamFilter)) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredScheduled, members, teams, now, horizonEnd, personFilter, teamFilter]);

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
          <span style={{ fontSize: 12, color: 'var(--tx3)', marginRight: 4 }}>{t('bv.horizon')}</span>
          {HORIZON_OPTS.map(h => (
            <button
              key={h.id}
              className={`btn btn-xs ${horizonDays === +h.id ? 'btn-pri' : 'btn-sec'}`}
              style={{ padding: '3px 8px', fontSize: 12 }}
              onClick={() => setHd(+h.id)}
            >
              {h.label}
            </button>
          ))}
          {onExportTodo && (
            <button
              className="btn btn-sec btn-xs"
              style={{ padding: '3px 8px', fontSize: 12, marginLeft: 6 }}
              onClick={() => onExportTodo(horizonDays)}
              data-htip={t('bv.exportTodoHint')}
            >
              {t('bv.exportTodo')}
            </button>
          )}
        </div>
      </div>

      {/* 132px, not 150: with five figures and a 150px floor only four fit a
          normal pane, so the fifth wrapped alone and stretched to the full
          width — one card three times the size of its neighbours, which
          reads as emphasis it does not have. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 8, marginBottom: 18 }}>
        {summaryCards.map(card => (
          <div key={card.label} className="sum-card" style={{ minWidth: 0 }}>
            <div className="sum-v" style={{ color: card.tone }}>
              {card.value}
            </div>
            <div className="sum-l">{card.label}</div>
          </div>
        ))}
      </div>

      {noContent && (
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--b)',
            borderRadius: 'var(--r)',
            padding: '24px 20px',
            textAlign: 'center',
            color: 'var(--tx3)',
            fontSize: 13,
          }}
        >
          {t('bv.noActivity')}
        </div>
      )}

      <AttentionSection
        attentionItems={attentionItems}
        attnCounts={attnCounts}
        expandedAttn={expandedAttn}
        setExpandedAttn={setExpandedAttn}
        iMap={iMap}
        tree={tree}
        onOpenItem={onOpenItem}
        onUpdate={onUpdate}
        applyJiraDiffs={applyJiraDiffs}
      />

      {/* Vacations in horizon */}
      {vacationsInHorizon.length > 0 && (
        <VacationsSection vacationsInHorizon={vacationsInHorizon} members={members} teams={teams} personFilter={personFilter} />
      )}

      {/* ══════ Per-person queues — now / next ══════ */}
      {personCards.length > 0 && (
        <QueuesSection
          personCards={personCards}
          vacationsInHorizon={vacationsInHorizon}
          iMap={iMap}
          members={members}
          shortMap={shortMap}
          now={now}
          cpSet={cpSet}
          cpLabels={cpLabels}
          memberFullName={memberFullName}
          onOpenItem={onOpenItem}
          onUpdate={onUpdate}
        />
      )}

      {/* Upcoming milestones */}
      {milestones.length > 0 && <MilestonesSection milestones={milestones} now={now} stats={stats} onOpenItem={onOpenItem} />}

      <JiraDriftSection
        jiraOpen={jiraOpen}
        setJiraOpen={setJiraOpen}
        jiraFields={jiraFields}
        jiraFieldId={jiraFieldId}
        jiraHealth={jiraHealth}
        jiraResult={jiraResult}
        jiraStatusDiff={jiraStatusDiff}
        jiraAccepted={jiraAccepted}
        toggleJiraRow={toggleJiraRow}
        applyJiraDiffs={applyJiraDiffs}
        onOpenItem={onOpenItem}
        jiraBoxRef={jiraBoxRef}
        jiraText={jiraText}
        setJiraText={setJiraText}
        jiraParsed={jiraParsed}
      />
    </div>
  );
}

export const BriefingView = memo(BriefingViewImpl);
