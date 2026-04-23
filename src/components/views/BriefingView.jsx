import { useMemo, useState } from 'react';
import { iso, localDate, diffDays } from '../../utils/date.js';
import { leafNodes, isLeafNode } from '../../utils/scheduler.js';
import { deadlineScopedScheduledItems } from '../../utils/deadlines.js';
import { CriticalPathBadge } from '../shared/CriticalPathBadge.jsx';
import { useT } from '../../i18n.jsx';

const S_DOT = { open: '○', wip: '◐', done: '✓' };
const S_COLOR = { open: 'var(--tx3)', wip: 'var(--am)', done: 'var(--gr)' };

// Week boundaries (Mon–Sun) for a given date
function weekBounds(d) {
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { mon, sun };
}

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

export function BriefingView({ tree, scheduled, vacations, members, teams, stats, confidence = {}, cpSet, cpLabels = {}, rootFilter, teamFilter, personFilter, onOpenItem, onExportTodo }) {
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

  // Filter helpers
  const filteredScheduled = useMemo(() => {
    let items = scheduled;
    if (rootFilter) items = items.filter(s => s.id === rootFilter || s.id.startsWith(rootFilter + '.'));
    if (teamFilter) items = items.filter(s => s.team === teamFilter);
    if (personFilter) items = items.filter(s => (s.personId === personFilter) || (s.assign || []).includes(personFilter));
    return items;
  }, [scheduled, rootFilter, teamFilter, personFilter]);

  const filteredMembers = useMemo(() => {
    if (personFilter) return members.filter(m => m.id === personFilter);
    if (teamFilter) return members.filter(m => m.team === teamFilter);
    return members;
  }, [members, personFilter, teamFilter]);

  // Vacations in horizon
  const vacationsInHorizon = useMemo(() => {
    return vacations.filter(v => {
      if (!v.from || !v.to) return false;
      const vFrom = localDate(v.from);
      const vTo = localDate(v.to);
      return vFrom <= horizonEnd && vTo >= now;
    });
  }, [vacations, now, horizonEnd]);

  // Active / upcoming scheduled items per person
  // "active" = status != done AND (startD within horizon OR already started and not done)
  const personCards = useMemo(() => {
    const cards = new Map();

    filteredScheduled.forEach(s => {
      if (s.status === 'done') return;
      const isInHorizon = (s.startD && s.startD <= horizonEnd) && (s.endD && s.endD >= now);
      const isAlreadyRunning = s.startD && s.startD < now && s.endD && s.endD >= now;
      if (!isInHorizon && !isAlreadyRunning) return;

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
          items: [],
        });
      }
      cards.get(personId).items.push(s);
    });

    // Sort items within each card by startD
    for (const card of cards.values()) {
      card.items.sort((a, b) => (a.startD || 0) - (b.startD || 0));
    }

    // Sort cards: by teamColor then name
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

  // At-risk: past due or close to deadline
  const atRisk = useMemo(() => {
    const items = [];
    // Leaf items past their decideBy date
    leafNodes(tree).forEach(n => {
      if (n.status === 'done') return;
      if (n.decideBy && localDate(n.decideBy) < now) {
        items.push({ id: n.id, name: n.name, reason: 'overdue', date: n.decideBy, status: n.status });
      }
    });
    // Exploratory items with deadline within 7 days
    filteredScheduled.forEach(s => {
      if (s.status === 'done') return;
      const conf = confidence[s.id];
      if (conf !== 'exploratory') return;
      const node = tree.find(r => r.id === s.id);
      if (node?.decideBy) {
        const days = diffDays(now, localDate(node.decideBy));
        if (days >= 0 && days <= 7) {
          if (!items.find(x => x.id === s.id)) {
            items.push({ id: s.id, name: s.name, reason: 'exploratory-close', date: node.decideBy, status: s.status });
          }
        }
      }
    });
    // Root items whose projected end exceeds their deadline
    tree.filter(r => !r.id.includes('.') && r.date).forEach(r => {
      if (r.status === 'done') return;
      const dl = localDate(r.date);
      const linked = r.type === 'deadline'
        ? deadlineScopedScheduledItems(tree, filteredScheduled, r.id)
        : filteredScheduled.filter(s => s.id.startsWith(r.id + '.'));
      const maxEnd = linked.length > 0 ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
      if (maxEnd && maxEnd > dl) {
        items.push({ id: r.id, name: r.name, reason: 'late', date: r.date, projEnd: maxEnd, status: r.status || 'open' });
      }
    });
    return items;
  }, [tree, filteredScheduled, now, confidence, stats]);

  const today = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const noContent = personCards.length === 0 && milestones.length === 0 && atRisk.length === 0 && vacationsInHorizon.length === 0;
  const activeItemsCount = personCards.reduce((sum, card) => sum + card.items.length, 0);
  const summaryCards = [
    { label: t('bv.activeItems'), value: activeItemsCount, tone: 'var(--ac)' },
    { label: t('bv.activePeople'), value: personCards.length, tone: 'var(--gr)' },
    { label: t('bv.upcomingCount'), value: milestones.length, tone: 'var(--am)' },
    { label: t('bv.riskCount'), value: atRisk.length, tone: atRisk.length ? 'var(--re)' : 'var(--tx3)' },
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

      {/* Vacations in horizon */}
      {vacationsInHorizon.length > 0 && (
        <>
          <div className="section-h" style={{ marginTop: 0 }}>{t('bv.vacations')}</div>
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

      {/* Per-person cards */}
      {personCards.length > 0 && (
        <>
          <div className="section-h" style={{ marginTop: 0 }}>{t('bv.activeWork')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {personCards.map(card => {
              const myVacs = vacationsInHorizon.filter(v => v.person === card.personId);
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
                      {card.items.length} {t('bv.tasks')}
                    </span>
                  </div>

                  {/* Vacation notice if any */}
                  {myVacs.map((v, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--am)', marginBottom: 6, fontFamily: 'var(--mono)' }}>
                      {t('bv.onVacation')}: {fmtDateDE(localDate(v.from))}–{fmtDateDE(localDate(v.to))}
                      {v.note && ` · ${v.note}`}
                    </div>
                  ))}

                  {/* Task list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {card.items.map(s => {
                      const isWip = s.status === 'wip';
                      const isStartingSoon = s.startD && diffDays(now, s.startD) <= 3 && s.startD >= now;
                      const nodeItem = tree.find(r => r.id === s.id);

                      // Co-assignees
                      const allAssign = nodeItem?.assign || [];
                      const others = allAssign.filter(id => id !== card.personId)
                        .map(id => members.find(m => m.id === id)?.name || id);

                      const hasDeadline = nodeItem?.decideBy;
                      const isOverdue = hasDeadline && localDate(nodeItem.decideBy) < now;
                      const sc = { ...s };

                      return (
                        <div key={s.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: isWip ? 'rgba(34,197,94,.08)' : 'var(--bg3)', border: `1px solid ${isWip ? 'var(--gr)' : 'var(--b2)'}` }}
                          onClick={() => onOpenItem?.(s.id)}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{s.id}</span>
                          <span style={{ color: S_COLOR[s.status], fontSize: 12, flexShrink: 0 }}>{S_DOT[s.status]}</span>
                          {cpSet?.has(s.id) && <CriticalPathBadge id={s.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
                          <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.name}
                          </span>
                          {others.length > 0 && (
                            <span style={{ fontSize: 10, color: 'var(--tx3)', flexShrink: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {others.join(', ')}
                            </span>
                          )}
                          {isStartingSoon && !isWip && (
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
                    })}
                  </div>
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

      {/* Risks / At-risk */}
      {atRisk.length > 0 && (
        <>
          <div className="section-h">{t('bv.risks')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {atRisk.map(r => (
              <div key={r.id}
                style={{ background: 'var(--bg2)', border: '1px solid var(--re)', borderLeft: '3px solid var(--re)', borderRadius: 'var(--r)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => onOpenItem?.(r.id)}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--re)', flexShrink: 0 }}>{r.id}</span>
                <span style={{ flex: 1, fontWeight: 500, fontSize: 12 }}>{r.name}</span>
                <span style={{ fontSize: 11, color: 'var(--re)', flexShrink: 0 }}>
                  {r.reason === 'overdue' && t('bv.overdue')}
                  {r.reason === 'late' && t('bv.lateEnd')}
                  {r.reason === 'exploratory-close' && t('bv.exploratoryDeadline')}
                </span>
                {r.date && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{r.date}</span>}
                {r.projEnd && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--re)', flexShrink: 0 }}>→ {iso(r.projEnd)}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
