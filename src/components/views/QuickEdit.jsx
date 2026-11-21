import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { isLeafNode, derivePhaseStatus, parentId } from '../../utils/scheduler.js';
import { statusChangePatch } from '../../utils/completion.js';
import { normalizePhases } from '../../utils/phases.js';
import { deadlineRootIdForNode, isDeadlineRelevantForRoot } from '../../utils/deadlines.js';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { useT } from '../../i18n.jsx';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { memberTeamNames } from '../../utils/memberTeams.js';
import { QuickEditHeader } from './quickedit/QuickEditHeader.jsx';
import { InsightsTab } from './quickedit/InsightsTab.jsx';
import { OverviewTab } from './quickedit/OverviewTab.jsx';
import { WorkflowTab } from './quickedit/WorkflowTab.jsx';
import { EffortTab } from './quickedit/EffortTab.jsx';
import { LeafTimingFields } from './quickedit/LeafTimingFields.jsx';
import { DeadlineRelevantField } from './quickedit/DeadlineRelevantField.jsx';
import { PredecessorsField } from './quickedit/PredecessorsField.jsx';
import { SuccessorsField } from './quickedit/SuccessorsField.jsx';
import { QuickEditActions } from './quickedit/QuickEditActions.jsx';

// The side panel's editor for one item. The check for "no item" sits out here
// so that the component below calls its hooks on every render.
export function QuickEdit(props) {
  return props.node ? <QuickEditBody {...props} /> : null;
}

