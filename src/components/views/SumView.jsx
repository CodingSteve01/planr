import { useMemo, useState, memo } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { leafNodes, scheduleEffort } from '../../utils/scheduler.js';
import { GT_ICON } from '../../constants.js';
import { onboardCount } from '../../utils/capacity.js';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { useT } from '../../i18n.jsx';
import { stripArchivedRoots } from '../../utils/archive.js';
import { stateAsOf } from '../../utils/history.js';
import { SumHeadline } from './sum/SumHeadline.jsx';
import { SumKpis } from './sum/SumKpis.jsx';
import { RoadmapSwitcher } from './sum/RoadmapSwitcher.jsx';
import { ConfidencePanel } from './sum/ConfidencePanel.jsx';
import { PulseCheck } from './sum/PulseCheck.jsx';
import { ResourcesSection } from './sum/ResourcesSection.jsx';
import { GoalCard } from './sum/GoalCard.jsx';
import { TopItemsTable } from './sum/TopItemsTable.jsx';
// Shared with the HTML report and every PDF export — one formula, one format,
// so screen and export can never print different percentages.
import {
  MIN_VISIBLE_PROGRESS_DELTA_PCT,
  aggregateProgressPct,
  deliveredEffort,
  effortWeightedProgress,
  progressDeltaLabel,
  progressPctLabel,
  totalEffort,
} from '../../utils/progress.js';

// The three focus types, and then everything else.
//
// `goals` is roots WITH a `type`, and this section listed only those — so a
// project nobody had labelled a goal, a pain point or a deadline was not in
// the overview and not in the PDF either. On a real plan that was five of
// eight, the largest running project among them. A focus type is an
// annotation on a project, not the thing that makes it exist.
const ORDER = ['goal', 'painpoint', 'deadline', ''];

