import { useMemo, useState, memo } from "react";
import { TBadge } from '../shared/Badges.jsx';
import { leafNodes, re, resolveToLeafIds, treeStats } from '../../utils/scheduler.js';
import { iso, diffDays } from '../../utils/date.js';
import { horizonLabel } from '../../utils/horizon.js';
import { GT, GL } from '../../constants.js';
import { deadlineScopedScheduledItems } from '../../utils/deadlines.js';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { useT } from '../../i18n.jsx';
import { Roadmap } from '../shared/Roadmap.jsx';
import { TimetableView } from './TimetableView.jsx';
import { stateAsOf } from '../../utils/history.js';
import { ViewFilters } from '../shared/ViewFilters.jsx';
import { aggregateSollIst } from '../../utils/sollIst.js';

const ORDER = ['goal', 'painpoint', 'deadline'];
const BC = { goal: 'var(--ac)', painpoint: 'var(--am)', deadline: 'var(--re)' };

function SumViewImpl({ tree, scheduled, goals, members, teams, cpSet, goalPaths, stats, confidence = {}, historyEvents = [], sinceDays = '', persistSince, sinceDate = null, diff = null, diffOnlyChanged = false, persistDiffOnlyChanged, horizonDays = '', persistHorizon, horizonEnd = null, horizonIds = null, horizonOnlyPlanned = true, persistHorizonOnly, futureProgressByRootId = null, workDays = null, holidayIso = null, onNavigate, onOpenItem, onExportTodo }) {
  const { t, lang } = useT();
  const isDe = lang === 'de';
  const lvs = leafNodes(tree);
  const done = lvs.filter(r => r.status === 'done').length;
  const wip = lvs.filter(r => r.status === 'wip').length;
  const open = lvs.filter(r => r.status === 'open').length;
  const tR = lvs.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
  const prog = lvs.length > 0 ? (done / lvs.length) * 100 : 0;
  const latE = scheduled.length > 0 ? scheduled.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
  const byT = {}; scheduled.forEach(s => { if (!byT[s.team]) byT[s.team] = { t: 0, pt: 0 }; byT[s.team].t++; byT[s.team].pt += s.effort; });

  // Sprint horizon (next-N-days) — for the "Up next" planning view.
  // Distinct from the project-wide HorizonPicker; this is a local control
  // for the upcoming-sprint table.
  const [sprintDays, setSprintDays] = useState(() => { try { return +localStorage.getItem('planr_sprint_horizon') || 30; } catch { return 30; } });
  const setHd = v => { setSprintDays(v); try { localStorage.setItem('planr_sprint_horizon', String(v)); } catch {} };
  const sprintEnd = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + sprintDays); return d; }, [sprintDays]);
  const now = new Date();
  const h1Weeks = useMemo(() => { try { return +localStorage.getItem('planr_h1_weeks') || 8; } catch { return 8; } }, []);
  const h2Weeks = useMemo(() => { try { return +localStorage.getItem('planr_h2_weeks') || 18; } catch { return 18; } }, []);
  const h1Date = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + h1Weeks * 7); return date; }, [h1Weeks]);
  const h2Date = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + h2Weeks * 7); return date; }, [h2Weeks]);
  // Collect: scheduled tasks that are not done and start within the horizon (or are already in progress)
  const upcoming = useMemo(() => scheduled
    .filter(s => s.status !== 'done' && s.startD && s.startD <= sprintEnd)
    .sort((a, b) => (a.startD - b.startD) || (a.prio || 4) - (b.prio || 4))
  , [scheduled, sprintEnd]);
  // Group by person (with NO_PERSON bucket per team)
  const sprintGroups = useMemo(() => {
    const groups = new Map();
    upcoming.forEach(s => {
      const key = s.personId || `team:${s.team || 'none'}`;
      if (!groups.has(key)) {
        const tName = teams.find(tm => tm.id === s.team)?.name || s.team || t('noTeam');
        groups.set(key, { key, label: s.personId ? s.person : `${tName} ${t('pc.unassigned')}`, isPerson: !!s.personId, color: s.personId ? 'var(--ac)' : 'var(--tx3)', items: [] });
      }
      groups.get(key).items.push(s);
    });
    return [...groups.values()].sort((a, b) => a.isPerson === b.isPerson ? a.label.localeCompare(b.label) : a.isPerson ? -1 : 1);
  }, [upcoming, teams]);
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const timelineById = useMemo(
    () => Object.fromEntries(tree.map(node => [node.id, summarizeNodeTimeline(tree, scheduled, node)])),
    [tree, scheduled],
  );

  const grouped = ORDER.map(tp => ({ type: tp, items: goals.filter(g => g.type === tp) })).filter(g => g.items.length);

  // `sinceDays`, `persistSince`, `sinceDate` now flow in from App.jsx so the
  // diff state is shared across all views (Roadmap, Tree, Timetable, Gantt,
  // Network). The picker UI lives in RoadmapSwitcher / TreeView toolbars.

  // Effort-weighted overall progress AT the cutoff. Mirrors the live
  // `prog` calculation (`done / totalLeaves * 100`) but with each leaf's
  // status replaced by its state at the cutoff. New leaves count as 0%.
  const pastOverallProg = useMemo(() => {
    if (!sinceDate || !historyEvents.length) return null;
    const past = stateAsOf(historyEvents, sinceDate);
    let total = 0, doneCount = 0;
    for (const lf of lvs) {
      total++;
      const p = past.get(lf.id);
      if (p?.status === 'done') doneCount++;
    }
    return total > 0 ? (doneCount / total) * 100 : 0;
  }, [historyEvents, sinceDate, lvs]);
  const overallDelta = pastOverallProg != null ? prog - pastOverallProg : null;

  return <div style={{ maxWidth: 960, margin: '0 auto' }}>
    {/* Progress header */}
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: 'var(--gr)' }}>{prog.toFixed(0)}%</span>
      {overallDelta != null && overallDelta > 0.05 && (
        <span data-htip={t('diff.tipPastNow', pastOverallProg.toFixed(1), iso(sinceDate), prog.toFixed(1))}
          style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: '#f59e0b',
            background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.5)',
            borderRadius: 4, padding: '2px 7px', cursor: 'help' }}>
          +{overallDelta.toFixed(1)}%
        </span>
      )}
      {overallDelta != null && overallDelta <= 0.05 && overallDelta >= -0.05 && (
        <span data-htip={t('diff.noMovement')}
          style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--tx3)',
            background: 'var(--bg3)', border: '1px solid var(--b)',
            borderRadius: 4, padding: '2px 7px', cursor: 'help' }}>
          ±0%
        </span>
      )}
      <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{t('s.doneOf', done, wip, open, lvs.length)}</span>
      {latE && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx3)', marginLeft: 'auto' }} data-htip={iso(latE)}>{t('s.projected')}: {horizonLabel(latE, null, isDe, now)}</span>}
    </div>
    <div className="prog-wrap" style={{ height: 6, marginBottom: 16, position: 'relative' }}>
      <div className="prog-fill" style={{ width: `${prog}%` }} />
      {/* Past-progress marker: thin vertical line on the bar showing where
          progress sat at the cutoff. Makes the gained delta tangible. */}
      {pastOverallProg != null && pastOverallProg < prog - 0.05 && (
        <div data-htip={t('diff.tipPastNow', pastOverallProg.toFixed(1), iso(sinceDate), prog.toFixed(1))}
          style={{ position: 'absolute', left: `${pastOverallProg}%`, top: -2, bottom: -2,
            width: 2, background: '#f59e0b', opacity: 0.85, cursor: 'help' }} />
      )}
    </div>

    {/* Roadmap + Fahrplan — switchable sub-views sharing the same data. */}
    <RoadmapSwitcher tree={tree} scheduled={scheduled} stats={stats} goals={goals}
      teams={teams} members={members} onOpenItem={onOpenItem}
      historyEvents={historyEvents}
      sinceDays={sinceDays} persistSince={persistSince} sinceDate={sinceDate} diff={diff}
      diffOnlyChanged={diffOnlyChanged} persistDiffOnlyChanged={persistDiffOnlyChanged}
      horizonDays={horizonDays} persistHorizon={persistHorizon} horizonEnd={horizonEnd} horizonIds={horizonIds}
      horizonOnlyPlanned={horizonOnlyPlanned} persistHorizonOnly={persistHorizonOnly}
      futureProgressByRootId={futureProgressByRootId}
      workDays={workDays} holidayIso={holidayIso} />

    {/* Planning confidence */}
    {(() => {
      const cc = { committed: 0, estimated: 0, exploratory: 0 };
      const ccPt = { committed: 0, estimated: 0, exploratory: 0 };
      lvs.filter(r => r.status !== 'done').forEach(r => {
        const c = confidence[r.id] || 'committed';
        cc[c]++;
        ccPt[c] += re(r.best || 0, r.factor || 1.5);
      });
      const total = cc.committed + cc.estimated + cc.exploratory;
      if (!total) return null;
      return <div style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>{t('s.planConfidence')}</span>
          <span style={{ fontSize: 10, color: 'var(--tx3)', cursor: 'pointer' }} onClick={() => onNavigate?.(null, 'plan')}>{t('s.openPlanReview')}</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 10, background: 'var(--bg4)' }}>
          {cc.committed > 0 && <div style={{ width: `${cc.committed / total * 100}%`, background: 'var(--gr)', transition: 'width .3s' }} />}
          {cc.estimated > 0 && <div style={{ width: `${cc.estimated / total * 100}%`, background: 'var(--am)', transition: 'width .3s' }} />}
          {cc.exploratory > 0 && <div style={{ width: `${cc.exploratory / total * 100}%`, background: 'var(--tx3)', transition: 'width .3s' }} />}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
          <span style={{ color: 'var(--gr)' }}>● {cc.committed} {t('conf.committed').toLowerCase()} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>({ccPt.committed.toFixed(0)} PT)</span></span>
          <span style={{ color: 'var(--am)' }}>◐ {cc.estimated} {t('conf.estimated').toLowerCase()} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>({ccPt.estimated.toFixed(0)} PT)</span></span>
          <span style={{ color: 'var(--tx3)' }}>○ {cc.exploratory} {t('conf.exploratory').toLowerCase()} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>({ccPt.exploratory > 0 ? ccPt.exploratory.toFixed(0) + ' PT' : '? PT'})</span></span>
        </div>
      </div>;
    })()}

    {/* Pulse Check — actionable warnings instead of static horizon explainer */}
    {(() => {
      const notDone = scheduled.filter(s => s.status !== 'done');
      const inH1 = notDone.filter(s => s.startD && s.startD <= h1Date);
      const inH2 = notDone.filter(s => s.startD && s.startD > h1Date && s.startD <= h2Date);
      const h1NoAssign = inH1.filter(s => !s.personId);
      const h1NoEstimate = inH1.filter(s => { const n = iMap[s.id]; return !n?.best || n.best === 0; });
      const h2Exploratory = inH2.filter(s => confidence[s.id] === 'exploratory');
      const blockedNoOwner = notDone.filter(s => {
        if (s.personId) return false;
        const n = iMap[s.id];
        const deps = n?.deps || [];
        return deps.some(d => { const dt = tree.find(r => r.id === d); return dt && dt.status !== 'done'; });
      });
      const deadlinesAtRisk = goals.filter(g => {
        if (g.type !== 'deadline' || !g.date) return false;
        const linked = deadlineScopedScheduledItems(tree, scheduled, g.id);
        const maxEnd = linked.length > 0 ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
        return maxEnd && new Date(g.date) < maxEnd;
      });
      const checks = [
        h1NoAssign.length > 0 && { warn: true, text: t('pc.h1NoPerson', h1NoAssign.length), items: h1NoAssign },
        h1NoEstimate.length > 0 && { warn: true, text: t('pc.h1NoEstimate', h1NoEstimate.length), items: h1NoEstimate },
        h2Exploratory.length > 0 && { warn: true, text: t('pc.h2Exploratory', h2Exploratory.length), items: h2Exploratory },
        blockedNoOwner.length > 0 && { warn: true, text: t('pc.blockedNoPerson', blockedNoOwner.length), items: blockedNoOwner },
        deadlinesAtRisk.length > 0 && { warn: true, text: t('pc.deadlinesAtRisk', deadlinesAtRisk.length), items: deadlinesAtRisk },
      ].filter(Boolean);
      const allClear = checks.length === 0;

      return <div style={{ background: 'var(--bg2)', border: `1px solid ${allClear ? 'var(--gr)' : 'var(--am)'}`, borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: checks.length ? 10 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: allClear ? 'var(--gr)' : 'var(--am)' }}>{t('pc.title')}</span>
          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--gr)' }}>H1 {iso(h1Date)}</span>
            <span style={{ color: 'var(--am)' }}>H2 {iso(h2Date)}</span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)', cursor: 'pointer' }} onClick={() => onNavigate?.(null, 'plan')}>{t('s.openPlanReview')}</span>
        </div>
        {allClear && <div style={{ fontSize: 12, color: 'var(--gr)' }}>{t('pc.allClear')}</div>}
        {checks.map((c, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
          <span style={{ color: 'var(--am)', flexShrink: 0 }}>⚠</span>
          <span style={{ color: 'var(--tx)' }}>{c.text}</span>
          {c.items?.[0]?.id && <span style={{ fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)', cursor: 'pointer' }}
            onClick={() => onNavigate?.(c.items[0].id, 'tree')}>→ {c.items[0].id}</span>}
        </div>)}
      </div>;
    })()}

    {/* Team effort - compact */}
    <div className="section-h">{t('s.resources')}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
      <div className="sum-card" style={{ minWidth: 80 }}><div className="sum-v">{members.length}</div><div className="sum-l">{t('s.people')}</div></div>
      <div className="sum-card" style={{ minWidth: 80 }}><div className="sum-v" style={{ color: 'var(--gr)' }}>{tR.toFixed(0)}</div><div className="sum-l">{t('s.totalPt')}</div></div>
      {Object.entries(byT).sort().map(([tk, d]) => { const team = teams.find(x => x.id === tk);
        return <div key={tk} className="sum-card" style={{ minWidth: 100 }}>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 2 }}>{team?.name || tk}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: team?.color || 'var(--tx)' }}>{d.pt.toFixed(0)} PT</div>
          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{d.t} {t('s.tasks')}</div>
        </div>; })}
    </div>

    {/* Focus */}
    <div className="section-h" style={{ marginTop: 0 }}>{t('s.focus')}</div>
    {grouped.map(g => <div key={g.type}>
      <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)', margin: '10px 0 4px' }}>{GT[g.type]} {t(g.type + 's')}</div>
      {g.items.map(dl => {
        const gp = goalPaths?.[dl.id];
        const st = stats?.[dl.id];
        const timeline = timelineById[dl.id];
        const linked = dl.type === 'deadline'
          ? deadlineScopedScheduledItems(tree, scheduled, dl.id)
          : scheduled.filter(s => s.id.startsWith(dl.id + '.'));
        const maxEnd = dl.type === 'deadline'
          ? (timeline?.deadline?.end || timeline?.period?.end || null)
          : (timeline?.period?.end || (linked.length > 0 ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null));
        const dlDate = dl.date ? new Date(dl.date) : null;
        const isLate = maxEnd && dlDate && dlDate < maxEnd;
        const daysLeft = dlDate ? diffDays(new Date(), dlDate) : null;
        const gpDone = gp ? gp.needed.filter(id => tree.find(x => x.id === id)?.status === 'done').length : 0;
        const gpProg = gp && gp.needed.length ? Math.round(gpDone / gp.needed.length * 100) : 0;
        const borderC = dl.type === 'painpoint' ? 'var(--am)' : isLate ? 'var(--re)' : BC[dl.type] || 'var(--b)';

        return <div key={dl.id} style={{ background: 'var(--bg2)', border: `1px solid ${isLate && dl.type === 'deadline' ? 'var(--re)' : 'var(--b)'}`, borderLeft: `3px solid ${borderC}`, borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13 }}>{GT[dl.type]}</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{dl.name}</span>
            {dlDate && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{dl.date}</span>}
            {dlDate && daysLeft >= 0 && <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{t('pc.dLeft', daysLeft)}</span>}
            <span style={{ marginLeft: 'auto' }}>
              {dl.type === 'deadline' && isLate ? <span className="badge bc">{t('s.atRisk')}</span> : dl.type === 'deadline' && maxEnd ? <span className="badge bd">{t('s.onTrack')}</span> : null}
              {dl.type !== 'deadline' && linked.length > 0 && <span className="badge bo">{linked.length} {t('s.linked')}</span>}
            </span>
          </div>
          {dl.description && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>{dl.description}</div>}
          {timeline?.period?.end && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10, color: 'var(--tx3)', marginBottom: 8, fontFamily: 'var(--mono)' }}>
              <span data-htip={iso(timeline.period.start) + ' → ' + iso(timeline.period.end)}>{t('ins.period')}: {horizonLabel(timeline.period.start, null, isDe, now)} → {horizonLabel(timeline.period.end, null, isDe, now)}</span>
              {timeline.deadline && <span data-htip={iso(timeline.deadline.start) + ' → ' + iso(timeline.deadline.end)}>{t('qe.affectsDeadline')}: {horizonLabel(timeline.deadline.start, null, isDe, now)} → {horizonLabel(timeline.deadline.end, null, isDe, now)}</span>}
            </div>
          )}
          {gp && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx3)', marginBottom: 3 }}>
              <span>{t('s.tasksDone', gpDone + '/' + gp.needed.length, gp.critical.size)}</span>
              <span>{gpProg}%</span>
            </div>
            <div className="prog-wrap"><div className="prog-fill" style={{ width: `${gpProg}%`, background: dl.severity === 'critical' ? 'var(--re)' : 'var(--am)' }} /></div>
            {gp.critical.size > 0 && <div style={{ marginTop: 6, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {[...gp.critical].slice(0, 6).map(id => { const r = tree.find(x => x.id === id); return <span key={id} style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--re)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3, cursor: 'pointer' }} onClick={() => onNavigate?.(id, 'tree')} data-htip={r?.name}>{id}</span>; })}
              {gp.critical.size > 6 && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>+{gp.critical.size - 6}</span>}
            </div>}
          </>}
        </div>;
      })}
    </div>)}

    {/* Project breakdown */}
    {tree.filter(r => r.lvl === 1).length > 0 && <>
      <div className="section-h">{t('s.topItems')}</div>
      <table className="tree-tbl">
        <thead><tr><th>Item</th><th className="r">{t('s.effort')}</th><th className="r">{t('s.progress')}</th><th>{t('s.projected')}</th></tr></thead>
        <tbody>{tree.filter(r => r.lvl === 1).map(r => { const s = stats[r.id] || r;
          const timeline = timelineById[r.id];
          const leaves = lvs.filter(c => c.id === r.id || c.id.startsWith(r.id + '.'));
          const done = leaves.filter(l => l.status === 'done').length;
          const prog = leaves.length > 0 ? Math.round(done / leaves.length * 100) : 0;
          return <tr key={r.id} className="tr l1" style={{ cursor: 'pointer' }} onClick={() => onNavigate?.(r.id, 'tree')}>
            <td><span className="tid">{r.id}</span><span style={{ marginLeft: 8 }}>{r.name}</span></td>
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{s._r > 0 ? s._r.toFixed(0) + 'd' : ''}</td>
            <td className="nc"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 5, background: 'var(--bg4)', borderRadius: 3, minWidth: 40 }}><div style={{ width: `${prog}%`, height: '100%', background: prog === 100 ? 'var(--gr)' : 'var(--ac)', borderRadius: 3 }} /></div>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{done}/{leaves.length}</span>
            </div></td>
            <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: timeline?.period?.end ? 'var(--tx)' : 'var(--tx3)' }}>
              {timeline?.period?.end ? timeline.period.end.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              {timeline?.deadline?.end && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{t('qe.affectsDeadline')}: {timeline.deadline.end.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
            </td>
          </tr>; })}</tbody>
      </table>
    </>}
  </div>;
}

