import { useMemo, useState, memo } from 'react';
import { CONF_COLOR } from '../../constants.js';
import { isOnboard, membersWithoutCapacity } from '../../utils/capacity.js';
import { memberTeams, teamForAssignment } from '../../utils/memberTeams.js';
import { leafNodes, re, derivePhaseStatus, isDepsReady } from '../../utils/scheduler.js';
import { createPhaseDraft, normalizePhases, phaseAssigneeIds, phaseTeamIds } from '../../utils/phases.js';
import { ResourceLoadMatrix } from '../shared/ResourceLoadMatrix.jsx';
import { buildMemberShortMap } from '../../App.jsx';
import { useT } from '../../i18n.jsx';
import { planInconsistencies } from '../../utils/planIntegrity.js';
import { OrderSearch } from '../shared/OrderSearch.jsx';
import { DecideSection } from './review/DecideSection.jsx';
import { PhasesSection } from './review/PhasesSection.jsx';
import { CapacitySection } from './review/CapacitySection.jsx';
import { BlockedSection } from './review/BlockedSection.jsx';
import { WarningsSection } from './review/WarningsSection.jsx';
import { CriticalSection } from './review/CriticalSection.jsx';
import { CL } from '../../utils/review/confidenceMarks.js';

function PlanReviewImpl({
  tree,
  scheduled,
  members,
  teams,
  weeks = [],
  vacations = [],
  meetingPlans = [],
  confidence,
  confReasons = {},
  cpSet,
  cpLabels = {},
  cpPaths = {},
  rootFilter = '',
  teamFilter = '',
  personFilter = '',
  hideDone = false,
  planTree = null,
  horizonIds = null,
  diffChangedIds = null,
  diffVisibleIds = null,
  onOpenItem,
  onUpdate,
  reschedule = null,
  onApplyOrder = null,
}) {
  const { t } = useT();
  const [section, setSection] = useState('decide');
  const [phaseShowAll, setPhaseShowAll] = useState(false);
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  // Checked against the WHOLE plan, never the filtered tree this view gets:
  // hide-done, the archive and the root filter are exactly what hide these
  // entries, so a check over what is on screen would find nothing.
  const fullTree = planTree || tree;
  const fullMap = useMemo(() => Object.fromEntries(fullTree.map(r => [r.id, r])), [fullTree]);
  const conflicts = useMemo(() => planInconsistencies(fullTree), [fullTree]);
  const noCapacity = useMemo(
    () => membersWithoutCapacity(members, scheduled, { plans: meetingPlans, teams }),
    [members, scheduled, meetingPlans, teams],
  );
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);
  const allLvs = useMemo(() => leafNodes(tree), [tree]);
  const lvs = useMemo(() => {
    let f = allLvs;
    if (rootFilter) f = f.filter(r => r.id === rootFilter || r.id.startsWith(rootFilter + '.'));
    if (teamFilter) f = f.filter(r => (r.team || '') === teamFilter);
    if (personFilter) f = f.filter(r => (r.assign || []).includes(personFilter));
    if (hideDone) f = f.filter(r => r.status !== 'done' || diffVisibleIds?.has(r.id));
    if (horizonIds) f = f.filter(r => horizonIds.has(r.id));
    if (diffChangedIds) f = f.filter(r => diffChangedIds.has(r.id));
    return f;
  }, [allLvs, rootFilter, teamFilter, personFilter, hideDone, horizonIds, diffChangedIds, diffVisibleIds]);
  const doneSet = useMemo(() => new Set(lvs.filter(r => r.status === 'done').map(r => r.id)), [lvs]);
  const shortMap = useMemo(() => buildMemberShortMap(members), [members]);
  const matchesFilter = node => {
    if (!node) return false;
    if (rootFilter && !(node.id === rootFilter || node.id.startsWith(rootFilter + '.'))) return false;
    if (teamFilter && (node.team || '') !== teamFilter) return false;
    if (personFilter && !(node.assign || []).includes(personFilter)) return false;
    if (hideDone && node.status === 'done' && !diffVisibleIds?.has(node.id)) return false;
    if (horizonIds && !horizonIds.has(node.id)) return false;
    if (diffChangedIds && !diffChangedIds.has(node.id)) return false;
    return true;
  };

  function isReady(id) {
    return isDepsReady(tree, doneSet, iMap[id]);
  }

  const confCounts = useMemo(() => {
    const c = { committed: 0, estimated: 0, exploratory: 0, done: 0 };
    lvs.forEach(r => {
      if (r.status === 'done') {
        c.done++;
        return;
      }
      c[confidence[r.id] || 'committed']++;
    });
    return c;
  }, [lvs, confidence]);

  // ── DECIDE items ──
  const decideItems = useMemo(
    () =>
      lvs
        .filter(r => r.status !== 'done' && (confidence[r.id] === 'estimated' || confidence[r.id] === 'exploratory'))
        .map(r => ({ ...r, sc: sMap[r.id], ready: isReady(r.id), isCp: cpSet?.has(r.id), conf: confidence[r.id] }))
        .sort(
          (a, b) => (a.ready === b.ready ? 0 : a.ready ? -1 : 1) || (a.isCp === b.isCp ? 0 : a.isCp ? -1 : 1) || a.id.localeCompare(b.id),
        ),
    [lvs, confidence, sMap, cpSet, doneSet],
  );
  const readyItems = decideItems.filter(r => r.ready);
  const blockedItems = decideItems.filter(r => !r.ready);

  // ── PHASE TODOS ──
  const phaseTodos = useMemo(
    () =>
      lvs
        .filter(r => r.status !== 'done' && r.phases?.length)
        .flatMap(r => {
          const phases = normalizePhases(r.phases);
          const ci = phases.findIndex(p => p.status !== 'done');
          return phases
            .filter(p => p.status !== 'done')
            .map(p => ({
              task: r,
              phase: p,
              phaseIndex: phases.indexOf(p),
              current: phases.indexOf(p) === ci,
              ready: isReady(r.id),
              owners: phaseAssigneeIds(p),
              teams: phaseTeamIds(p),
            }));
        })
        .sort(
          (a, b) =>
            (a.current === b.current ? 0 : a.current ? -1 : 1) ||
            (a.ready === b.ready ? 0 : a.ready ? -1 : 1) ||
            a.task.id.localeCompare(b.task.id),
        ),
    [lvs, doneSet],
  );

  function advancePhase(node, phaseId) {
    const nextPhases = normalizePhases(node.phases).map(p =>
      p.id === phaseId
        ? createPhaseDraft({ ...p, status: p.status === 'open' ? 'wip' : p.status === 'wip' ? 'done' : 'open' })
        : createPhaseDraft(p),
    );
    const derived = derivePhaseStatus(nextPhases);
    onUpdate?.({ ...node, phases: nextPhases, ...(derived ? { status: derived.status, progress: derived.progress } : {}) });
  }

  // ── CAPACITY ──
  const teamCapacity = useMemo(() => {
    const cap = {};
    teams.forEach(tm => {
      cap[tm.id] = { id: tm.id, name: tm.name, color: tm.color, members: [], committedPt: 0, unassignedPt: 0, unassignedCount: 0 };
    });
    // People who have left are not capacity, and a team of nothing but leavers
    // is not a team any more. Both were listed here at 0 PT beside the teams
    // actually doing the work.
    // A member in several teams appears on each team's card, with the load
    // that falls in that team (see memberShares below).
    members
      .filter(m => isOnboard(m))
      .forEach(m =>
        memberTeams(m).forEach(tid => {
          if (cap[tid]) cap[tid].members.push(m);
        }),
      );
    // "Has someone on it" means the SCHEDULE placed a person, not that a name
    // was typed in: most work in a long plan is auto-assigned, so the explicit
    // test reported a team as almost entirely unstaffed while its people were
    // carrying hundreds of PT two rows above.
    const staffedIds = new Set();
    (scheduled || []).forEach(sc => {
      if (sc.personId) staffedIds.add(sc.treeId || sc.id);
    });
    lvs
      .filter(r => r.status !== 'done')
      .forEach(r => {
        const tk = r.team;
        if (!cap[tk]) return;
        const pt = re(r.best || 0, r.factor || 1.5);
        if ((r.assign || []).length > 0 || staffedIds.has(r.id)) cap[tk].committedPt += pt;
        else if (r.best > 0) {
          cap[tk].unassignedPt += pt;
          cap[tk].unassignedCount++;
        }
      });
    return Object.values(cap).filter(tm => tm.committedPt > 0 || tm.unassignedPt > 0 || tm.members.length > 0);
  }, [teams, members, lvs, scheduled]);

  // ── Accept auto-assign ──
  const acceptAuto = node => {
    const sc = sMap[node.id];
    if (!sc?.autoAssigned || !sc.personId) return;
    const m = members.find(x => x.id === sc.personId);
    if (m) onUpdate?.({ ...node, assign: [sc.personId], team: teamForAssignment(m, node.team) });
  };

  const total = confCounts.committed + confCounts.estimated + confCounts.exploratory;
  const criticalScopes = useMemo(() => {
    const entries = Object.entries(cpPaths || {})
      .map(([scopeId, scope], idx) => {
        const chains = (scope?.chains || []).filter(chain => chain.length);
        if (!chains.length) return null;
        const nodes = [...new Set(chains.flat())];
        const hasMatchingNode = !teamFilter && !personFilter ? true : nodes.some(id => matchesFilter(iMap[id]));
        if (rootFilter && scopeId !== rootFilter) return null;
        if (!hasMatchingNode) return null;
        return {
          scopeId,
          scope,
          chains,
          cpNoBase: idx,
          nodes,
        };
      })
      .filter(Boolean);
    return entries;
  }, [cpPaths, iMap, rootFilter, teamFilter, personFilter]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Confidence bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        {['committed', 'estimated', 'exploratory']
          .map(c => CONF_COLOR[c] && [c, CONF_COLOR[c]])
          .map(([c, col]) => (
            <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: col }}>{CL[c]}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: col }}>{confCounts[c]}</span>
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                {c === 'committed' ? t('p.clear') : c === 'estimated' ? t('p.needsPerson') : t('p.unclear')}
              </span>
            </span>
          ))}
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
          {confCounts.done} {t('p.finished')}
        </span>
      </div>
      {total > 0 && (
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 20, background: 'var(--bg4)' }}>
          <div style={{ width: `${(confCounts.committed / total) * 100}%`, background: CONF_COLOR.committed }} />
          <div style={{ width: `${(confCounts.estimated / total) * 100}%`, background: CONF_COLOR.estimated }} />
          <div style={{ width: `${(confCounts.exploratory / total) * 100}%`, background: CONF_COLOR.exploratory }} />
        </div>
      )}

      {/* Section tabs. They WRAP rather than pushing the pane wide: seven of
        them do not fit a normal pane, and a row that overflows does not
        overflow alone — it gives the whole view a horizontal scrollbar, so
        the header and the figures above slide out of frame with it. A second
        line of buttons costs 26px; a pane that scrolls sideways costs the
        reader their place. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16, minWidth: 0 }}>
        {(() => {
          const dueViolations = scheduled.filter(s => s.dueOverdue || (s.due && new Date(s.due) < new Date() && s.status !== 'done'));
          const truncated = scheduled.filter(s => s.truncatedByOffboard);
          const warnCount = dueViolations.length + truncated.length + conflicts.length + noCapacity.length;
          return [
            ['decide', `${t('p.decisions')} (${readyItems.length})`],
            ['phases', `${t('p.phaseTodos')} (${phaseTodos.length})`],
            ['capacity', t('p.teamCapacity')],
            ['load', t('p.load') || 'Load'],
            ['blocked', `${t('p.blocked')} (${blockedItems.length})`],
            ['warnings', `${t('pr.warnings')}${warnCount > 0 ? ' (' + warnCount + ')' : ''}`],
            ...(reschedule ? [['order', t('or.tab')]] : []),
            ['critical', `${t('pr.criticalPaths')} (${criticalScopes.reduce((sum, scope) => sum + scope.chains.length, 0)})`],
          ];
        })().map(([k, l]) => (
          <button
            key={k}
            className={`btn btn-xs ${section === k ? 'btn-pri' : 'btn-sec'}`}
            style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => setSection(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ══════ DECIDE — compact rows ══════ */}
      {section === 'decide' && (
        <DecideSection
          readyItems={readyItems}
          teams={teams}
          iMap={iMap}
          sMap={sMap}
          members={members}
          confReasons={confReasons}
          cpLabels={cpLabels}
          shortMap={shortMap}
          onOpenItem={onOpenItem}
          acceptAuto={acceptAuto}
        />
      )}

      {/* ══════ PHASES — grouped by task ══════ */}
      {section === 'phases' && (
        <PhasesSection
          phaseTodos={phaseTodos}
          phaseShowAll={phaseShowAll}
          setPhaseShowAll={setPhaseShowAll}
          teams={teams}
          members={members}
          onOpenItem={onOpenItem}
          advancePhase={advancePhase}
        />
      )}

      {/* ══════ CAPACITY — compact cards ══════ */}
      {section === 'capacity' && <CapacitySection teamCapacity={teamCapacity} scheduled={scheduled} />}

      {/* ══════ LOAD — weekly resource-load matrix (scheduler output) ══════ */}
      {section === 'load' && (
        <ResourceLoadMatrix
          members={members}
          teams={teams}
          weeks={weeks}
          vacations={vacations}
          meetingPlans={meetingPlans}
          scheduled={scheduled}
        />
      )}

      {/* ══════ BLOCKED — compact rows ══════ */}
      {section === 'blocked' && (
        <BlockedSection
          blockedItems={blockedItems}
          iMap={iMap}
          teams={teams}
          tree={tree}
          doneSet={doneSet}
          cpLabels={cpLabels}
          onOpenItem={onOpenItem}
        />
      )}

      {section === 'warnings' && (
        <WarningsSection
          scheduled={scheduled}
          conflicts={conflicts}
          noCapacity={noCapacity}
          fullMap={fullMap}
          iMap={iMap}
          onOpenItem={onOpenItem}
        />
      )}

      {section === 'order' && reschedule && (
        <OrderSearch tree={planTree || tree} reschedule={reschedule} onApplyOrder={onApplyOrder} onOpenItem={onOpenItem} />
      )}

      {section === 'critical' && (
        <CriticalSection
          criticalScopes={criticalScopes}
          iMap={iMap}
          sMap={sMap}
          teamFilter={teamFilter}
          personFilter={personFilter}
          matchesFilter={matchesFilter}
          onOpenItem={onOpenItem}
        />
      )}
    </div>
  );
}

export const PlanReview = memo(PlanReviewImpl);