function SumViewImpl({
  tree,
  scheduled,
  goals,
  members,
  teams,
  goalPaths,
  stats,
  confidence = {},
  historyEvents = [],
  sinceDate = null,
  diff = null,
  scenarioShifts = null,
  horizonEnd = null,
  horizonIds = null,
  futureProgressByRootId = null,
  workDays = null,
  holidayIso = null,
  roadmapAssignment = null,
  onAssignmentChange = null,
  archive = null,
  showArchived = false,
  setShowArchived,
  onNavigate,
  onOpenItem,
  projectWaitsOf = null,
}) {
  const { t } = useT();
  // Archive is a *display* filter: the header percentage, PT and leaf counts
  // below still read the full tree, so archiving a finished project never
  // changes what the project has achieved. Only the map, the Fahrplan and the
  // goal cards drop the archived lines.
  const archivedRootIds = !showArchived && archive?.rootIds?.size ? archive.rootIds : null;
  const activeTree = useMemo(() => (archivedRootIds ? stripArchivedRoots(tree, archivedRootIds) : tree), [tree, archivedRootIds]);
  const activeGoals = useMemo(
    () => (archivedRootIds ? goals.filter(goal => !archivedRootIds.has(goal.id)) : goals),
    [goals, archivedRootIds],
  );
  const lvs = leafNodes(tree);
  const done = lvs.filter(r => r.status === 'done').length;
  const wip = lvs.filter(r => r.status === 'wip').length;
  const open = lvs.filter(r => r.status === 'open').length;
  const onboard = useMemo(() => onboardCount(members), [members]);
  const tR = useMemo(() => totalEffort(lvs), [lvs]);
  // Absolute realistic PT delivered. The percentage above drops when new
  // scope lands; this number only ever goes up as work gets done, so users
  // can see real progress even while the % is being diluted by scope growth.
  const doneR = useMemo(() => deliveredEffort(lvs), [lvs]);
  const prog = useMemo(() => aggregateProgressPct(lvs), [lvs]);
  const latE = scheduled.length > 0 ? scheduled.reduce((m, s) => (s.endD > m ? s.endD : m), new Date(0)) : null;
  const byT = {};
  scheduled.forEach(s => {
    if (!byT[s.team]) byT[s.team] = { t: 0, pt: 0 };
    byT[s.team].t++;
    byT[s.team].pt += s.effort;
  });

  // Sprint horizon (next-N-days) — for the "Up next" planning view.
  // Distinct from the project-wide horizon filter in ViewFilters; this is a local control
  // for the upcoming-sprint table.
  const [sprintDays, setSprintDays] = useState(() => {
    try {
      return +localStorage.getItem('planr_sprint_horizon') || 30;
    } catch {
      return 30;
    }
  });
  const sprintEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + sprintDays);
    return d;
  }, [sprintDays]);
  const now = new Date();
  const h1Weeks = useMemo(() => {
    try {
      return +localStorage.getItem('planr_h1_weeks') || 8;
    } catch {
      return 8;
    }
  }, []);
  const h2Weeks = useMemo(() => {
    try {
      return +localStorage.getItem('planr_h2_weeks') || 18;
    } catch {
      return 18;
    }
  }, []);
  const h1Date = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + h1Weeks * 7);
    return date;
  }, [h1Weeks]);
  const h2Date = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + h2Weeks * 7);
    return date;
  }, [h2Weeks]);
  // Collect: scheduled tasks that are not done and start within the horizon (or are already in progress)
  const upcoming = useMemo(
    () =>
      scheduled
        .filter(s => s.status !== 'done' && s.startD && s.startD <= sprintEnd)
        .sort((a, b) => a.startD - b.startD || (a.prio || 4) - (b.prio || 4)),
    [scheduled, sprintEnd],
  );
  // Group by person (with NO_PERSON bucket per team)
  const sprintGroups = useMemo(() => {
    const groups = new Map();
    upcoming.forEach(s => {
      const key = s.personId || `team:${s.team || 'none'}`;
      if (!groups.has(key)) {
        const tName = teams.find(tm => tm.id === s.team)?.name || s.team || t('noTeam');
        groups.set(key, {
          key,
          label: s.personId ? s.person : `${tName} ${t('pc.unassigned')}`,
          isPerson: !!s.personId,
          color: s.personId ? 'var(--ac)' : 'var(--tx3)',
          items: [],
        });
      }
      groups.get(key).items.push(s);
    });
    return [...groups.values()].sort((a, b) => (a.isPerson === b.isPerson ? a.label.localeCompare(b.label) : a.isPerson ? -1 : 1));
  }, [upcoming, teams]);
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const timelineById = useMemo(
    () => Object.fromEntries(tree.map(node => [node.id, summarizeNodeTimeline(tree, scheduled, node)])),
    [tree, scheduled],
  );

  // Every root, not only the annotated ones. Dropped projects stay out: the
  // decision not to do something is not a focus.
  const untypedRoots = useMemo(
    () =>
      tree.filter(
        node => !String(node.id).includes('.') && !node.type && !node.dropped && !(archivedRootIds && archivedRootIds.has(node.id)),
      ),
    [tree, archivedRootIds],
  );
  const grouped = ORDER.map(tp => ({ type: tp, items: tp ? activeGoals.filter(g => g.type === tp) : untypedRoots })).filter(
    g => g.items.length,
  );

  // `sinceDays`, `persistSince`, `sinceDate` now flow in from App.jsx so the
  // diff state is shared across all views (Roadmap, Tree, Timetable, Gantt,
  // Network). The picker UI lives in RoadmapSwitcher / TreeView toolbars.

  // Effort-weighted overall progress AT the cutoff. Mirrors the live
  // Subway-map train semantics: partial progress counts by realistic effort,
  // but a non-done task is capped below 100%. New leaves count as 0%.
  const pastOverallProg = useMemo(() => {
    if (!sinceDate) return null;
    const past = diff?.pastLeafState || (historyEvents.length ? stateAsOf(historyEvents, sinceDate) : null);
    if (!past) return null;
    // Same weighting as the live figure, only the per-leaf progress lookup
    // swaps to the historical state.
    return effortWeightedProgress(lvs, lf => {
      const p = past.get(lf.id);
      if (!p) return 0;
      if (p.status === 'done') return 100;
      return Math.min(99, Math.max(0, p.progress || 0));
    }).pct;
  }, [diff?.pastLeafState, historyEvents, sinceDate, lvs]);
  const overallDelta = pastOverallProg != null ? prog - pastOverallProg : null;
  // Scope delta — PT added/removed since the diff cutoff. We only know which
  // leaves existed at the cutoff (history tracks add/remove + status), not
  // what their estimates were back then, so this approximates by summing
  // *current* effort for leaves that did exist at the cutoff and comparing
  // to the current total. Net result: shows scope growth from new items and
  // (with sign flip) work removed. Estimate-only edits silently vanish.
  const scopeDelta = useMemo(() => {
    if (!sinceDate) return null;
    const past = diff?.pastLeafState || (historyEvents.length ? stateAsOf(historyEvents, sinceDate) : null);
    if (!past) return null;
    let pastTotal = 0;
    for (const lf of lvs) {
      if (past.has(lf.id)) pastTotal += scheduleEffort(lf) || 0;
    }
    return tR - pastTotal;
  }, [diff?.pastLeafState, historyEvents, sinceDate, lvs, tR]);
  const futureOverallProg = useMemo(() => {
    if (!futureProgressByRootId) return null;
    const roots = tree.filter(r => !r.id.includes('.'));
    let total = 0,
      progressed = 0;
    for (const root of roots) {
      const leaves = lvs.filter(lf => lf.id === root.id || lf.id.startsWith(root.id + '.'));
      const effort = leaves.reduce((sum, lf) => sum + (scheduleEffort(lf) || 1), 0);
      if (effort <= 0) continue;
      total += effort;
      const rootProgress = Object.prototype.hasOwnProperty.call(futureProgressByRootId, root.id)
        ? futureProgressByRootId[root.id] * 100
        : stats?.[root.id]?._progress || 0;
      progressed += (effort * Math.max(0, Math.min(100, rootProgress))) / 100;
    }
    return total > 0 ? (progressed / total) * 100 : null;
  }, [futureProgressByRootId, lvs, stats, tree]);
  const futureOverallDelta = futureOverallProg != null ? futureOverallProg - prog : null;
  const futureOverallDeltaLabel = futureOverallDelta > MIN_VISIBLE_PROGRESS_DELTA_PCT ? progressDeltaLabel(futureOverallDelta) : '';
  const futureOverallTip =
    futureOverallProg != null
      ? t('s.futureOverallTip', progressPctLabel(prog), progressPctLabel(futureOverallProg)) +
        (futureOverallDeltaLabel ? ` (${futureOverallDeltaLabel})` : '')
      : '';
  const currentPct = Math.max(0, Math.min(100, prog));
  const pastPct = pastOverallProg != null ? Math.max(0, Math.min(100, pastOverallProg)) : null;
  const futurePct = futureOverallProg != null ? Math.max(0, Math.min(100, futureOverallProg)) : null;
  const showPastStripe = pastPct != null && currentPct - pastPct > MIN_VISIBLE_PROGRESS_DELTA_PCT;
  const showFutureStripe = futurePct != null && futurePct - currentPct > MIN_VISIBLE_PROGRESS_DELTA_PCT;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <SumHeadline
        currentPct={currentPct}
        futureOverallDeltaLabel={futureOverallDeltaLabel}
        futureOverallProg={futureOverallProg}
        futureOverallTip={futureOverallTip}
        futurePct={futurePct}
        overallDelta={overallDelta}
        pastOverallProg={pastOverallProg}
        pastPct={pastPct}
        prog={prog}
        showFutureStripe={showFutureStripe}
        showPastStripe={showPastStripe}
        sinceDate={sinceDate}
        tR={tR}
      />

      <SumKpis done={done} doneR={doneR} latE={latE} lvs={lvs} now={now} open={open} scopeDelta={scopeDelta} tR={tR} wip={wip} />

      {/* Roadmap + Fahrplan — switchable sub-views sharing the same data. */}
      <RoadmapSwitcher
        tree={activeTree}
        scheduled={scheduled}
        stats={stats}
        goals={activeGoals}
        scenarioShifts={scenarioShifts}
        teams={teams}
        members={members}
        onOpenItem={onOpenItem}
        archive={archive}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
        sinceDate={sinceDate}
        diff={diff}
        horizonEnd={horizonEnd}
        horizonIds={horizonIds}
        futureProgressByRootId={futureProgressByRootId}
        workDays={workDays}
        holidayIso={holidayIso}
        roadmapAssignment={roadmapAssignment}
        onAssignmentChange={onAssignmentChange}
      />

      <ConfidencePanel confidence={confidence} lvs={lvs} onNavigate={onNavigate} />

      <PulseCheck
        confidence={confidence}
        goals={goals}
        h1Date={h1Date}
        h2Date={h2Date}
        iMap={iMap}
        onNavigate={onNavigate}
        scheduled={scheduled}
        timelineById={timelineById}
        tree={tree}
      />

      <ResourcesSection byT={byT} members={members} onboard={onboard} teams={teams} tR={tR} />

      {/* Focus */}
      <div className="section-h" style={{ marginTop: 0 }}>
        {t('s.focus')}
      </div>
      {grouped.map(g => (
        <div key={g.type}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              color: 'var(--tx3)',
              margin: '10px 0 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Icon name={GT_ICON[g.type] || 'folder'} size={11} />
            {g.type ? t(g.type + 's') : t('s.otherProjects')}
          </div>
          {g.items.map(dl => (
            <GoalCard
              key={dl.id}
              dl={dl}
              goalPaths={goalPaths}
              lvs={lvs}
              now={now}
              onNavigate={onNavigate}
              projectWaitsOf={projectWaitsOf}
              scheduled={scheduled}
              timelineById={timelineById}
              tree={tree}
            />
          ))}
        </div>
      ))}

      {tree.filter(r => r.lvl === 1).length > 0 && (
        <TopItemsTable lvs={lvs} onNavigate={onNavigate} stats={stats} timelineById={timelineById} tree={tree} />
      )}
    </div>
  );
}

export const SumView = memo(SumViewImpl);