function RoadmapSwitcher({ tree, scheduled, stats, goals, teams, members, onOpenItem, historyEvents = [], sinceDays, persistSince, sinceDate, diff, diffOnlyChanged = false, persistDiffOnlyChanged, horizonDays = '', persistHorizon, horizonEnd = null, horizonIds = null, horizonOnlyPlanned = true, persistHorizonOnly, futureProgressByRootId = null, workDays = null, holidayIso = null }) {
  const { t } = useT();
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('planr_roadmap_view') || 'map'; } catch { return 'map'; }
  });
  const setAndPersist = v => {
    setView(v);
    try { localStorage.setItem('planr_roadmap_view', v); } catch { /* noop */ }
  };
  // diff comes in from App.jsx — same precomputed bag every view uses, so
  // Roadmap, Timetable, Tree, Gantt and Network stay in sync.

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        <button className={`btn btn-xs ${view === 'map' ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setAndPersist('map')}>{t('tt.map')}</button>
        <button className={`btn btn-xs ${view === 'schedule' ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setAndPersist('schedule')}>{t('tt.title')}</button>
        <span style={{ marginLeft: 12 }}>
          <ViewFilters
            sinceDays={sinceDays} persistSince={persistSince} sinceDate={sinceDate}
            diffOnlyChanged={diffOnlyChanged} persistDiffOnlyChanged={persistDiffOnlyChanged}
            hasHistory={historyEvents.length > 0}
            horizonDays={horizonDays} persistHorizon={persistHorizon} horizonEnd={horizonEnd}
            horizonOnlyPlanned={horizonOnlyPlanned} persistHorizonOnly={persistHorizonOnly}
          />
        </span>
        {/* hideDone toggle lives in the App-level subtoolbar / popup, not
            here — Summary's tt.map view doesn't filter rows by status. */}
      </div>
      {view === 'map' && diff && (
        <div style={{ marginBottom: 8, padding: '6px 10px', background: 'rgba(245,158,11,.08)',
            border: '1px solid rgba(245,158,11,.35)', borderRadius: 4, fontSize: 11,
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#f59e0b' }}>{t('diff.stand', iso(sinceDate))}</span>
          <span style={{ color: 'var(--tx2)' }}>·</span>
          <span data-htip={t('diff.tipDone')}>{t('diff.tasksDone', diff.doneCount)}</span>
          {diff.startedInWindowIds.length > 0 && <>
            <span style={{ color: 'var(--tx2)' }}>·</span>
            <span data-htip={t('diff.tipStartedDetail')}>{t('diff.tasksStarted', diff.startedInWindowIds.length)}</span>
          </>}
          <span style={{ color: 'var(--tx2)' }}>·</span>
          <span data-htip={t('diff.tipEffortDetail')}>{t('diff.effort', Math.round(diff.effortInWindow))}</span>
          {diff.availablePersonDays > 0 && <>
            <span style={{ color: 'var(--tx2)' }}>·</span>
            <span data-htip={t('diff.tipCapacity', Math.round(diff.availablePersonDays), diff.grossWorkdays, diff.holidayCount)}>
              {t('diff.capacity', Math.round(diff.availablePersonDays))}
            </span>
          </>}
          {diff.vacationDaysInWindow > 0 && <>
            <span style={{ color: 'var(--tx2)' }}>·</span>
            <span>{t('diff.vacation', Math.round(diff.vacationDaysInWindow))}</span>
          </>}
          {diff.holidayCount > 0 && <>
            <span style={{ color: 'var(--tx2)' }}>·</span>
            <span>{t('diff.holidays', diff.holidayCount)}</span>
          </>}
          {typeof diff.utilisation === 'number' && diff.utilisation > 0 && <>
            <span style={{ color: 'var(--tx2)' }}>·</span>
            <span data-htip={t('diff.tipUtilisation', Math.round(diff.effortInWindow), Math.max(1, Math.round(diff.availablePersonDays - diff.vacationDaysInWindow)))}
              style={{ color: diff.utilisation >= 80 ? 'var(--gr)' : diff.utilisation >= 40 ? 'var(--am)' : 'var(--tx3)', fontWeight: 600 }}>
              {t('diff.utilisation', diff.utilisation)}
            </span>
          </>}
          {diff.newRootIds.length > 0 && <>
            <span style={{ color: 'var(--tx2)' }}>·</span>
            <span>{t(diff.newRootIds.length === 1 ? 'diff.newLines' : 'diff.newLinesPlural', diff.newRootIds.length)}</span>
          </>}
          {diff.doneCount === 0 && diff.newRootIds.length === 0 && diff.progressedInWindowIds.length === 0 && diff.startedInWindowIds.length === 0 && (
            <span style={{ color: 'var(--tx3)', fontStyle: 'italic', marginLeft: 'auto' }}>{t('diff.noMovement')}</span>
          )}
        </div>
      )}
      {/* Retro panel — only when the diff window is on. Aggregates Soll/Ist
          across leaves that completed in the window so the review tells
          the planning-accuracy story alongside the raw movement banner. */}
      {view === 'map' && diff && sinceDate && (() => {
        const doneInWindow = (diff.doneInWindowIds || []).map(id => tree.find(r => r.id === id)).filter(Boolean);
        if (!doneInWindow.length) return null;
        const agg = aggregateSollIst(doneInWindow, { workDays, holidayIso });
        if (!agg.count) return null;
        const tone = agg.ratio == null ? 'var(--tx3)'
          : agg.ratio > 1.2 ? 'var(--re)'
          : agg.ratio < 0.8 ? 'var(--gr)' : 'var(--am)';
        const ratioStr = agg.ratio != null ? `${agg.ratio.toFixed(2)}×` : '—';
        const hitPct = agg.hitRate != null ? Math.round(agg.hitRate * 100) : null;
        const topOverruns = agg.overruns.slice(0, 3);
        const topUnderruns = agg.underruns.slice(0, 3);
        return (
          <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(59,130,246,.06)',
              border: '1px solid rgba(59,130,246,.30)', borderRadius: 4, fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: topOverruns.length || topUnderruns.length ? 6 : 0, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#3b82f6', fontFamily: 'var(--mono)' }}>{t('retro.title')}</span>
              <span style={{ color: 'var(--tx2)' }}>·</span>
              <span data-htip={t('retro.sumTip', agg.count)}>{t('retro.sum', agg.sollSum.toFixed(0), agg.istSum.toFixed(0))}</span>
              <span style={{ color: 'var(--tx2)' }}>·</span>
              <span style={{ color: tone, fontWeight: 700 }} data-htip={t('retro.ratioTip')}>{t('retro.ratio', ratioStr)}</span>
              {hitPct != null && <>
                <span style={{ color: 'var(--tx2)' }}>·</span>
                <span data-htip={t('retro.hitRateTip')}>{t('retro.hitRate', hitPct, agg.hits, agg.count)}</span>
              </>}
            </div>
            {(topOverruns.length || topUnderruns.length) > 0 && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {topOverruns.length > 0 && (
                  <div style={{ flex: '1 1 200px', minWidth: 200 }}>
                    <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{t('retro.topOver')}</div>
                    {topOverruns.map(e => (
                      <div key={e.id} style={{ display: 'flex', gap: 6, fontSize: 10, padding: '1px 0', cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(e.id)}>
                        <span style={{ color: 'var(--re)', fontWeight: 700, fontFamily: 'var(--mono)', minWidth: 48 }}>+{e.delta.percent}%</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', minWidth: 70 }}>{e.id}</span>
                        <span style={{ color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {topUnderruns.length > 0 && (
                  <div style={{ flex: '1 1 200px', minWidth: 200 }}>
                    <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{t('retro.topUnder')}</div>
                    {topUnderruns.map(e => (
                      <div key={e.id} style={{ display: 'flex', gap: 6, fontSize: 10, padding: '1px 0', cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(e.id)}>
                        <span style={{ color: 'var(--gr)', fontWeight: 700, fontFamily: 'var(--mono)', minWidth: 48 }}>{e.delta.percent}%</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', minWidth: 70 }}>{e.id}</span>
                        <span style={{ color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
      {view === 'map'
        ? <Roadmap tree={tree} scheduled={scheduled} goals={goals} stats={stats} onOpenItem={onOpenItem} diff={diff}
            horizonIds={horizonIds} horizonEnd={horizonEnd}
            futureProgressByRootId={futureProgressByRootId} />
        : <TimetableView tree={tree} scheduled={scheduled} stats={stats} teams={teams} members={members}
            diffDoneIds={diff?.doneInWindowIds} diffProgressedIds={diff?.progressedInWindowIds} sinceDate={sinceDate} />
      }
    </div>
  );
}

export const SumView = memo(SumViewImpl);
