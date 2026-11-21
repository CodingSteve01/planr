import { useMemo } from 'react';
import { CONF_COLOR } from '../../constants.js';
import { isLeafNode, leafNodes, leafProgress, parentId, re } from '../../utils/scheduler.js';
import { aggregateProgressPct } from '../../utils/progress.js';
import { diffDays, localDate } from '../../utils/date.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { useT } from '../../i18n.jsx';
import { S_COLOR } from './insights/InsightParts.jsx';
import { InsightNameBlock, InsightStatusBlock } from './insights/InsightHeader.jsx';
import { TimingSection } from './insights/TimingSection.jsx';
import { EffortSection, SubtasksSection } from './insights/EffortSection.jsx';
import { PeopleSection } from './insights/PeopleSection.jsx';
import { HandoffSection } from './insights/HandoffSection.jsx';
import { PhasesSection } from './insights/PhasesSection.jsx';
import { DepsSection } from './insights/DepsSection.jsx';
import { CustomFieldsSection } from './insights/CustomFieldsSection.jsx';

const CONF_DOT = { committed: '●', estimated: '◐', exploratory: '○' };

export function TaskInsights({
  node,
  tree,
  members,
  teams,
  scheduled,
  cpSet,
  stats,
  confidence = {},
  confReasons = {},
  customFields: projectCustomFields,
  onOpenItem,
  onEditSection,
  onPhaseToggle,
  onSplitHandoff,
  onSplitTaskAtProgress,
}) {
  const { t } = useT();
  const sec = onEditSection ? id => () => onEditSection(id) : () => undefined;

  const customFields = projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS;

  const isLeaf = isLeafNode(tree, node.id);
  const sc = scheduled?.find(s => s.id === node.id);
  const timeline = useMemo(() => summarizeNodeTimeline(tree, scheduled, node), [tree, scheduled, node]);

  // Progress
  const leafsUnder = useMemo(() => leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')), [tree, node.id]);
  const doneUnder = useMemo(() => leafsUnder.filter(l => l.status === 'done').length, [leafsUnder]);
  const wipUnder = useMemo(() => leafsUnder.filter(l => l.status === 'wip').length, [leafsUnder]);
  const openUnder = useMemo(() => leafsUnder.filter(l => l.status === 'open').length, [leafsUnder]);
  const leafCount = leafsUnder.length;

  // Effort-weighted for parents, phase-aware for leaves — utils/progress.js is
  // the single formula, so this panel agrees with the tree grid, the
  // Subway-Map and the exports. `node.progress` alone ignored phases and
  // done/total ignored task size; both printed their own private number here.
  const progPct = isLeaf ? leafProgress(node) : aggregateProgressPct(leafsUnder);

  const status = node.status || 'open';

  // Confidence
  const conf = confidence[node.id];
  const confLabel = conf ? t(`conf.${conf}`) : t('auto');
  const confDot = conf ? CONF_DOT[conf] : '—';
  const confColor = conf ? CONF_COLOR[conf] : 'var(--tx3)';

  // Effort
  const effort = isLeaf ? re(node.best || 0, node.factor || 1.5) : stats?.[node.id]?._r;
  const effortBest = isLeaf ? node.best || 0 : stats?.[node.id]?._b;
  const capacityPct = sc?.capPct != null ? sc.capPct : sc?.capacityFraction != null ? Math.round(sc.capacityFraction * 100) : null;
  const effortStats = [
    sc?.calDays > 0 ? { label: t('tt.durCal'), value: `${sc.calDays}d` } : null,
    sc?.workingDaysInWindow != null ? { label: t('tt.workingDays'), value: `${sc.workingDaysInWindow}d` } : null,
    sc?.holidaysInWindow > 0 ? { label: t('tt.holidaysInWindow'), value: `${sc.holidaysInWindow}d`, tone: 'danger' } : null,
    sc?.vacDays > 0 ? { label: t('tt.vacDays'), value: `${sc.vacDays}d`, tone: 'warn' } : null,
    capacityPct != null && capacityPct < 100 ? { label: t('ins.capacity'), value: `${capacityPct}%` } : null,
  ].filter(Boolean);

  // Schedule
  const periodStartDate = timeline?.period?.start || (node.status === 'done' ? null : sc?.startD || null);
  const periodEndDate = timeline?.period?.end || (node.status === 'done' ? null : sc?.endD || null);
  const actualStartDate =
    timeline?.actual?.start ||
    (node.status === 'done'
      ? node.completedStart
        ? localDate(node.completedStart)
        : node.completedAt
          ? localDate(node.completedAt)
          : null
      : null);
  const actualEndDate =
    timeline?.actual?.end ||
    (node.status === 'done'
      ? node.completedAt
        ? localDate(node.completedAt)
        : node.completedEnd
          ? localDate(node.completedEnd)
          : actualStartDate
      : null);
  const plannedStartDate = actualStartDate ? timeline?.planned?.start || null : null;
  const plannedEndDate = actualEndDate ? timeline?.planned?.end || null : null;
  const hasDistinctPlanned = !!(
    actualStartDate &&
    actualEndDate &&
    plannedStartDate &&
    plannedEndDate &&
    (plannedStartDate.getTime() !== actualStartDate.getTime() || plannedEndDate.getTime() !== actualEndDate.getTime())
  );
  const calDays = periodStartDate && periodEndDate ? diffDays(periodStartDate, periodEndDate) : null;

  // Team
  const team = teams?.find(tm => tm.id === node.team);

  // Assignees
  const assignees = useMemo(
    () => (node.assign || []).map(id => members?.find(m => m.id === id) || { id, name: id }),
    [node.assign, members],
  );

  // Deps: predecessors
  const preds = useMemo(
    () =>
      (node.deps || []).map(id => {
        const n = tree.find(r => r.id === id);
        return { id, name: n?.name || id, status: n?.status || 'open' };
      }),
    [node.deps, tree],
  );

  // Successors: items that list this node as a dep
  const succs = useMemo(
    () => tree.filter(r => (r.deps || []).includes(node.id)).map(r => ({ id: r.id, name: r.name, status: r.status || 'open' })),
    [tree, node.id],
  );

  // Inherited predecessors: deps declared on any ancestor block this node too
  // (the scheduler walks the ancestor chain in `effectiveDeps`). Surface them
  // separately so the user can tell why a child can't start before a
  // parent-level dep is done.
  const inheritedPreds = useMemo(() => {
    const ancestors = [];
    let pid = parentId(node.id);
    while (pid) {
      ancestors.push(pid);
      pid = parentId(pid);
    }
    const ownDepSet = new Set(node.deps || []);
    const seen = new Set();
    const out = [];
    ancestors.forEach(aid => {
      const anc = tree.find(r => r.id === aid);
      if (!anc) return;
      (anc.deps || []).forEach(depId => {
        if (ownDepSet.has(depId) || seen.has(depId)) return;
        seen.add(depId);
        const n = tree.find(r => r.id === depId);
        out.push({ id: depId, name: n?.name || depId, status: n?.status || 'open', via: anc.id });
      });
    });
    return out;
  }, [node.id, node.deps, tree]);

  // Custom fields with values
  const filledCustomFields = useMemo(() => customFields.filter(cf => (node.customValues || {})[cf.id]), [customFields, node.customValues]);

  const statusColor = S_COLOR[status] || 'var(--tx3)';

  return (
    <div style={{ fontSize: 12 }}>
      <InsightNameBlock node={node} onEditSection={onEditSection} />

      <InsightStatusBlock
        status={status}
        statusColor={statusColor}
        progPct={progPct}
        confColor={confColor}
        confDot={confDot}
        confLabel={confLabel}
        onEditSection={onEditSection}
      />

      {/* Sections */}

      {/* Timing section */}
      {(periodStartDate ||
        periodEndDate ||
        actualStartDate ||
        actualEndDate ||
        timeline?.deadline ||
        node.pinnedStart ||
        node.decideBy ||
        node.due ||
        sc?.blockedBy) && (
        <TimingSection
          node={node}
          sc={sc}
          scheduled={scheduled}
          timeline={timeline}
          periodStartDate={periodStartDate}
          periodEndDate={periodEndDate}
          actualStartDate={actualStartDate}
          actualEndDate={actualEndDate}
          plannedStartDate={plannedStartDate}
          plannedEndDate={plannedEndDate}
          hasDistinctPlanned={hasDistinctPlanned}
          calDays={calDays}
          sec={sec}
          onOpenItem={onOpenItem}
        />
      )}

      {/* Effort section — leaf only */}
      {isLeaf && node.best > 0 && <EffortSection node={node} effort={effort} effortBest={effortBest} effortStats={effortStats} sec={sec} />}

      {/* Parent: aggregate section — no onClick, no hover */}
      {!isLeaf && leafCount > 0 && (
        <SubtasksSection
          doneUnder={doneUnder}
          wipUnder={wipUnder}
          openUnder={openUnder}
          leafCount={leafCount}
          effort={effort}
          effortBest={effortBest}
        />
      )}

      {/* People section — assignees + team in one row */}
      {(assignees.length > 0 || team || sc?.autoAssigned) && <PeopleSection assignees={assignees} team={team} sc={sc} sec={sec} />}

      {/* Handoff / offboarding cascade — leaf only when the scheduler had to
          split work across multiple people (or flagged a truncation). */}
      {isLeaf && sc?.segments && (sc.segments.length > 1 || sc.truncatedByOffboard) && (
        <HandoffSection node={node} sc={sc} onSplitHandoff={onSplitHandoff} onSplitTaskAtProgress={onSplitTaskAtProgress} />
      )}

      {/* Phases section — leaf only, if phases exist */}
      {isLeaf && node.phases?.length > 0 && <PhasesSection node={node} sec={sec} onPhaseToggle={onPhaseToggle} />}

      {/* Dependencies section */}
      {(preds.length > 0 || succs.length > 0 || inheritedPreds.length > 0) && (
        <DepsSection preds={preds} succs={succs} inheritedPreds={inheritedPreds} sec={sec} onOpenItem={onOpenItem} />
      )}

      {/* Custom fields with values */}
      {filledCustomFields.length > 0 && <CustomFieldsSection node={node} filledCustomFields={filledCustomFields} sec={sec} />}
    </div>
  );
}