function QuickEditBody({
  node,
  tree,
  members,
  teams,
  taskTemplates,
  sizes: projectSizes,
  customFields: projectCustomFields,
  scheduled,
  cpSet,
  cpLabels = {},
  stats,
  confidence = {},
  confReasons = {},
  workDays,
  holidayIso,
  onUpdate,
  onDelete,
  onEstimate,
  onDuplicate,
  onSplitHandoff,
  onSplitTaskAtProgress,
  onAddDep,
  onRemoveDep,
  onOpenItem,
  historyEvents = [],
  onHistoryChange,
  viewDay = '',
  tab: tabProp,
  onTabChange,
}) {
  const { t } = useT();
  const REASON_TIP = {
    'manual': t('g.reasonManual'),
    'done': t('g.reasonDone'),
    'auto:person+estimate': t('g.reasonPersonEstimate'),
    'auto:no-person': t('g.reasonNoPerson'),
    'auto:high-risk': t('g.reasonHighRisk'),
    'auto:no-estimate': t('g.reasonNoEstimate'),
    'inherited': t('g.reasonInherited'),
  };
  const [f, setF] = useState({ ...node });
  const [focusHint, setFocusHint] = useState(null);
  const [depAddKind, setDepAddKind] = useState('soft');
  const [succAddKind, setSuccAddKind] = useState('soft');
  const activateTab = (e, action) => {
    if (e.button !== 0) return;
    e.preventDefault();
    action();
  };

  const focusRefs = {
    name: useRef(null),
    pinnedStart: useRef(null),
    bestDays: useRef(null),
    assign: useRef(null),
    phases: useRef(null),
    status: useRef(null),
    customFields: useRef(null),
    deps: useRef(null),
  };

  useLayoutEffect(() => {
    if (!focusHint) return;
    const el = focusRefs[focusHint]?.current;
    if (el) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.focus();
        if (el.select) el.select();
      } else {
        const inner = el.querySelector('input, textarea');
        if (inner) {
          inner.focus();
          if (inner.select) inner.select();
        } else el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }
    setFocusHint(null);
  }, [focusHint, tabProp]);

  // Re-seed whenever the stored node changes, not just when a different node
  // is selected. Keying on the id alone meant an edit made anywhere else —
  // Space walking a task's phases in the tree, a bulk change, an undo — left
  // this panel showing the values from whenever it was opened. You had to
  // click away and back to see your own change.
  //
  // `onUpdate` hands the object straight through to the store, so the object
  // identity is the discriminator: the same one back is our own write.
  useEffect(() => {
    if (!node) return;
    if (node === lastCommittedRef.current) return;
    lastCommittedRef.current = node;
    setF({ ...node });
  }, [node]);

  const CONF_OPTS = useMemo(
    () => [
      { id: '', label: t('auto') },
      { id: 'committed', label: `${t('conf.committed.dot')} ${t('conf.committed')}` },
      { id: 'estimated', label: `${t('conf.estimated.dot')} ${t('conf.estimated')}` },
      { id: 'exploratory', label: `${t('conf.exploratory.dot')} ${t('conf.exploratory')}` },
    ],
    [t],
  );

  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);

  const isLeaf = isLeafNode(tree, node.id);
  const isRoot = !node.id.includes('.');
  const deadlineRootId = useMemo(() => deadlineRootIdForNode(tree, node.id), [tree, node.id]);
  const deadlineRoot = useMemo(() => (deadlineRootId ? tree.find(entry => entry.id === deadlineRootId) : null), [tree, deadlineRootId]);
  const deadlineParentExcluded = useMemo(() => {
    if (!deadlineRootId || node.id === deadlineRootId) return false;
    const parent = parentId(node.id);
    return !!parent && !isDeadlineRelevantForRoot(tree, deadlineRootId, parent);
  }, [tree, node.id, deadlineRootId]);
  const showDeadlineRelevant = !!deadlineRootId && node.id !== deadlineRootId;
  const allIds = tree.map(r => r.id).filter(id => id !== node.id);
  const SIZES = (projectSizes?.length ? projectSizes : DEFAULT_SIZES).map(s => [s.label, s.days, s.factor, s.desc || '']);
  const nearestSize =
    f.best > 0 ? SIZES.reduce((best, size) => (Math.abs(size[1] - f.best) < Math.abs(best[1] - f.best) ? size : best), SIZES[0]) : null;
  const phases = normalizePhases(f.phases);
  const memberLabel = member => `${member.name || member.id}${member.team ? ' — ' + memberTeamNames(member, teams).join(' + ') : ''}`;
  const memberName = id => members.find(member => member.id === id)?.name || id;
  const customFields = projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS;
  const timeline = useMemo(() => summarizeNodeTimeline(tree, scheduled, f), [tree, scheduled, f]);

  const tabs = [
    // The same tabs in the same places as the item dialog (NodeModal): the
    // one only a task has comes last, so the others never move.
    { id: 'insights', label: t('nm.tab.insights') },
    { id: 'workflow', label: t('qe.tab.workflow') },
    { id: 'overview', label: t('qe.tab.overview') },
    { id: 'timing', label: t('qe.tab.timing') },
    ...(isLeaf ? [{ id: 'effort', label: t('qe.tab.effort') }] : []),
  ];

  const activeTab = tabs.find(item => item.id === tabProp) ? tabProp : 'insights';
  const setTab = onTabChange || (() => {});
  useEffect(() => {
    if (activeTab !== tabProp && onTabChange) onTabChange(activeTab);
  }, [activeTab]);

  // Remembers the exact object this panel last wrote, so the sync effect
  // below can tell our own change coming back (nothing to do — `f` already
  // has it) from one made somewhere else (re-seed).
  const lastCommittedRef = useRef(null);

  const commitNode = next => {
    lastCommittedRef.current = next;
    setF(next);
    onUpdate(next);
  };

  const patchNode = patch => {
    commitNode({ ...f, ...patch });
  };

  // Status-change side effects (progress + completedAt/-End/-Start stamping)
  // are shared with Run mode's row-level status control — see
  // utils/completion.js `statusChangePatch` for what each transition does
  // and why.
  const donePatch = (source = f) => statusChangePatch(source, 'done');

  const patchCompletion = patch => {
    const next = { ...f, ...patch };
    if (patch.completedAt !== undefined) {
      if (next.completedAt) next.completedEnd = next.completedAt;
      else {
        next.completedStart = '';
        next.completedEnd = '';
      }
    }
    if (patch.completedEnd !== undefined) {
      if (next.completedEnd) next.completedAt = next.completedEnd;
      else if (!next.completedStart) next.completedAt = '';
    }
    if (next.completedStart && next.completedEnd && next.completedStart > next.completedEnd) {
      if (patch.completedStart !== undefined) {
        next.completedEnd = next.completedStart;
        next.completedAt = next.completedStart;
      } else {
        next.completedStart = next.completedEnd;
      }
    }
    patchNode({
      completedStart: next.completedStart || '',
      completedEnd: next.completedEnd || '',
      completedAt: next.completedAt || '',
    });
  };

  const bufferNode = patch => {
    setF(prev => ({ ...prev, ...patch }));
  };

  const flushNode = () => onUpdate(f);

  // Phase inline toggle from Insights: cycle open → wip → done → open
  const togglePhase = phaseId => {
    const nextPhases = (f.phases || []).map(p => {
      if (p.id !== phaseId) return p;
      const next = p.status === 'open' ? 'wip' : p.status === 'wip' ? 'done' : 'open';
      return { ...p, status: next };
    });
    const derived = derivePhaseStatus(nextPhases);
    commitNode({ ...f, phases: nextPhases, ...(derived ? { status: derived.status, progress: derived.progress } : {}) });
  };

  // Phases onChange: phases define status + progress when present
  const commitPhases = (nextPhases, extra = {}) => {
    const clean = nextPhases.length ? nextPhases : undefined;
    const next = {
      ...f,
      ...extra,
      phases: clean,
      templateId: clean ? (extra.templateId ?? f.templateId) : undefined,
    };
    const derived = derivePhaseStatus(nextPhases);
    if (derived) {
      next.status = derived.status;
      next.progress = derived.progress;
    }
    commitNode(next);
  };

  const inheritedDeps = (() => {
    const ownSet = new Set([...(f.deps || []), ...(f.softDeps || [])]);
    const inherited = [];
    let ancestorId = node.id.split('.').slice(0, -1).join('.');
    while (ancestorId) {
      const ancestor = tree.find(entry => entry.id === ancestorId);
      if (ancestor?.deps) {
        ancestor.deps.forEach(dep => {
          if (!ownSet.has(dep)) {
            inherited.push({ dep, from: ancestorId });
            ownSet.add(dep);
          }
        });
      }
      ancestorId = ancestorId.split('.').slice(0, -1).join('.');
    }
    return inherited;
  })();

  // Direct successors (read-only Successors list): every other task whose
  // deps OR softDeps point to *this* node. Doesn't follow ancestor chains —
  // only the explicit graph edges, which is what the user drew.
  const directSuccessors = (() => {
    const out = [];
    for (const r of tree || []) {
      if (r.id === node.id) continue;
      const hard = (r.deps || []).includes(node.id);
      const soft = (r.softDeps || []).includes(node.id);
      if (hard || soft) out.push({ id: r.id, name: r.name, soft: !hard && soft });
    }
    return out;
  })();

  return (
    <>
      <QuickEditHeader
        activateTab={activateTab}
        activeTab={activeTab}
        cpLabels={cpLabels}
        f={f}
        isCp={isCp}
        isLeaf={isLeaf}
        isRoot={isRoot}
        node={node}
        onEstimate={onEstimate}
        phases={phases}
        setTab={setTab}
        tabs={tabs}
      />

      {/* ══════ INSIGHTS TAB ══════ */}
      {activeTab === 'insights' && (
        <InsightsTab
          confReasons={confReasons}
          confidence={confidence}
          cpSet={cpSet}
          customFields={customFields}
          f={f}
          members={members}
          onOpenItem={onOpenItem}
          onSplitHandoff={onSplitHandoff}
          onSplitTaskAtProgress={onSplitTaskAtProgress}
          scheduled={scheduled}
          setFocusHint={setFocusHint}
          setTab={setTab}
          stats={stats}
          tabs={tabs}
          teams={teams}
          togglePhase={togglePhase}
          tree={tree}
        />
      )}

      {/* ══════ OVERVIEW TAB ══════ */}
      {activeTab === 'overview' && (
        <OverviewTab
          bufferNode={bufferNode}
          customFields={customFields}
          f={f}
          flushNode={flushNode}
          focusRefs={focusRefs}
          isLeaf={isLeaf}
          isRoot={isRoot}
          memberLabel={memberLabel}
          memberName={memberName}
          members={members}
          patchNode={patchNode}
          scheduled={scheduled}
          teams={teams}
        />
      )}

      {/* ══════ WORKFLOW TAB ══════ */}
      {activeTab === 'workflow' && (
        <WorkflowTab
          bufferNode={bufferNode}
          commitPhases={commitPhases}
          donePatch={donePatch}
          f={f}
          flushNode={flushNode}
          focusRefs={focusRefs}
          historyEvents={historyEvents}
          isLeaf={isLeaf}
          members={members}
          node={node}
          onHistoryChange={onHistoryChange}
          patchNode={patchNode}
          phases={phases}
          stats={stats}
          taskTemplates={taskTemplates}
          teams={teams}
          timeline={timeline}
          tree={tree}
          viewDay={viewDay}
        />
      )}

      {/* ══════ EFFORT TAB ══════ */}
      {activeTab === 'effort' && isLeaf && (
        <EffortTab
          CONF_OPTS={CONF_OPTS}
          REASON_TIP={REASON_TIP}
          SIZES={SIZES}
          bufferNode={bufferNode}
          confReasons={confReasons}
          confidence={confidence}
          f={f}
          flushNode={flushNode}
          focusRefs={focusRefs}
          members={members}
          nearestSize={nearestSize}
          node={node}
          onEstimate={onEstimate}
          patchNode={patchNode}
          sc={sc}
        />
      )}

      {/* ══════ TIMING TAB ══════ */}
      {activeTab === 'timing' && (
        <>
          {isLeaf && (
            <LeafTimingFields
              f={f}
              focusRefs={focusRefs}
              holidayIso={holidayIso}
              patchCompletion={patchCompletion}
              patchNode={patchNode}
              workDays={workDays}
            />
          )}
          {showDeadlineRelevant && (
            <DeadlineRelevantField
              deadlineParentExcluded={deadlineParentExcluded}
              deadlineRoot={deadlineRoot}
              deadlineRootId={deadlineRootId}
              f={f}
              patchNode={patchNode}
            />
          )}
          <PredecessorsField
            allIds={allIds}
            bufferNode={bufferNode}
            depAddKind={depAddKind}
            f={f}
            flushNode={flushNode}
            focusRefs={focusRefs}
            inheritedDeps={inheritedDeps}
            isLeaf={isLeaf}
            patchNode={patchNode}
            setDepAddKind={setDepAddKind}
            tree={tree}
          />
          <SuccessorsField
            allIds={allIds}
            directSuccessors={directSuccessors}
            node={node}
            onAddDep={onAddDep}
            onRemoveDep={onRemoveDep}
            setSuccAddKind={setSuccAddKind}
            succAddKind={succAddKind}
            tree={tree}
          />
        </>
      )}

      <hr className="divider" />
      <QuickEditActions
        f={f}
        node={node}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onSplitTaskAtProgress={onSplitTaskAtProgress}
        tree={tree}
      />
    </>
  );
}
