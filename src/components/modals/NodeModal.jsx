import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { insightTarget } from '../../utils/insightTargets.js';
import { TaskInsights } from '../shared/TaskInsights.jsx';
import { isLeafNode, leafNodes, leafProgress, derivePhaseStatus, parentId } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';
import { normalizePhases } from '../../utils/phases.js';
import { deadlineRootIdForNode, isDeadlineRelevantForRoot } from '../../utils/deadlines.js';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { useT } from '../../i18n.jsx';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { memberTeamNames } from '../../utils/memberTeams.js';
import { NodeHeader } from './node/NodeHeader.jsx';
import { NodeTabBar } from './node/NodeTabBar.jsx';
import { OverviewTab } from './node/OverviewTab.jsx';
import { WorkflowTab } from './node/WorkflowTab.jsx';
import { EffortTab } from './node/EffortTab.jsx';
import { TimingTab } from './node/TimingTab.jsx';
import { NodeFooter } from './node/NodeFooter.jsx';

// The dialog for one item. Nothing to show without one; the check sits out
// here so that the component below calls its hooks on every render.
export function NodeModal(props) {
  return props.node ? <NodeModalBody {...props} /> : null;
}

function NodeModalBody({
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
  historyEvents = [],
  focusRequest = null,
  viewDay = '',
  onClose,
  onUpdate,
  onDelete,
  onEstimate,
  onDuplicate,
  onMove,
  onNavigate,
  onHistoryChange,
  onSplitHandoff,
  onSplitTaskAtProgress,
  onDockSide,
}) {
  const { t, lang } = useT();
  // REASON_TIP and the confidence label are built inside the component using
  // t() — see reasonTip below (the label reuses the global conf.* keys).
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
  // Opening the dialog is an edit gesture, and status is the commonest edit.
  const [nmTab, setNmTab] = useState('workflow');
  // The day a status or progress change counts for. Empty means today. It is
  // not part of the item: it travels with the save and ends up in the log.
  const [asOf, setAsOf] = useState('');
  const nmTabsRef = useRef([]); // the tabs this item shows, for ⌥1–⌥7
  const [focusHint, setFocusHint] = useState(null);
  const [highlightedDepId, setHighlightedDepId] = useState(null);
  const depRowRefs = useRef({});
  const activateTab = (e, action) => {
    if (e.button !== 0) return;
    e.preventDefault();
    action();
  };

  // Refs for focus targets — keyed by focusHint value
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

  useEffect(() => setF({ ...node }), [node?.id]);

  useEffect(() => {
    if (!focusRequest) {
      setHighlightedDepId(null);
      return;
    }
    const requestedTab =
      focusRequest.tab ||
      (focusRequest.focusHint === 'deps' ? 'timing' : null) ||
      // A click on a handoff bar lands on Details, where team and person are.
      // This said 'details', which is no tab id here, so it opened Insights —
      // and the hint below sat on Workflow, where nobody was sent.
      (focusRequest.section === 'handoff' ? 'overview' : null);
    if (requestedTab) setNmTab(requestedTab);
    if (focusRequest.focusHint) setFocusHint(focusRequest.focusHint);
    setHighlightedDepId(focusRequest.depId || null);
  }, [focusRequest, node?.id]);

  // Focus the primary field after tab switch driven by Insights click
  useLayoutEffect(() => {
    if (!focusHint) return;
    const el = focusRefs[focusHint]?.current;
    if (el) {
      // If el is a native input/textarea, focus it directly; otherwise focus first input inside
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
  }, [focusHint, nmTab]);

  useLayoutEffect(() => {
    if (!highlightedDepId || nmTab !== 'timing') return;
    const row = depRowRefs.current[highlightedDepId];
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const id = window.setTimeout(() => setHighlightedDepId(current => (current === highlightedDepId ? null : current)), 2200);
    return () => window.clearTimeout(id);
  }, [highlightedDepId, nmTab, f.deps]);

  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);
  const isDirty = useMemo(() => node && JSON.stringify({ ...node }) !== JSON.stringify(f), [node, f]);
  const safeClose = () => {
    if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
    onClose();
  };
  const handleNavigate = id => {
    if (!id || !onNavigate) return;
    if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
    onNavigate(id);
  };
  // The dialog's keyboard. It opens with E from the tree, the Gantt and the
  // Work order, and then could only be used with the mouse: nothing inside
  // had focus, the tabs took no keys, Save had no key, and Tab walked out
  // into the page behind. Now:
  //   ⌥1–⌥7        switch tab, from anywhere in the dialog (the physical key —
  //                ⌥digit types a character on macOS, so e.code is read)
  //   ←/→ Home End on the tab bar, the WAI-ARIA tabs pattern
  //   ⌘↵ / Ctrl↵   save and close
  //   Esc          close — unless a dropdown in the dialog took it first
  //   Tab / ⇧Tab   stay inside the dialog
  const modalRef = useRef(null);
  const tabBarRef = useRef(null);
  const focusActiveTab = () => requestAnimationFrame(() => tabBarRef.current?.querySelector('[aria-selected="true"]')?.focus());
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        if (!e.defaultPrevented) safeClose();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        if (isDirty) save();
        onClose();
        return;
      }
      const digit = /^Digit([1-9])$/.exec(e.code || '');
      if (digit && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const target = nmTabsRef.current[Number(digit[1]) - 1];
        if (!target) return;
        e.preventDefault();
        setNmTab(target.id);
        focusActiveTab();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = [
          ...modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ]
          // Hidden tabs are unmounted, so what is in the DOM is what is on screen.
          .filter(el => !el.disabled);
        if (!focusables.length) return;
        const first = focusables[0],
          last = focusables[focusables.length - 1];
        const inside = modalRef.current.contains(document.activeElement);
        if (!inside || (e.shiftKey && document.activeElement === first)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDirty, f, asOf]);
  // Opening puts the keyboard in the dialog: on the active tab, unless the
  // tab's own field already took it (Details focuses the name, an Insights
  // jump its field). Before, focus stayed on the row behind the overlay.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!modalRef.current || modalRef.current.contains(document.activeElement)) return;
      tabBarRef.current?.querySelector('[aria-selected="true"]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [node?.id]);
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
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));
  const donePatch = source => {
    const today = iso(new Date());
    const completedAt = source.completedAt && source.completedAt <= today ? source.completedAt : today;
    const completedEnd = source.completedEnd && source.completedEnd <= completedAt ? source.completedEnd : completedAt;
    const patch = { status: 'done', progress: 100, completedAt, completedEnd };
    // Seed completedStart so the done-bar always has a draggable left edge.
    // Pick the first sane value: explicit completedStart, plannedStart from
    // the last schedule, else completedEnd (single-day fallback). Clamp at
    // completedEnd so a future-dated plannedStart can't invert the window.
    const seedCandidate = source.completedStart || source.plannedStart || completedEnd;
    patch.completedStart = seedCandidate && seedCandidate <= completedEnd ? seedCandidate : completedEnd;
    return patch;
  };
  // open → wip: record the actual start so Soll/Ist has an Ist-Start the moment
  // work begins (instead of only back-filling it on completion). Prefer an
  // already-set completedStart, then the scheduled plannedStart, else today —
  // never a future date. No-op once completedStart exists.
  const wipStartSeed = source => {
    if (source.completedStart) return source.completedStart;
    const today = iso(new Date());
    const cand = source.plannedStart;
    return cand && cand <= today ? cand : today;
  };
  // A change dated to an earlier day: the completion follows the date, and the
  // date goes along so the log files the change where it belongs.
  const today = iso(new Date());
  // On an earlier day every change counts for that day; there is nothing to pick.
  const asOfDay = !viewDay && /^\d{4}-\d{2}-\d{2}$/.test(asOf) && asOf < today ? asOf : '';
  const stateChanged = (f.status || 'open') !== (node.status || 'open') || (f.progress ?? 0) !== (node.progress ?? 0);
  const save = () => {
    if (!asOfDay || !stateChanged) {
      onUpdate(f);
      return;
    }
    const becameDone = f.status === 'done' && node.status !== 'done';
    const saved = becameDone
      ? {
          ...f,
          completedAt: asOfDay,
          completedEnd: asOfDay,
          completedStart: f.completedStart && f.completedStart <= asOfDay ? f.completedStart : asOfDay,
        }
      : f;
    onUpdate(saved, { asOf: asOfDay });
  };
  const asOfField = (
    <div
      data-testid="nm-as-of-row"
      style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '-2px 0 12px', fontSize: 12, color: 'var(--tx2)', flexWrap: 'wrap' }}
    >
      <span>{t('nm.asOf')}</span>
      <input
        type="date"
        data-testid="nm-as-of"
        value={asOf || today}
        max={today}
        onChange={e => setAsOf(e.target.value)}
        data-htip={t('nm.asOfTip')}
        style={{ width: 150 }}
      />
      {asOfDay && (
        <span data-testid="nm-as-of-note" style={{ fontSize: 11, color: 'var(--ac)' }}>
          {t('nm.asOfNote', asOfDay)}
        </span>
      )}
    </div>
  );
  const setCompletion = patch =>
    setF(current => {
      const next = { ...current, ...patch };
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
      return {
        ...current,
        completedStart: next.completedStart || '',
        completedEnd: next.completedEnd || '',
        completedAt: next.completedAt || '',
      };
    });
  const allIds = tree.map(r => r.id).filter(i => i !== node.id);
  const findById = id => tree.find(r => r.id === id);
  const memberLabel = m => `${m.name || m.id}${m.team ? ' — ' + memberTeamNames(m, teams).join(' + ') : ''}`;
  const SIZES = (projectSizes?.length ? projectSizes : DEFAULT_SIZES).map(s => [s.label, s.days, s.factor, s.desc || '']);
  const nearestSize =
    f.best > 0 ? SIZES.reduce((best, sz) => (Math.abs(sz[1] - f.best) < Math.abs(best[1] - f.best) ? sz : best), SIZES[0]) : null;
  const CONF_OPTS = useMemo(
    () => [
      { id: '', label: t('auto') },
      { id: 'committed', label: `${t('conf.committed.dot')} ${t('conf.committed')}` },
      { id: 'estimated', label: `${t('conf.estimated.dot')} ${t('conf.estimated')}` },
      { id: 'exploratory', label: `${t('conf.exploratory.dot')} ${t('conf.exploratory')}` },
    ],
    [t],
  );

  const phases = normalizePhases(f.phases);
  const timeline = useMemo(() => summarizeNodeTimeline(tree, scheduled, f), [tree, scheduled, f]);

  // Ancestors
  const ancestors = [];
  if (!isRoot) {
    const parts = node.id.split('.');
    for (let i = 1; i < parts.length; i++) {
      const a = tree.find(r => r.id === parts.slice(0, i).join('.'));
      if (a) ancestors.push(a);
    }
  }
  const currentParentId = node.id.split('.').slice(0, -1).join('.');
  const parentOptions = [
    { id: '', label: t('nm.topLevel') },
    ...tree.filter(r => r.id !== node.id && !r.id.startsWith(node.id + '.')).map(r => ({ id: r.id, label: r.name })),
  ];
  const inheritedDeps = (() => {
    const own = new Set(node?.deps || []);
    const inherited = [];
    let aid = node?.id ? node.id.split('.').slice(0, -1).join('.') : '';
    while (aid) {
      const ancestor = tree.find(r => r.id === aid);
      if (ancestor?.deps)
        ancestor.deps.forEach(d => {
          if (!own.has(d)) inherited.push({ dep: d, from: aid });
        });
      aid = aid.split('.').slice(0, -1).join('.');
    }
    return inherited;
  })();
  const stat = !isLeaf ? stats?.[node.id] : null;
  const leafCountUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length : 0;
  const doneUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.') && c.status === 'done').length : 0;
  const progPct = !isLeaf ? (leafCountUnder ? Math.round((doneUnder / leafCountUnder) * 100) : 0) : (f.progress ?? leafProgress(f));

  // Phases onChange: phases define status + progress
  const handlePhaseChange = (nextPhases, extra = {}) => {
    setF(x => {
      const clean = nextPhases.length ? nextPhases : undefined;
      const next = { ...x, ...extra, phases: clean, templateId: clean ? (extra.templateId ?? x.templateId) : undefined };
      const derived = derivePhaseStatus(nextPhases);
      if (derived) {
        next.status = derived.status;
        next.progress = derived.progress;
      }
      return next;
    });
  };

  // Phase inline toggle from Insights: cycle open → wip → done → open
  const handlePhaseToggle = phaseId => {
    setF(x => {
      const nextPhases = (x.phases || []).map(p => {
        if (p.id !== phaseId) return p;
        const next = p.status === 'open' ? 'wip' : p.status === 'wip' ? 'done' : 'open';
        return { ...p, status: next };
      });
      const derived = derivePhaseStatus(nextPhases);
      return { ...x, phases: nextPhases, ...(derived ? { status: derived.status, progress: derived.progress } : {}) };
    });
  };

  // Tab definitions
  const nmTabs = [
    // Fixed positions: the one tab only a task has comes last, so every
    // other tab sits in the same place for a task and for a package.
    { id: 'insights', label: t('nm.tab.insights') },
    { id: 'workflow', label: t('qe.tab.workflow') },
    { id: 'overview', label: t('qe.tab.overview') },
    { id: 'timing', label: t('qe.tab.timing') },
    ...(isLeaf ? [{ id: 'effort', label: t('qe.tab.effort') }] : []),
  ];
  const activeNmTab = nmTabs.find(x => x.id === nmTab) ? nmTab : 'workflow';
  nmTabsRef.current = nmTabs;
  const customFields = projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS;
  const setCustomValue = (fieldId, val) => s('customValues', { ...(f.customValues || {}), [fieldId]: val });

  return (
    <div className="overlay">
      <div
        ref={modalRef}
        className="modal modal-lg fade"
        data-testid="node-modal"
        data-node-id={node.id}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${node.id} ${node.name || ''}`.trim()}
      >
        {/* ── HEADER ── */}
        <NodeHeader
          t={t}
          lang={lang}
          f={f}
          s={s}
          node={node}
          ancestors={ancestors}
          cpLabels={cpLabels}
          focusRequest={focusRequest}
          handleNavigate={handleNavigate}
          isCp={isCp}
          isDirty={isDirty}
          isLeaf={isLeaf}
          onDockSide={onDockSide}
          onNavigate={onNavigate}
          timeline={timeline}
        />

        {/* ── TAB BAR ── */}
        <NodeTabBar
          nmTabs={nmTabs}
          activeNmTab={activeNmTab}
          setNmTab={setNmTab}
          activateTab={activateTab}
          focusActiveTab={focusActiveTab}
          tabBarRef={tabBarRef}
        />

        {/* ══════ INSIGHTS TAB ══════ */}
        {activeNmTab === 'insights' && (
          <TaskInsights
            node={f}
            tree={tree}
            members={members}
            teams={teams}
            scheduled={scheduled}
            cpSet={cpSet}
            stats={stats}
            confidence={confidence}
            confReasons={confReasons}
            customFields={projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS}
            onPhaseToggle={handlePhaseToggle}
            onOpenItem={handleNavigate}
            onSplitHandoff={onSplitHandoff}
            onSplitTaskAtProgress={onSplitTaskAtProgress}
            onEditSection={sectionId => {
              const target = insightTarget(sectionId, nmTabs);
              setNmTab(target.tab);
              setFocusHint(target.focus);
            }}
          />
        )}

        {/* ══════ OVERVIEW TAB ══════ */}
        {activeNmTab === 'overview' && (
          <OverviewTab
            t={t}
            f={f}
            s={s}
            setF={setF}
            node={node}
            tree={tree}
            teams={teams}
            members={members}
            scheduled={scheduled}
            isDirty={isDirty}
            isLeaf={isLeaf}
            isRoot={isRoot}
            focusRefs={focusRefs}
            currentParentId={currentParentId}
            parentOptions={parentOptions}
            memberLabel={memberLabel}
            customFields={customFields}
            setCustomValue={setCustomValue}
            onMove={onMove}
          />
        )}

        {/* ══════ WORKFLOW TAB ══════ */}
        {activeNmTab === 'workflow' && (
          <WorkflowTab
            t={t}
            lang={lang}
            f={f}
            setF={setF}
            node={node}
            tree={tree}
            teams={teams}
            members={members}
            taskTemplates={taskTemplates}
            historyEvents={historyEvents}
            viewDay={viewDay}
            isLeaf={isLeaf}
            focusRefs={focusRefs}
            timeline={timeline}
            phases={phases}
            stat={stat}
            progPct={progPct}
            leafCountUnder={leafCountUnder}
            doneUnder={doneUnder}
            stateChanged={stateChanged}
            asOfField={asOfField}
            donePatch={donePatch}
            wipStartSeed={wipStartSeed}
            handlePhaseChange={handlePhaseChange}
            onHistoryChange={onHistoryChange}
          />
        )}

        {/* ══════ EFFORT TAB ══════ */}
        {activeNmTab === 'effort' && isLeaf && (
          <EffortTab
            t={t}
            f={f}
            s={s}
            node={node}
            sc={sc}
            members={members}
            confidence={confidence}
            confReasons={confReasons}
            isDirty={isDirty}
            focusRefs={focusRefs}
            onClose={onClose}
            onEstimate={onEstimate}
            SIZES={SIZES}
            nearestSize={nearestSize}
            CONF_OPTS={CONF_OPTS}
            REASON_TIP={REASON_TIP}
          />
        )}

        {/* ══════ TIMING TAB ══════ */}
        {activeNmTab === 'timing' && (
          <TimingTab
            t={t}
            f={f}
            s={s}
            setF={setF}
            node={node}
            tree={tree}
            isLeaf={isLeaf}
            focusRefs={focusRefs}
            depRowRefs={depRowRefs}
            highlightedDepId={highlightedDepId}
            handleNavigate={handleNavigate}
            onNavigate={onNavigate}
            allIds={allIds}
            findById={findById}
            inheritedDeps={inheritedDeps}
            setCompletion={setCompletion}
            deadlineRoot={deadlineRoot}
            deadlineRootId={deadlineRootId}
            deadlineParentExcluded={deadlineParentExcluded}
            showDeadlineRelevant={showDeadlineRelevant}
          />
        )}

        {/* ── ACTIONS ── */}
        <NodeFooter
          t={t}
          f={f}
          node={node}
          tree={tree}
          isDirty={isDirty}
          safeClose={safeClose}
          save={save}
          onClose={onClose}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onSplitTaskAtProgress={onSplitTaskAtProgress}
        />
      </div>
    </div>
  );
}
