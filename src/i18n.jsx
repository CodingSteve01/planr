import { createContext, useContext, useState, useEffect, useMemo } from 'react';

// ── Translations ─────────────────────────────────────────────────────────────
// Flat key–value maps. Keys are grouped by component prefix for maintainability.
// Interpolation: {0}, {1}, {2} etc. are replaced positionally by t(key, ...args).
const en = {
  // ── Global / shared ──
  'save': 'Save', 'cancel': 'Cancel', 'delete': 'Delete', 'close': 'Close', 'back': 'Back', 'next': 'Next',
  'yes': 'Yes', 'no': 'No', 'auto': 'Auto', 'none': '— None',
  'open': 'Open', 'wip': 'In Progress', 'done': '✓ Done',
  'critical': 'Critical', 'high': 'High', 'medium': 'Medium', 'low': 'Low',
  'goal': 'Goal', 'painpoint': 'Painpoint', 'deadline': 'Deadline',
  'goals': 'Goals', 'painpoints': 'Painpoints', 'deadlines': 'Deadlines',
  'pt': 'PT', 'days': 'days', 'weeks': 'weeks',
  'noTeam': 'No team', 'unassigned': '(unassigned)',
  'months': 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
  'daysShort': 'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
  'conf.committed': 'Committed', 'conf.estimated': 'Estimated', 'conf.exploratory': 'Exploratory',
  'conf.committed.dot': '●', 'conf.estimated.dot': '◐', 'conf.exploratory.dot': '○',
  'cp': 'Critical path',

  // ── Tabs ──
  'tab.summary': 'Overview', 'tab.plan': 'Planning', 'tab.tree': 'Work Tree',
  'tab.gantt': 'Schedule', 'tab.net': 'Network', 'tab.resources': 'Resources', 'tab.holidays': 'Holidays',

  // ── QuickEdit ──
  'qe.cpItem': 'Critical path item',
  'qe.name': 'Name', 'qe.status': 'Status', 'qe.team': 'Team', 'qe.assignee': 'Assignee',
  'qe.confidence': 'Confidence', 'qe.progress': 'Progress',
  'qe.focusType': 'Focus type', 'qe.severity': 'Severity', 'qe.date': 'Date',
  'qe.description': 'Description', 'qe.descPlaceholder': 'Why does this matter?',
  'qe.quickEstimate': 'Estimate', 'qe.bestDays': 'Best (days)', 'qe.factor': 'Factor',
  'qe.priority': 'Priority', 'qe.estimationWizard': 'Estimation helper...', 'qe.estimateNow': 'Estimate now',
  'qe.decideBy': 'Decide by', 'qe.pinnedStart': 'Pinned start', 'qe.parallel': 'Parallel',
  'qe.queue': 'Queue', 'qe.predecessors': 'Predecessors', 'qe.successors': 'Successors',
  'qe.notes': 'Notes', 'qe.duplicate': 'Duplicate', 'qe.assignPerson': 'Assign person...',
  'qe.children': 'Children', 'qe.best': 'Best', 'qe.realistic': 'Realistic',
  'qe.period': 'Period', 'qe.duration': 'Duration', 'qe.person': 'Person',
  'qe.effort': 'Effort', 'qe.realisticSuffix': 'realistic', 'qe.notScheduled': 'not scheduled',
  'qe.leafItems': 'leaf items', 'qe.autoStatus': '(auto)',
  'qe.tab.overview': 'Overview', 'qe.tab.workflow': 'Workflow', 'qe.tab.estimate': 'Estimate', 'qe.tab.schedule': 'Plan', 'qe.tab.deps': 'Dependencies', 'qe.tab.effort': 'Effort', 'qe.tab.timing': 'Timing',
  'qe.horizonHint': 'H1 is for committed work, H2 for estimated work, and everything after that may stay exploratory until it is clarified.',
  'qe.allLeaves': 'all leaves',
  'qe.confirmRelease': '"{0}" will no longer wait for this item?',
  'qe.confirmDelete': 'Delete {0}?', 'qe.confirmDeleteChildren': 'Delete {0} and all children?',
  'qe.confirmDuplicate': 'Duplicate "{0}"?', 'qe.confirmDuplicateN': 'Duplicate "{0}" with {1} descendants?',

  // ── NodeModal ──
  'nm.focusType': 'Focus type', 'nm.severity': 'Severity',
  'nm.appliesToAllLeaves': '(applies to all leaves)',
  'nm.advanced': 'Advanced', 'nm.parent': 'Parent (move this item + descendants)',
  'nm.topLevel': '— Top level —', 'nm.seq': 'Seq',
  'nm.confidenceOverride': 'Confidence override',
  'nm.runParallel': 'Run in parallel', 'nm.capacityBypass': 'capacity bypass',
  'nm.queuePosition': 'Queue position',
  'nm.first': 'First', 'nm.earlier': 'Earlier', 'nm.later': 'Later', 'nm.last': 'Last',
  'nm.pinToday': 'Today', 'nm.noChanges': 'No changes',
  'nm.confirmMove': 'Move "{0}" + {1} descendants under "{2}"?',
  'nm.saveFirst': 'Save or discard pending changes before moving.',
  'nm.unsavedDiscard': 'You have unsaved changes. Discard and close?',

  // ── Gantt ──
  'g.group': 'Group', 'g.project': 'Project', 'g.projTeam': 'Project › Team',
  'g.team': 'Team', 'g.person': 'Person',
  'g.noItems': 'No items yet', 'g.addTasks': 'Add tasks to see the Gantt chart.',
  'g.zoom': 'Zoom', 'g.week': 'Week', 'g.day': 'Day', 'g.today': 'Today',
  'g.noEstimate': 'no estimate', 'g.matches': 'matches',
  'g.cpLabel': 'Critical path', 'g.barHelp': 'Bar drag ← → = pin · ↑ ↓ = reorder queue · edge handle = link · Right-click = more',
  'g.linkClick': 'Click another bar to {0}', 'g.linkDrop': 'Drop on a bar to link as dependency',
  'g.ctxEdit': 'Open / edit…', 'g.ctxSucc': 'Add a successor… (this → other)',
  'g.ctxPred': 'Add a predecessor… (other → this)',
  'g.ctxParallel': 'Run in parallel', 'g.ctxSequential': 'Sequential (disable parallel)',
  'g.ctxQueueOrder': 'Queue order', 'g.ctxRunFirst': 'Run first', 'g.ctxRunEarlier': 'Run earlier',
  'g.ctxRunLater': 'Run later', 'g.ctxRunLast': 'Run last',
  'g.ctxUnpin': 'Unpin', 'g.ctxPinCurrent': 'Pin to current start',
  'g.ctxRemoveDep': 'Remove dependency',
  'g.confirmRemoveDep': 'Remove dependency: {0} no longer depends on {1}?',
  'g.horizonLegend': 'H1 committed · H2 estimated · H3 exploratory',
  'g.horizonLegendTip': 'Before H1 work should be committed, before H2 at least estimated, and after H2 exploratory work is still acceptable.',

  // ── SumView ──
  's.projected': 'Projected end', 's.focus': 'Focus',
  's.planConfidence': 'Planning confidence', 's.openPlanReview': 'Open Planning Review →',
  's.upNext': 'Up next', 's.scheduledWithin': '(scheduled to start within)',
  's.tasks': 'tasks', 's.lanes': 'lanes', 's.lane': 'lane',
  's.resources': 'Resources', 's.people': 'People', 's.totalPt': 'Total PT',
  's.topItems': 'Top Items', 's.effort': 'Effort', 's.progress': 'Progress',
  's.doneOf': '{0} done · {1} in progress · {2} open of {3} leaf items',
  's.onTrack': 'On track', 's.atRisk': 'AT RISK', 's.linked': 'linked',
  's.tasksDone': '{0} tasks done · {1} on critical path',
  's.horizonKicker': 'Planning horizons',
  's.horizonTitle': 'What needs to be clear next',
  's.horizonLead': 'The closer work gets, the more explicit the plan should become.',
  's.horizonCommitted': 'Committed',
  's.horizonCommittedBody': 'Starts soon: owner, scope, estimate, and blockers should be reliable.',
  's.horizonEstimated': 'Roughly planned',
  's.horizonEstimatedBody': 'Comes after that: cut work roughly, assign a team, and surface risks.',
  's.horizonExploratory': 'Still open',
  's.horizonExploratoryBody': 'Farther out: keep it visible, but leave details intentionally open.',
  's.horizonFoot': 'Rule of thumb: commit H1, rough-plan H2, and keep H3 lightweight.',
  's.exportTodo': 'Export TODO list',

  // ── PlanReview ──
  'p.clear': 'clear', 'p.needsPerson': 'needs person', 'p.unclear': 'unclear',
  'p.finished': 'finished',
  'p.decisions': 'Decisions', 'p.teamCapacity': 'Team capacity', 'p.blocked': 'Blocked',
  'p.allAssigned': 'Everything assigned',
  'p.allAssignedDesc': 'Every ready-to-start item has an assignee.',
  'p.readyItems': 'These {0} items are ready to start (no blocking dependencies), but have no person assigned. Who should do them?',
  'p.waitingFor': 'Waiting for',
  'p.assignPerson': 'Assign person...', 'p.items': 'Items',
  'p.assigned': 'assigned', 'p.open': 'open',
  'p.noBlocked': 'No blocked items without a person.',
  'p.blockedDesc': 'These items need a person but cannot start until their dependencies are done.',
  'p.phaseTodos': 'Phase todos', 'p.noPhaseTodos': 'No open phases right now.',
  'p.phaseTodosDesc': 'These {0} open phases are grouped by person or fallback team so they work as practical TODO lists.',
  'p.advancePhase': 'Advance phase', 'p.assignPhasePerson': 'Assign phase owner...',

  // ── EstimationWizard ──
  'ew.title': 'Estimation Wizard',
  'ew.steps': 'Scope,Size,Risks,Three-Point,Dependencies,Confidence,Summary',
  'ew.scopeQ': 'What exactly needs to be done?',
  'ew.scopeHelp': 'Be specific. Vague scope = inaccurate estimates.',
  'ew.scopeRelated': 'Similar tasks in this group (for reference)',
  'ew.sizeQ': "What's your gut feeling for the size of this task?",
  'ew.xs': 'Trivial change, config, typo fix',
  'ew.s': 'Small feature, simple bugfix',
  'ew.m': 'Standard feature, moderate complexity',
  'ew.l': 'Large feature, multiple components',
  'ew.xl': 'Major feature, cross-cutting concerns',
  'ew.xxl': 'Epic, full module/system build',
  'ew.risksQ': 'Which risks apply to this task? Each adds to the uncertainty factor.',
  'ew.risk.newTech': 'New technology / unknown territory',
  'ew.risk.external': 'External dependencies (APIs, partners)',
  'ew.risk.migration': 'Data migration involved',
  'ew.risk.ux': 'Significant UI/UX design needed',
  'ew.risk.stakeholder': 'Requires stakeholder alignment',
  'ew.risk.integration': 'Complex system integration',
  'ew.risk.legacy': 'Working with legacy code',
  'ew.risk.unclear': 'Requirements not fully clear',
  'ew.riskFactor': 'Risk factor', 'ew.risksSelected': '{0} risks selected',
  'ew.threePointQ': 'Refine with a three-point estimate (PERT method). The weighted average = (O + 4R + P) / 6',
  'ew.optimistic': 'Optimistic (best case)', 'ew.optHelp': 'Everything goes perfectly',
  'ew.realisticLabel': 'Realistic (most likely)', 'ew.realHelp': 'Normal conditions',
  'ew.pessimistic': 'Pessimistic (worst case)', 'ew.pessHelp': "Murphy's law applies",
  'ew.pert': 'PERT', 'ew.stdDev': 'Std dev', 'ew.confRange': 'Confidence range',
  'ew.depsQ': 'What must be finished before this task can start?',
  'ew.depsBlocked': 'This task is blocked by {0} items. The scheduler will only start it after all dependencies are done.',
  'ew.confQ': 'How confident are you about scope and effort?',
  'ew.confAuto': 'Auto (Planr decides)', 'ew.confAutoDesc': 'Planr derives confidence from person/effort/risk.',
  'ew.confCommitted': '● Committed — well defined', 'ew.confCommittedDesc': 'Scope is clear, estimate is solid, person is known.',
  'ew.confEstimated': '◐ Estimated — roughly estimated', 'ew.confEstimatedDesc': 'Rough estimate, scope basically known, details still open.',
  'ew.confExploratory': '○ Exploratory — scope unclear', 'ew.confExploratoryDesc': 'We don\'t know exactly what to do yet. Concept work needed first.',
  'ew.confRiskHint': 'You selected {0} risks (factor ×{1}). With this much uncertainty, consider "Estimated" or "Exploratory".',
  'ew.summary': 'Estimation Summary',
  'ew.bestCase': 'Best case (days)', 'ew.uncertaintyFactor': 'Uncertainty factor',
  'ew.realisticDays': 'Realistic (days)', 'ew.worstCase': 'Worst case (days)',
  'ew.risksIdentified': 'Risks identified', 'ew.apply': 'Apply estimate',
  'ew.flowKicker': 'Top-down flow', 'ew.flowTitle': 'Classify first, estimate right away, refine later.',
  'ew.flowBody': 'Choose the workflow template in the wizard so a new project branch can be structured, classified, and estimated in one pass.',
  'ew.templateLabel': 'Workflow template', 'ew.templateHelp': 'Templates are selectable directly in the wizard so classification and estimation stay in the same flow.',
  'ew.discardConfirm': 'Discard your estimate inputs? Everything you entered will be lost.',

  // ── Tooltip ──
  'tt.assigned': 'Assigned', 'tt.team': 'Team', 'tt.bestCase': 'Best case',
  'tt.realistic': 'Realistic', 'tt.start': 'Start', 'tt.end': 'End',
  'tt.deps': 'Dependencies', 'tt.cp': 'Critical path', 'tt.cpYes': 'YES',
  'tt.dblClick': 'Dbl-click for details',

  // ── Settings ──
  'set.title': 'Project Settings', 'set.globalTitle': 'Global Settings',
  'set.projectName': 'Project name', 'set.planStart': 'Plan start', 'set.planEnd': 'Plan end',
  'set.workDays': 'Working days', 'set.language': 'Language', 'set.theme': 'Color scheme',
  'set.themeAuto': 'Auto (system)', 'set.themeDark': 'Dark', 'set.themeLight': 'Light',
  'set.langAuto': 'Auto', 'set.langEn': 'English', 'set.langDe': 'Deutsch',
  'set.dayNames': 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',

  // ── Phases & Templates ──
  'ph.phases': 'Phases', 'ph.noPhases': 'No phases defined.',
  'ph.applyTemplate': 'Apply template…', 'ph.addPhase': '+ Phase',
  'ph.clearPhases': 'Remove all phases', 'ph.currentPhase': 'current',
  'ph.templates': 'Task Templates', 'ph.newTemplate': '+ New template',
  'ph.editTemplate': 'Edit', 'ph.templateName': 'Template name',
  'ph.phaseName': 'Phase name', 'ph.phaseTeam': 'Team',
  'ph.phaseTeams': 'Teams', 'ph.phaseAssignees': 'Owners',
  'ph.phaseTeamAdd': 'Add team...', 'ph.phaseAssigneeAdd': 'Add owner...',
  'ph.effortHelp': 'Phase effort is optional. If the total stays below 100%, the remaining share is distributed evenly across phases without an explicit value.',
  'ph.templateHelp': 'Templates support multiple teams per phase and optional effort percentages.',
  'ph.confirmClear': 'Remove all phases from this task?',
  'ph.confirmDeleteTpl': 'Delete template "{0}"?',
  'ph.applied': 'Template: {0}', 'ph.freePhase': 'New phase',
  'ph.moveUp': 'Move up', 'ph.moveDown': 'Move down',
  'ph.via': 'via {0}',

  // ── TreeView ──
  'tv.collapseAll': 'Collapse all', 'tv.expandAll': 'Expand all',
  'tv.items': 'items', 'tv.leafs': 'leafs',
  'tv.addItem': '+ Add item', 'tv.allTeams': 'All teams', 'tv.allRoots': 'All items', 'tv.allPeople': 'All people',

  // ── Sizes ──
  'set.sizes': 'T-Shirt Sizes', 'set.sizeCatalogue': 'T-Shirt Size Catalogue',
  'set.sizeHelp': 'These sizes appear in the Estimation Wizard and quick-estimate pickers. Each size sets the default best-case day count and uncertainty factor.',
  'set.sizeLabel': 'Label', 'set.sizeDays': 'Days', 'set.sizeFactor': 'Factor', 'set.sizeDesc': 'Description (optional)',
  'set.sizeLabelPlaceholder': 'e.g. M', 'set.addSize': '+ Size',
  'set.resetSizes': 'Reset to defaults', 'set.confirmResetSizes': 'Reset sizes to default values?',

  // ── Risks ──
  'set.risks': 'Risks', 'set.riskCatalogue': 'Risk Catalogue',
  'set.riskHelp': 'These risks appear in the Estimation Wizard. Each selected risk increases the uncertainty factor by its weight.',
  'set.riskName': 'Risk description', 'set.addRisk': '+ Risk',
  'set.resetRisks': 'Reset to defaults', 'set.confirmResetRisks': 'Reset risks to default values?',

  // ── Custom Fields ──
  'cf.tab': 'Custom Fields',
  'cf.name': 'Field name', 'cf.type': 'Type', 'cf.template': 'URI template (optional)',
  'cf.options': 'Options (comma-separated)', 'cf.addField': '+ Add field', 'cf.removeField': 'Remove field',
  'cf.help': 'Custom fields appear on all tasks. URI fields can auto-build links from a template like https://company.atlassian.net/browse/{value}.',
  'cf.type.text': 'Text', 'cf.type.number': 'Number', 'cf.type.uri': 'URI / Link', 'cf.type.select': 'Select',
  'cf.openLink': 'Open link',
  'cf.fieldValues': 'Custom Fields',

  // ── AutoAssignHint ──
  'aa.suggestion': 'Suggestion:', 'aa.accept': 'Accept',

  // ── NewProjModal ──
  'np.title': 'New project', 'np.titleFocus': '— Focus',
  'np.projectName': 'Project name', 'np.projectNamePlaceholder': 'My project',
  'np.planStart': 'Plan start', 'np.planEnd': 'Plan end', 'np.holidays': 'Holidays',
  'np.teams': 'Teams', 'np.addTeam': '+ Add team',
  'np.teamId': 'ID', 'np.teamName': 'Name', 'np.teamNamePlaceholder': 'Team name',
  'np.teamColor': 'Color', 'np.removeTeam': 'Remove',
  'np.nextFocus': 'Next →', 'np.backStep': '← Back',
  'np.createProject': 'Create project',
  'np.focusLead': 'Start with the big topics: goals, painpoints, and deadlines. Planr will create them as top-level items so you can break them down into causes, measures, and leaf tasks afterwards.',
  'np.addGoal': 'Add {0}',
  'np.noFocus': 'No focus items yet. Add some above, or skip this step.',
  'np.descPlaceholder': 'Description (optional)',
  'np.template': 'Project template', 'np.templateHelp': 'Choose a template that matches your use case. It seeds the project with suitable sizes, risks, and task templates — you can adjust everything in Settings afterwards.',

  // ── Project Templates ──
  'tpl.softwareDev': 'Software Development',
  'tpl.softwareDev.desc': 'Classic software project — RE, refinement, dev, testing. Sizes XS–XXL in days, standard tech risks.',
  'tpl.generic': 'Generic / Empty',
  'tpl.generic.desc': 'Minimal starting point: basic sizes XS–XL, simple risks, one task template. Adjust everything to your needs.',
  // Software Dev — content
  'tpl.sw.risk.newTech':    'New technology / unknown territory',
  'tpl.sw.risk.external':   'External dependencies (APIs, partners)',
  'tpl.sw.risk.integration': 'Complex system integration',
  'tpl.sw.risk.unclear':    'Requirements not fully clear',
  'tpl.sw.size.xs':  'Trivial change, configuration, typo fix',
  'tpl.sw.size.s':   'Small feature, simple bugfix',
  'tpl.sw.size.m':   'Standard feature, medium complexity',
  'tpl.sw.size.l':   'Larger feature, multiple components',
  'tpl.sw.size.xl':  'Extensive feature, cross-cutting changes',
  'tpl.sw.size.xxl': 'Epic, complete module or system',
  'tpl.sw.tt.fullcycle': 'Full-stack development',
  'tpl.sw.tt.bugfix':    'Bugfix & hotfix',
  'tpl.sw.phase.re':         'Requirements engineering',
  'tpl.sw.phase.refinement': 'Refinement / design',
  'tpl.sw.phase.dev':        'Development',
  'tpl.sw.phase.qa':         'Testing / QA',
  'tpl.sw.phase.analysis':   'Analysis',
  'tpl.sw.phase.fix':        'Fix',
  'tpl.sw.phase.verify':     'Verification',
  // Generic — content
  'tpl.gen.risk.unclear':  'Requirements still unclear',
  'tpl.gen.risk.external': 'External dependencies',
  'tpl.gen.risk.resource': 'Resources constrained',
  'tpl.gen.size.xs': 'Very small task',
  'tpl.gen.size.s':  'Small task',
  'tpl.gen.size.m':  'Medium task',
  'tpl.gen.size.l':  'Large task',
  'tpl.gen.size.xl': 'Very large task',
  'tpl.gen.tt.std': 'Simple workflow',
  'tpl.gen.phase.prep':    'Preparation',
  'tpl.gen.phase.execute': 'Execution',
  'tpl.gen.phase.close':   'Wrap-up',

  // ── Roadmap ──
  'rm.train': 'Train', 'rm.currentPos': 'Current position: {0}% of route', 'rm.atRisk': 'AT RISK',

  // ── SumView – Pulse Check ──
  'pc.title': 'Pulse Check',
  'pc.allClear': 'All clear — no open issues.',
  'pc.h1NoPerson': '{0} tasks in H1 without person',
  'pc.h1NoEstimate': '{0} tasks in H1 without estimate',
  'pc.h2Exploratory': '{0} tasks in H2 still exploratory',
  'pc.blockedNoPerson': '{0} blocked tasks without person',
  'pc.deadlinesAtRisk': '{0} deadlines at risk',
  'pc.dLeft': '{0}d left',
  'pc.moreItems': '+ {0} more',
  'pc.unassigned': '(unassigned)',

  // ── GanttView – confidence reason tooltips ──
  'g.reasonManual': 'Set manually', 'g.reasonDone': 'Done',
  'g.reasonPersonEstimate': 'Person + estimate present', 'g.reasonNoPerson': 'No person assigned',
  'g.reasonHighRisk': 'Risk factor ≥ 2.0', 'g.reasonNoEstimate': 'No estimate',
  'g.reasonInherited': 'Derived from worst child item',

  // ── PlanReview – confidence reason labels ──
  'pr.reasonManual': 'Set manually', 'pr.reasonDone': 'Done',
  'pr.reasonPersonEstimate': 'Auto: person + estimate present', 'pr.reasonNoPerson': 'Auto: no person assigned',
  'pr.reasonHighRisk': 'Auto: risk factor ≥ 2.0', 'pr.reasonNoEstimate': 'Auto: no estimate',
  'pr.reasonInherited': 'Derived from worst child item',
  'pr.currentPhases': 'Current phases', 'pr.allOpen': 'All open ({0})',
  'pr.current': 'current', 'pr.waitingOn': 'waiting on {0}',
  'pr.ptOpen': '{0} PT open ({1})',

  // ── ResView ──
  'rv.teams': 'Teams', 'rv.addTeam': '+ Add team',
  'rv.members': 'Team Members', 'rv.addPerson': '+ Add person',
  'rv.noMembers': 'No team members yet.',
  'rv.noMembersHint': 'Add people to assign tasks and plan capacity.',
  'rv.vacations': 'Vacation Weeks', 'rv.addWeek': '+ Add week',
  'rv.vacHint': 'Enter Monday date of each vacation week (YYYY-MM-DD). Scheduler skips that week for the person.',
  'rv.fullName': 'Full name', 'rv.role': 'Role', 'rv.capacityPct': 'Capacity %',
  'rv.vacDays': 'Vacation days/yr', 'rv.startDate': 'Start date', 'rv.endDate': 'End date',
  'rv.chooseTeam': 'Choose team...', 'rv.choosePerson': 'Choose person...',
  'rv.person': 'Person', 'rv.weekStart': 'Week start (Mon)', 'rv.note': 'Note',
  'rv.remove': 'Remove', 'rv.clone': '⧉ Clone',

  // ── JiraExportModal ──
  'je.selectPackages': 'Select packages', 'je.hierarchyMapping': 'Hierarchy mapping',
  'je.skipDone': 'Skip done items', 'je.includeAutoAssign': 'Include scheduler suggestions as assignee',
  'je.moreItems': '+ {0} more',
  'je.level1': 'Level 1 (Root)', 'je.level2': 'Level 2+', 'je.leaves': 'Leaves (work packages)',

  // ── TreeView – toolbar strings ──
  'tv.collapseSelection': 'Collapse selection ({0})', 'tv.expandSelection': 'Expand selection ({0})',
  'tv.collapseSelectionTitle': 'Collapse {0} selected items + their children',
  'tv.expandSelectionTitle': 'Expand {0} selected items + their children',
  'tv.selected': 'Selected',
  'tv.deleteItem': '× Delete',
  'tv.statusOpen': 'Open', 'tv.statusWip': 'In Progress', 'tv.statusDone': 'Done',
  'tv.prioCrit': 'crit', 'tv.prioHigh': 'high', 'tv.prioMed': 'med', 'tv.prioLow': 'low',
  'tv.priority': 'Priority',

  // ── Onboard splash ──
  'ob.sub': 'Resource-aware project scheduler',
  'ob.tagline': 'Plan projects like a subway map.',
  'ob.newProject': 'Start new project',
  'ob.tryDemo': 'Try demo',
  'ob.loadProject': 'Load from file (.json or .md)',
  'ob.or': 'or',
  'ob.preview.label': 'preview — planr.app/demo',
  'ob.foot.offline': 'Offline-first',
  'ob.foot.nobackend': 'No backend',
  'ob.foot.formats': 'JSON + Markdown',
  'demo.projectName': 'Planr Demo Project',
  'ob.feat.tree': 'Work Tree', 'ob.feat.tree.desc': 'Hierarchical WBS with deps & multiple assignments',
  'ob.feat.auto': 'Auto-schedule', 'ob.feat.auto.desc': 'Person-level parallel scheduling + capacity planning',
  'ob.feat.metro': 'Metro Roadmap', 'ob.feat.metro.desc': 'Projects as subway lines — see progress at a glance',
  'ob.feat.horizons': '3 Horizons', 'ob.feat.horizons.desc': 'Committed, estimated, exploratory planning windows',
  'ob.feat.cp': 'Critical Path', 'ob.feat.cp.desc': 'CPM analysis — see what drives your end date',
  'ob.feat.net': 'Network Graph', 'ob.feat.net.desc': 'Visual dependency map, zoom/pan, click to edit',
  'ob.feat.focus': 'Focus Areas', 'ob.feat.focus.desc': 'Goals, painpoints, deadlines, and top-down planning',
  'ob.feat.save': 'Save / Load', 'ob.feat.save.desc': 'JSON export/import — works offline & GitHub Pages',
  'ob.feat.tree.htip': 'html:<div><b>🌳 Work Tree</b><br/>Hierarchical work breakdown with <b>nested items, dependencies, and multi-person assignments</b>.<br/>Drag to reorder, shift-click for range select, right-click for context actions.</div>',
  'ob.feat.auto.htip': 'html:<div><b>📅 Auto-schedule</b><br/>Planr runs a <b>person-level parallel scheduler</b> — each person works their queue in priority order, respecting capacity and vacations.<br/>No manual date entry needed: change estimates or priorities and the schedule updates instantly.</div>',
  'ob.feat.metro.htip': 'html:<div><b>🚆 Metro Roadmap</b><br/>Each project becomes a <b>subway line</b>. Milestones are stations, the train shows real-time progress along the route.<br/>Hover stations for dates and status — a one-glance status page for stakeholders.</div>',
  'ob.feat.horizons.htip': 'html:<div><b>🧭 3 Planning Horizons</b><br/><b>H1 Committed</b> · work starting soon, fully defined.<br/><b>H2 Estimated</b> · coming up, roughly scoped.<br/><b>H3 Exploratory</b> · further out, intentionally lightweight.</div>',
  'ob.feat.cp.htip': 'html:<div><b>⚡ Critical Path</b><br/>Planr runs <b>CPM analysis</b> across the entire work tree and highlights the chain of tasks that directly controls your end date.<br/>Red bars = critical path. Shorten them or add people to accelerate the project.</div>',
  'ob.feat.net.htip': 'html:<div><b>🕸 Network Graph</b><br/>A <b>zoomable, pannable dependency map</b> of your entire project.<br/>Click a node to edit, drag from the edge handle to create dependencies. Filtered by the same root / team / person selectors as other views.</div>',
  'ob.feat.focus.htip': 'html:<div><b>🎯 Focus Areas</b><br/>Link <b>goals, painpoints, and deadlines</b> to work items for top-down planning.<br/>The Overview tab shows which focus areas are at risk and how much work is linked to each objective.</div>',

  // ── Tour ──
  'tour.aria': 'Planr tour', 'tour.step': 'Step {0} of {1}',
  'tour.skip': 'Skip tour', 'tour.finish': 'Done',
  'tour.help': '?',
  'tour.helpTitle': 'Help',
  'tour.restartTour': 'Restart tour',
  'tour.whatsNew': "What's new",
  'tour.newBadge': 'New',

  // ── Tour steps ──
  'tour.s0.icon': '🌳', 'tour.s0.title': 'Work Tree',
  'tour.s0.body': 'Your project lives here as a tree. Add tasks, group them into packages, and nest them as deep as you need. Click a row to edit it in the side panel.',

  'tour.s1.icon': '📅', 'tour.s1.title': 'Auto-schedule',
  'tour.s1.body': 'Planr schedules every task automatically — person by person, respecting dependencies, capacity, and holidays. Switch to the Schedule tab to see the Gantt chart.',

  'tour.s2.icon': '+', 'tour.s2.title': 'Add your first task',
  'tour.s2.body': 'Click "+ Add item" in the Work Tree toolbar (or press the button when the tree is empty). Give it a name, assign a person, and add a rough estimate in days.',

  'tour.s3.icon': '📊', 'tour.s3.title': 'Track progress',
  'tour.s3.body': 'The Overview tab shows the project pulse: roadmap, planning confidence, focus items, and upcoming work. Set tasks to "In Progress" or "Done" to move the needle.',

  // ── New-feature popover (shown once to existing users) ──
  'new.title': "What's new in Planr",
  'new.dismiss': 'Got it',
  'new.roadmap': 'Metro Roadmap in Overview — visual bus-line progress per top-level package.',
  'new.dayZoom': 'Day-level zoom in Schedule — drag the zoom slider past 70 px/week to see individual days.',
  'new.confidence': 'Confidence markers on Gantt bars — ●◐○ shows how solid each estimate is.',
  'new.dragLink': 'Drag-to-link dependencies — grab the edge handle of any Gantt bar and drop it on another.',
  'new.planReview': 'Planning Review tab — confidence split, unassigned items, and blocked work in one place.',

  // ── Feature Carousel captions ──
  'carousel.slide1.caption': 'Each project is a subway line. The train shows real-time progress.',
  'carousel.slide2.caption': 'Auto-scheduled Gantt — capacity-aware, respects dependencies and vacations.',
  'carousel.slide3.caption': 'Network graph reveals dependency chains and critical path.',
  'carousel.slide4.caption': 'Plan review shows confidence split and upcoming sprint at a glance.',
};

const de = {
  // ── Global / shared ──
  'save': 'Speichern', 'cancel': 'Abbrechen', 'delete': 'Löschen', 'close': 'Schließen', 'back': 'Zurück', 'next': 'Weiter',
  'yes': 'Ja', 'no': 'Nein', 'auto': 'Auto', 'none': '— Keine',
  'open': 'Offen', 'wip': 'In Bearbeitung', 'done': '✓ Erledigt',
  'critical': 'Kritisch', 'high': 'Hoch', 'medium': 'Mittel', 'low': 'Niedrig',
  'goal': 'Ziel', 'painpoint': 'Painpoint', 'deadline': 'Deadline',
  'goals': 'Ziele', 'painpoints': 'Painpoints', 'deadlines': 'Deadlines',
  'pt': 'PT', 'days': 'Tage', 'weeks': 'Wochen',
  'noTeam': 'Kein Team', 'unassigned': '(nicht zugewiesen)',
  'months': 'Jan,Feb,Mär,Apr,Mai,Jun,Jul,Aug,Sep,Okt,Nov,Dez',
  'daysShort': 'So,Mo,Di,Mi,Do,Fr,Sa',
  'conf.committed': 'Committed', 'conf.estimated': 'Estimated', 'conf.exploratory': 'Exploratory',
  'conf.committed.dot': '●', 'conf.estimated.dot': '◐', 'conf.exploratory.dot': '○',
  'cp': 'Kritischer Pfad',

  // ── Tabs ──
  'tab.summary': 'Übersicht', 'tab.plan': 'Planung', 'tab.tree': 'Arbeitspakete',
  'tab.gantt': 'Zeitplan', 'tab.net': 'Netzwerk', 'tab.resources': 'Ressourcen', 'tab.holidays': 'Feiertage',

  // ── QuickEdit ──
  'qe.cpItem': 'Kritischer-Pfad-Item',
  'qe.name': 'Name', 'qe.status': 'Status', 'qe.team': 'Team', 'qe.assignee': 'Zuständig',
  'qe.confidence': 'Confidence', 'qe.progress': 'Fortschritt',
  'qe.focusType': 'Fokus-Typ', 'qe.severity': 'Schweregrad', 'qe.date': 'Datum',
  'qe.description': 'Beschreibung', 'qe.descPlaceholder': 'Warum ist das wichtig?',
  'qe.quickEstimate': 'Schätzung', 'qe.bestDays': 'Best (Tage)', 'qe.factor': 'Faktor',
  'qe.priority': 'Priorität', 'qe.estimationWizard': 'Schätzungshilfe...', 'qe.estimateNow': 'Jetzt schätzen',
  'qe.decideBy': 'Entscheiden bis', 'qe.pinnedStart': 'Fixierter Start', 'qe.parallel': 'Parallel',
  'qe.queue': 'Reihenfolge', 'qe.predecessors': 'Vorgänger', 'qe.successors': 'Nachfolger',
  'qe.notes': 'Notizen', 'qe.duplicate': 'Duplizieren', 'qe.assignPerson': 'Person zuweisen...',
  'qe.children': 'Unterelemente', 'qe.best': 'Best', 'qe.realistic': 'Realistisch',
  'qe.period': 'Zeitraum', 'qe.duration': 'Dauer', 'qe.person': 'Person',
  'qe.effort': 'Aufwand', 'qe.realisticSuffix': 'realistisch', 'qe.notScheduled': 'nicht eingeplant',
  'qe.leafItems': 'Leaf-Items', 'qe.autoStatus': '(auto)',
  'qe.tab.overview': 'Überblick', 'qe.tab.workflow': 'Workflow', 'qe.tab.estimate': 'Schätzung', 'qe.tab.schedule': 'Planung', 'qe.tab.deps': 'Abhängigkeiten', 'qe.tab.effort': 'Aufwand', 'qe.tab.timing': 'Zeitplan',
  'qe.horizonHint': 'H1 ist für committed Arbeit, H2 für grob geschätzte Arbeit, und alles danach darf explorativ bleiben, bis es präzisiert ist.',
  'qe.allLeaves': 'alle Leaves',
  'qe.confirmRelease': '„{0}" wartet nicht mehr auf dieses Item?',
  'qe.confirmDelete': '{0} löschen?', 'qe.confirmDeleteChildren': '{0} und alle Unterelemente löschen?',
  'qe.confirmDuplicate': '„{0}" duplizieren?', 'qe.confirmDuplicateN': '„{0}" mit {1} Unterelementen duplizieren?',

  // ── NodeModal ──
  'nm.focusType': 'Fokus-Typ', 'nm.severity': 'Schweregrad',
  'nm.appliesToAllLeaves': '(gilt für alle Leaves)',
  'nm.advanced': 'Erweitert', 'nm.parent': 'Übergeordnet (verschiebt Item + Unterelemente)',
  'nm.topLevel': '— Oberste Ebene —', 'nm.seq': 'Seq',
  'nm.confidenceOverride': 'Confidence-Override',
  'nm.runParallel': 'Parallel ausführen', 'nm.capacityBypass': 'Kapazität umgehen',
  'nm.queuePosition': 'Reihenfolge',
  'nm.first': 'Erster', 'nm.earlier': 'Früher', 'nm.later': 'Später', 'nm.last': 'Letzter',
  'nm.pinToday': 'Heute', 'nm.noChanges': 'Keine Änderungen',
  'nm.confirmMove': '„{0}" + {1} Unterelemente unter „{2}" verschieben?',
  'nm.saveFirst': 'Speichern oder verwerfen Sie ausstehende Änderungen vor dem Verschieben.',
  'nm.unsavedDiscard': 'Ungespeicherte Änderungen. Verwerfen und schließen?',

  // ── Gantt ──
  'g.group': 'Gruppierung', 'g.project': 'Projekt', 'g.projTeam': 'Projekt › Team',
  'g.team': 'Team', 'g.person': 'Person',
  'g.noItems': 'Noch keine Items', 'g.addTasks': 'Aufgaben hinzufügen um den Gantt-Chart zu sehen.',
  'g.zoom': 'Zoom', 'g.week': 'Woche', 'g.day': 'Tag', 'g.today': 'Heute',
  'g.noEstimate': 'kein Aufwand', 'g.matches': 'Treffer',
  'g.cpLabel': 'Kritischer Pfad', 'g.barHelp': 'Balken ← → = fixieren · ↑ ↓ = Reihenfolge · Rand = verknüpfen · Rechtsklick = mehr',
  'g.linkClick': 'Klicke einen anderen Balken um {0}', 'g.linkDrop': 'Auf Balken ziehen um Abhängigkeit zu erstellen',
  'g.ctxEdit': 'Öffnen / bearbeiten…', 'g.ctxSucc': 'Nachfolger hinzufügen… (dies → anderer)',
  'g.ctxPred': 'Vorgänger hinzufügen… (anderer → dies)',
  'g.ctxParallel': 'Parallel ausführen', 'g.ctxSequential': 'Sequentiell (parallel deaktivieren)',
  'g.ctxQueueOrder': 'Reihenfolge', 'g.ctxRunFirst': 'Zuerst', 'g.ctxRunEarlier': 'Früher',
  'g.ctxRunLater': 'Später', 'g.ctxRunLast': 'Zuletzt',
  'g.ctxUnpin': 'Lösen', 'g.ctxPinCurrent': 'Auf aktuellen Start fixieren',
  'g.ctxRemoveDep': 'Abhängigkeit entfernen',
  'g.confirmRemoveDep': 'Abhängigkeit entfernen: {0} hängt nicht mehr von {1} ab?',
  'g.horizonLegend': 'H1 committed · H2 estimated · H3 exploratory',
  'g.horizonLegendTip': 'Vor H1 sollte Arbeit committed sein, vor H2 mindestens grob geschätzt, und nach H2 darf sie noch explorativ sein.',

  // ── SumView ──
  's.projected': 'Voraussichtliches Ende', 's.focus': 'Fokus',
  's.planConfidence': 'Planungssicherheit', 's.openPlanReview': 'Planungsübersicht öffnen →',
  's.upNext': 'Als nächstes', 's.scheduledWithin': '(geplanter Start innerhalb)',
  's.tasks': 'Aufgaben', 's.lanes': 'Bahnen', 's.lane': 'Bahn',
  's.resources': 'Ressourcen', 's.people': 'Personen', 's.totalPt': 'Gesamt PT',
  's.topItems': 'Hauptpakete', 's.effort': 'Aufwand', 's.progress': 'Fortschritt',
  's.doneOf': '{0} erledigt · {1} in Bearbeitung · {2} offen von {3} Leaf-Items',
  's.onTrack': 'Im Plan', 's.atRisk': 'GEFÄHRDET', 's.linked': 'verknüpft',
  's.tasksDone': '{0} Aufgaben erledigt · {1} auf kritischem Pfad',
  's.horizonKicker': 'Planungshorizonte',
  's.horizonTitle': 'Was als Nächstes klar sein muss',
  's.horizonLead': 'Je näher Arbeit rückt, desto verbindlicher sollte der Plan werden.',
  's.horizonCommitted': 'Verbindlich',
  's.horizonCommittedBody': 'Startet bald: Zuständigkeit, Scope, Aufwand und Blocker sollten belastbar sein.',
  's.horizonEstimated': 'Grob geplant',
  's.horizonEstimatedBody': 'Kommt danach: grob schneiden, Team klären und Risiken sichtbar machen.',
  's.horizonExploratory': 'Noch offen',
  's.horizonExploratoryBody': 'Liegt weiter draußen: sichtbar halten, Details aber bewusst offen lassen.',
  's.horizonFoot': 'Faustregel: H1 zusagen, H2 grob planen, H3 bewusst offen lassen.',
  's.exportTodo': 'TODO-Liste exportieren',

  // ── PlanReview ──
  'p.clear': 'klar', 'p.needsPerson': 'braucht Person', 'p.unclear': 'unklar',
  'p.finished': 'erledigt',
  'p.decisions': 'Entscheidungen', 'p.teamCapacity': 'Teamauslastung', 'p.blocked': 'Geblockt',
  'p.allAssigned': 'Alles vergeben',
  'p.allAssignedDesc': 'Jedes startbereite Item hat eine Person.',
  'p.readyItems': 'Diese {0} Items sind startbereit (keine blockierenden Abhängigkeiten), aber noch ohne Person. Wer soll sie machen?',
  'p.waitingFor': 'Wartet auf',
  'p.assignPerson': 'Person zuweisen...', 'p.items': 'Items',
  'p.assigned': 'zugewiesen', 'p.open': 'offen',
  'p.noBlocked': 'Keine geblockten Items ohne Person.',
  'p.blockedDesc': 'Diese Items brauchen eine Person, können aber erst starten wenn ihre Abhängigkeiten erledigt sind.',
  'p.phaseTodos': 'Phasen-Todos', 'p.noPhaseTodos': 'Aktuell gibt es keine offenen Phasen.',
  'p.phaseTodosDesc': 'Diese {0} offenen Phasen sind nach Person oder Fallback-Team gruppiert und funktionieren damit direkt als TODO-Listen.',
  'p.advancePhase': 'Phase weiterziehen', 'p.assignPhasePerson': 'Phasen-Owner zuweisen...',

  // ── EstimationWizard ──
  'ew.title': 'Schätzungs-Wizard',
  'ew.steps': 'Scope,Größe,Risiken,Drei-Punkt,Abhängigkeiten,Confidence,Zusammenfassung',
  'ew.scopeQ': 'Was genau muss gemacht werden?',
  'ew.scopeHelp': 'Sei konkret. Vager Scope = ungenaue Schätzungen.',
  'ew.scopeRelated': 'Ähnliche Aufgaben in dieser Gruppe (zur Referenz)',
  'ew.sizeQ': 'Wie groß ist die Aufgabe deiner Einschätzung nach?',
  'ew.xs': 'Triviale Änderung, Konfiguration, Typo-Fix',
  'ew.s': 'Kleines Feature, einfacher Bugfix',
  'ew.m': 'Standard-Feature, mittlere Komplexität',
  'ew.l': 'Großes Feature, mehrere Komponenten',
  'ew.xl': 'Umfangreiches Feature, übergreifende Änderungen',
  'ew.xxl': 'Epic, komplettes Modul/System',
  'ew.risksQ': 'Welche Risiken treffen auf diese Aufgabe zu? Jedes erhöht den Unsicherheitsfaktor.',
  'ew.risk.newTech': 'Neue Technologie / unbekanntes Terrain',
  'ew.risk.external': 'Externe Abhängigkeiten (APIs, Partner)',
  'ew.risk.migration': 'Datenmigration involviert',
  'ew.risk.ux': 'Erhebliches UI/UX-Design nötig',
  'ew.risk.stakeholder': 'Stakeholder-Abstimmung nötig',
  'ew.risk.integration': 'Komplexe Systemintegration',
  'ew.risk.legacy': 'Arbeit mit Legacy-Code',
  'ew.risk.unclear': 'Anforderungen nicht vollständig klar',
  'ew.riskFactor': 'Risikofaktor', 'ew.risksSelected': '{0} Risiken ausgewählt',
  'ew.threePointQ': 'Verfeinere mit einer Drei-Punkt-Schätzung (PERT-Methode). Gewichteter Mittelwert = (O + 4R + P) / 6',
  'ew.optimistic': 'Optimistisch (Best Case)', 'ew.optHelp': 'Alles läuft perfekt',
  'ew.realisticLabel': 'Realistisch (wahrscheinlichster Fall)', 'ew.realHelp': 'Normale Bedingungen',
  'ew.pessimistic': 'Pessimistisch (Worst Case)', 'ew.pessHelp': 'Murphys Gesetz greift',
  'ew.pert': 'PERT', 'ew.stdDev': 'Std.abw.', 'ew.confRange': 'Konfidenzbereich',
  'ew.depsQ': 'Was muss vorher abgeschlossen sein, damit diese Aufgabe starten kann?',
  'ew.depsBlocked': 'Diese Aufgabe wird von {0} Items blockiert. Der Scheduler startet sie erst nach Abschluss aller Abhängigkeiten.',
  'ew.confQ': 'Wie sicher bist du dir bei Scope und Aufwand?',
  'ew.confAuto': 'Auto (Planr entscheidet)', 'ew.confAutoDesc': 'Planr leitet die Confidence aus Person/Aufwand/Risiko ab.',
  'ew.confCommitted': '● Committed — klar definiert', 'ew.confCommittedDesc': 'Scope ist klar, Aufwand belastbar geschätzt, Person bekannt.',
  'ew.confEstimated': '◐ Estimated — grob geschätzt', 'ew.confEstimatedDesc': 'Grobe Einschätzung, Scope grundsätzlich bekannt, Details offen.',
  'ew.confExploratory': '○ Exploratory — Scope unklar', 'ew.confExploratoryDesc': 'Wir wissen noch nicht genau was zu tun ist. Erst Konzeption nötig.',
  'ew.confRiskHint': 'Du hast {0} Risiken markiert (Faktor ×{1}). Bei so viel Unsicherheit solltest du „Estimated" oder „Exploratory" in Betracht ziehen.',
  'ew.summary': 'Zusammenfassung',
  'ew.bestCase': 'Best Case (Tage)', 'ew.uncertaintyFactor': 'Unsicherheitsfaktor',
  'ew.realisticDays': 'Realistisch (Tage)', 'ew.worstCase': 'Worst Case (Tage)',
  'ew.risksIdentified': 'Identifizierte Risiken', 'ew.apply': 'Schätzung übernehmen',
  'ew.flowKicker': 'Top-down-Flow', 'ew.flowTitle': 'Erst klassifizieren, sofort schätzen, später verfeinern.',
  'ew.flowBody': 'Wähle die Workflow-Vorlage direkt im Wizard, damit ein neuer Projektzweig in einem Zug strukturiert, klassifiziert und grob geschätzt werden kann.',
  'ew.templateLabel': 'Workflow-Vorlage', 'ew.templateHelp': 'Vorlagen sind direkt im Wizard auswählbar, damit Klassifikation und Schätzung nicht auseinanderfallen.',
  'ew.discardConfirm': 'Eingaben verwerfen? Alles was du eingegeben hast geht verloren.',

  // ── Tooltip ──
  'tt.assigned': 'Zuständig', 'tt.team': 'Team', 'tt.bestCase': 'Best Case',
  'tt.realistic': 'Realistisch', 'tt.start': 'Start', 'tt.end': 'Ende',
  'tt.deps': 'Abhängigkeiten', 'tt.cp': 'Kritischer Pfad', 'tt.cpYes': 'JA',
  'tt.dblClick': 'Doppelklick für Details',

  // ── Settings ──
  'set.title': 'Projekteinstellungen', 'set.globalTitle': 'Globale Einstellungen',
  'set.projectName': 'Projektname', 'set.planStart': 'Planstart', 'set.planEnd': 'Planende',
  'set.workDays': 'Arbeitstage', 'set.language': 'Sprache', 'set.theme': 'Farbschema',
  'set.themeAuto': 'Auto (System)', 'set.themeDark': 'Dunkel', 'set.themeLight': 'Hell',
  'set.langAuto': 'Auto', 'set.langEn': 'English', 'set.langDe': 'Deutsch',
  'set.dayNames': 'Mo,Di,Mi,Do,Fr,Sa,So',

  // ── Phasen & Vorlagen ──
  'ph.phases': 'Phasen', 'ph.noPhases': 'Keine Phasen definiert.',
  'ph.applyTemplate': 'Vorlage anwenden…', 'ph.addPhase': '+ Phase',
  'ph.clearPhases': 'Alle Phasen entfernen', 'ph.currentPhase': 'aktuell',
  'ph.templates': 'Aufgabenvorlagen', 'ph.newTemplate': '+ Neue Vorlage',
  'ph.editTemplate': 'Bearbeiten', 'ph.templateName': 'Vorlagenname',
  'ph.phaseName': 'Phasenname', 'ph.phaseTeam': 'Team',
  'ph.phaseTeams': 'Teams', 'ph.phaseAssignees': 'Owner',
  'ph.phaseTeamAdd': 'Team hinzufügen...', 'ph.phaseAssigneeAdd': 'Owner hinzufügen...',
  'ph.effortHelp': 'Phasenaufwand ist optional. Wenn die Summe unter 100% bleibt, verteilt Planr den Rest gleichmäßig auf Phasen ohne expliziten Wert.',
  'ph.templateHelp': 'Vorlagen unterstützen jetzt mehrere Teams pro Phase und optionale Aufwand-Prozente.',
  'ph.confirmClear': 'Alle Phasen von dieser Aufgabe entfernen?',
  'ph.confirmDeleteTpl': 'Vorlage „{0}" löschen?',
  'ph.applied': 'Vorlage: {0}', 'ph.freePhase': 'Neue Phase',
  'ph.moveUp': 'Nach oben', 'ph.moveDown': 'Nach unten',
  'ph.via': 'via {0}',

  // ── TreeView ──
  'tv.collapseAll': 'Alle zuklappen', 'tv.expandAll': 'Alle aufklappen',
  'tv.items': 'Items', 'tv.leafs': 'Leaves',
  'tv.addItem': '+ Item hinzufügen', 'tv.allTeams': 'Alle Teams', 'tv.allRoots': 'Alle Pakete', 'tv.allPeople': 'Alle Personen',

  // ── Größen ──
  'set.sizes': 'T-Shirt-Größen', 'set.sizeCatalogue': 'T-Shirt-Größen-Katalog',
  'set.sizeHelp': 'Diese Größen erscheinen im Schätzungs-Wizard und in den Schnellschätzungs-Buttons. Jede Größe legt die Standard-Tagesanzahl (Best Case) und den Unsicherheitsfaktor fest.',
  'set.sizeLabel': 'Bezeichnung', 'set.sizeDays': 'Tage', 'set.sizeFactor': 'Faktor', 'set.sizeDesc': 'Beschreibung (optional)',
  'set.sizeLabelPlaceholder': 'z. B. M', 'set.addSize': '+ Größe',
  'set.resetSizes': 'Standard wiederherstellen', 'set.confirmResetSizes': 'Größen auf Standardwerte zurücksetzen?',

  // ── Risiken ──
  'set.risks': 'Risiken', 'set.riskCatalogue': 'Risikokatalog',
  'set.riskHelp': 'Diese Risiken erscheinen im Schätzungs-Wizard. Jedes ausgewählte Risiko erhöht den Unsicherheitsfaktor um sein Gewicht.',
  'set.riskName': 'Risikobezeichnung', 'set.addRisk': '+ Risiko',
  'set.resetRisks': 'Standard wiederherstellen', 'set.confirmResetRisks': 'Risiken auf Standardwerte zurücksetzen?',

  // ── Eigene Felder ──
  'cf.tab': 'Eigene Felder',
  'cf.name': 'Feldname', 'cf.type': 'Typ', 'cf.template': 'URI-Vorlage (optional)',
  'cf.options': 'Optionen (kommagetrennt)', 'cf.addField': '+ Feld hinzufügen', 'cf.removeField': 'Feld entfernen',
  'cf.help': 'Eigene Felder erscheinen auf allen Aufgaben. URI-Felder können Links automatisch aufbauen, z. B. https://company.atlassian.net/browse/{value}.',
  'cf.type.text': 'Text', 'cf.type.number': 'Zahl', 'cf.type.uri': 'URI / Link', 'cf.type.select': 'Auswahl',
  'cf.openLink': 'Link öffnen',
  'cf.fieldValues': 'Eigene Felder',

  // ── AutoAssignHint ──
  'aa.suggestion': 'Vorschlag:', 'aa.accept': 'Übernehmen',

  // ── NewProjModal ──
  'np.title': 'Neues Projekt', 'np.titleFocus': '— Fokus',
  'np.projectName': 'Projektname', 'np.projectNamePlaceholder': 'Mein Projekt',
  'np.planStart': 'Planstart', 'np.planEnd': 'Planende', 'np.holidays': 'Feiertage',
  'np.teams': 'Teams', 'np.addTeam': '+ Team hinzufügen',
  'np.teamId': 'ID', 'np.teamName': 'Name', 'np.teamNamePlaceholder': 'Teamname',
  'np.teamColor': 'Farbe', 'np.removeTeam': 'Entfernen',
  'np.nextFocus': 'Weiter →', 'np.backStep': '← Zurück',
  'np.createProject': 'Projekt anlegen',
  'np.focusLead': 'Starte mit den großen Themen: Ziele, Painpoints und Deadlines. Planr legt sie als Oberelemente an, damit du sie danach in Ursachen, Maßnahmen und Aufgaben aufbrechen kannst.',
  'np.addGoal': '{0} hinzufügen',
  'np.noFocus': 'Noch keine Fokus-Items. Füge welche hinzu oder überspringe diesen Schritt.',
  'np.descPlaceholder': 'Beschreibung (optional)',
  'np.template': 'Projektvorlage', 'np.templateHelp': 'Wähle eine Vorlage die zum Projekttyp passt. Sie befüllt das Projekt mit passenden Größen, Risiken und Aufgabenvorlagen — alles kann danach in den Einstellungen angepasst werden.',

  // ── Projektvorlagen ──
  'tpl.softwareDev': 'Software-Entwicklung',
  'tpl.softwareDev.desc': 'Klassisches Softwareprojekt — RE, Refinement, Entwicklung, Testing. Größen XS–XXL in Tagen, typische Tech-Risiken.',
  'tpl.generic': 'Generisch / Leer',
  'tpl.generic.desc': 'Minimaler Einstieg: Grundgrößen XS–XL, einfache Risiken, eine Aufgabenvorlage. Alles anpassbar.',
  // Software Dev — Inhalte
  'tpl.sw.risk.newTech':    'Neue Technologie / unbekanntes Terrain',
  'tpl.sw.risk.external':   'Externe Abhängigkeiten (APIs, Partner)',
  'tpl.sw.risk.integration': 'Komplexe Systemintegration',
  'tpl.sw.risk.unclear':    'Anforderungen nicht vollständig klar',
  'tpl.sw.size.xs':  'Triviale Änderung, Konfiguration, Typo-Fix',
  'tpl.sw.size.s':   'Kleines Feature, einfacher Bugfix',
  'tpl.sw.size.m':   'Standard-Feature, mittlere Komplexität',
  'tpl.sw.size.l':   'Größeres Feature, mehrere Komponenten',
  'tpl.sw.size.xl':  'Umfangreiches Feature, übergreifende Änderungen',
  'tpl.sw.size.xxl': 'Epic, komplettes Modul oder System',
  'tpl.sw.tt.fullcycle': 'Full-Stack Entwicklung',
  'tpl.sw.tt.bugfix':    'Bugfix & Hotfix',
  'tpl.sw.phase.re':         'Requirements Engineering',
  'tpl.sw.phase.refinement': 'Refinement / Design',
  'tpl.sw.phase.dev':        'Entwicklung',
  'tpl.sw.phase.qa':         'Testing / QA',
  'tpl.sw.phase.analysis':   'Analyse',
  'tpl.sw.phase.fix':        'Fix',
  'tpl.sw.phase.verify':     'Verifikation',
  // Generisch — Inhalte
  'tpl.gen.risk.unclear':  'Anforderungen noch unklar',
  'tpl.gen.risk.external': 'Externe Abhängigkeiten',
  'tpl.gen.risk.resource': 'Ressourcen eingeschränkt',
  'tpl.gen.size.xs': 'Sehr kleine Aufgabe',
  'tpl.gen.size.s':  'Kleine Aufgabe',
  'tpl.gen.size.m':  'Mittlere Aufgabe',
  'tpl.gen.size.l':  'Große Aufgabe',
  'tpl.gen.size.xl': 'Sehr große Aufgabe',
  'tpl.gen.tt.std': 'Einfacher Workflow',
  'tpl.gen.phase.prep':    'Vorbereitung',
  'tpl.gen.phase.execute': 'Durchführung',
  'tpl.gen.phase.close':   'Abschluss',

  // ── Roadmap ──
  'rm.train': 'Zug', 'rm.currentPos': 'Aktuelle Position: {0}% der Strecke', 'rm.atRisk': 'GEFÄHRDET',

  // ── SumView – Pulse Check ──
  'pc.title': 'Pulse Check',
  'pc.allClear': 'Alles im grünen Bereich — keine offenen Punkte.',
  'pc.h1NoPerson': '{0} Tasks in H1 ohne Person',
  'pc.h1NoEstimate': '{0} Tasks in H1 ohne Schätzung',
  'pc.h2Exploratory': '{0} Tasks in H2 noch explorativ',
  'pc.blockedNoPerson': '{0} blockierte Tasks ohne Person',
  'pc.deadlinesAtRisk': '{0} Deadlines gefährdet',
  'pc.dLeft': '{0}T übrig',
  'pc.moreItems': '+ {0} weitere',
  'pc.unassigned': '(nicht zugewiesen)',

  // ── GanttView – Confidence-Reason-Tooltips ──
  'g.reasonManual': 'Manuell gesetzt', 'g.reasonDone': 'Erledigt',
  'g.reasonPersonEstimate': 'Person + Schätzung vorhanden', 'g.reasonNoPerson': 'Keine Person zugewiesen',
  'g.reasonHighRisk': 'Risikofaktor ≥ 2.0', 'g.reasonNoEstimate': 'Keine Schätzung',
  'g.reasonInherited': 'Vom schlechtesten Kind-Element',

  // ── PlanReview – Confidence-Reason-Labels ──
  'pr.reasonManual': 'Manuell gesetzt', 'pr.reasonDone': 'Erledigt',
  'pr.reasonPersonEstimate': 'Auto: Person + Schätzung vorhanden', 'pr.reasonNoPerson': 'Auto: keine Person zugewiesen',
  'pr.reasonHighRisk': 'Auto: Risikofaktor ≥ 2.0', 'pr.reasonNoEstimate': 'Auto: keine Schätzung vorhanden',
  'pr.reasonInherited': 'Abgeleitet vom schlechtesten Kind-Element',
  'pr.currentPhases': 'Aktuelle Phasen', 'pr.allOpen': 'Alle offenen ({0})',
  'pr.current': 'aktuell', 'pr.waitingOn': 'wartet auf {0}',
  'pr.ptOpen': '{0} PT offen ({1})',

  // ── ResView ──
  'rv.teams': 'Teams', 'rv.addTeam': '+ Team hinzufügen',
  'rv.members': 'Team-Mitglieder', 'rv.addPerson': '+ Person hinzufügen',
  'rv.noMembers': 'Noch keine Team-Mitglieder.',
  'rv.noMembersHint': 'Personen hinzufügen, um Aufgaben zuzuweisen und Kapazitäten zu planen.',
  'rv.vacations': 'Urlaubswochen', 'rv.addWeek': '+ Woche hinzufügen',
  'rv.vacHint': 'Montag-Datum jeder Urlaubswoche eingeben (JJJJ-MM-TT). Der Scheduler überspringt diese Woche für die Person.',
  'rv.fullName': 'Vollständiger Name', 'rv.role': 'Rolle', 'rv.capacityPct': 'Kapazität %',
  'rv.vacDays': 'Urlaubstage/Jahr', 'rv.startDate': 'Startdatum', 'rv.endDate': 'Enddatum',
  'rv.chooseTeam': 'Team auswählen...', 'rv.choosePerson': 'Person auswählen...',
  'rv.person': 'Person', 'rv.weekStart': 'Wochenstart (Mo)', 'rv.note': 'Notiz',
  'rv.remove': 'Entfernen', 'rv.clone': '⧉ Klonen',

  // ── JiraExportModal ──
  'je.selectPackages': 'Pakete auswählen', 'je.hierarchyMapping': 'Hierarchie-Mapping',
  'je.skipDone': 'Erledigte überspringen', 'je.includeAutoAssign': 'Scheduler-Vorschläge als Assignee',
  'je.moreItems': '+ {0} weitere',
  'je.level1': 'Ebene 1 (Root)', 'je.level2': 'Ebene 2+', 'je.leaves': 'Leaves (Arbeitspakete)',

  // ── TreeView – Toolbar-Texte ──
  'tv.collapseSelection': 'Auswahl zuklappen ({0})', 'tv.expandSelection': 'Auswahl aufklappen ({0})',
  'tv.collapseSelectionTitle': '{0} ausgewählte Items + Kinder zuklappen',
  'tv.expandSelectionTitle': '{0} ausgewählte Items + Kinder aufklappen',
  'tv.selected': 'Ausgewählt',
  'tv.deleteItem': '× Löschen',
  'tv.statusOpen': 'Offen', 'tv.statusWip': 'In Bearbeitung', 'tv.statusDone': 'Erledigt',
  'tv.prioCrit': 'krit.', 'tv.prioHigh': 'hoch', 'tv.prioMed': 'mittel', 'tv.prioLow': 'niedrig',
  'tv.priority': 'Priorität',

  // ── Onboard-Splash ──
  'ob.sub': 'Ressourcenbewusster Projektplaner',
  'ob.tagline': 'Projekte planen wie ein U-Bahn-Netz.',
  'ob.newProject': 'Neues Projekt starten',
  'ob.tryDemo': 'Demo ansehen',
  'ob.loadProject': 'Datei laden (.json oder .md)',
  'ob.or': 'oder',
  'ob.preview.label': 'Vorschau — planr.app/demo',
  'ob.foot.offline': 'Offline-first',
  'ob.foot.nobackend': 'Kein Backend',
  'ob.foot.formats': 'JSON + Markdown',
  'demo.projectName': 'Planr Demo-Projekt',
  'ob.feat.tree': 'Arbeitspakete', 'ob.feat.tree.desc': 'Hierarchischer WBS mit Abhängigkeiten & mehreren Zuweisungen',
  'ob.feat.auto': 'Auto-Planung', 'ob.feat.auto.desc': 'Personenbezogene Parallelplanung + Kapazitätsplanung',
  'ob.feat.metro': 'U-Bahn-Roadmap', 'ob.feat.metro.desc': 'Projekte als U-Bahn-Linien — Fortschritt auf einen Blick',
  'ob.feat.horizons': '3 Horizonte', 'ob.feat.horizons.desc': 'Committed, estimated, exploratory Planungsfenster',
  'ob.feat.cp': 'Kritischer Pfad', 'ob.feat.cp.desc': 'CPM-Analyse — sehe was dein Enddatum treibt',
  'ob.feat.net': 'Netzwerkgraph', 'ob.feat.net.desc': 'Visuelles Abhängigkeits-Diagramm, Zoom/Pan, Klick zum Bearbeiten',
  'ob.feat.focus': 'Fokus-Bereiche', 'ob.feat.focus.desc': 'Ziele, Painpoints, Deadlines und Top-down-Planung',
  'ob.feat.save': 'Speichern / Laden', 'ob.feat.save.desc': 'JSON Export/Import — funktioniert offline & GitHub Pages',
  'ob.feat.tree.htip': 'html:<div><b>🌳 Arbeitspakete</b><br/>Hierarchischer Projektstrukturplan mit <b>verschachtelten Items, Abhängigkeiten und Mehrfachzuweisungen</b>.<br/>Drag & Drop zum Sortieren, Shift-Klick für Mehrfachauswahl, Rechtsklick für Kontextaktionen.</div>',
  'ob.feat.auto.htip': 'html:<div><b>📅 Auto-Planung</b><br/>Planr führt einen <b>personenbezogenen Parallelplaner</b> aus — jede Person arbeitet ihre Warteschlange nach Priorität ab, unter Berücksichtigung von Kapazität und Urlaub.<br/>Keine manuellen Datumseingaben: Schätzungen oder Prioritäten ändern und der Plan aktualisiert sich sofort.</div>',
  'ob.feat.metro.htip': 'html:<div><b>🚆 U-Bahn-Roadmap</b><br/>Jedes Projekt wird zur <b>U-Bahn-Linie</b>. Meilensteine sind Haltestellen, der Zug zeigt den Echtzeit-Fortschritt.<br/>Hover über Haltestellen für Termine und Status — eine Statusseite auf einen Blick für Stakeholder.</div>',
  'ob.feat.horizons.htip': 'html:<div><b>🧭 3 Planungshorizonte</b><br/><b>H1 Verbindlich</b> · startet bald, vollständig definiert.<br/><b>H2 Geschätzt</b> · kommt danach, grob geplant.<br/><b>H3 Explorativ</b> · liegt weiter draußen, bewusst offen gehalten.</div>',
  'ob.feat.cp.htip': 'html:<div><b>⚡ Kritischer Pfad</b><br/>Planr führt eine <b>CPM-Analyse</b> über den gesamten Arbeitsbaum durch und hebt die Aufgabenkette hervor, die direkt das Enddatum bestimmt.<br/>Rote Balken = kritischer Pfad. Kürzen oder Personen hinzufügen, um das Projekt zu beschleunigen.</div>',
  'ob.feat.net.htip': 'html:<div><b>🕸 Netzwerkgraph</b><br/>Eine <b>zoom- und schwenkbare Abhängigkeitskarte</b> des gesamten Projekts.<br/>Node anklicken zum Bearbeiten, vom Rand ziehen um Abhängigkeiten zu erstellen. Gefiltert durch dieselben Root-/Team-/Personen-Filter wie andere Ansichten.</div>',
  'ob.feat.focus.htip': 'html:<div><b>🎯 Fokus-Bereiche</b><br/><b>Ziele, Painpoints und Deadlines</b> mit Arbeitspaketen verknüpfen für Top-down-Planung.<br/>Die Übersicht zeigt, welche Fokus-Bereiche gefährdet sind und wie viel Arbeit an jedes Ziel geknüpft ist.</div>',

  // ── Tour ──
  'tour.aria': 'Planr Tour', 'tour.step': 'Schritt {0} von {1}',
  'tour.skip': 'Tour überspringen', 'tour.finish': 'Fertig',
  'tour.help': '?',
  'tour.helpTitle': 'Hilfe',
  'tour.restartTour': 'Tour neu starten',
  'tour.whatsNew': 'Was ist neu',
  'tour.newBadge': 'Neu',

  // ── Tour-Schritte ──
  'tour.s0.icon': '🌳', 'tour.s0.title': 'Arbeitspakete',
  'tour.s0.body': 'Dein Projekt lebt hier als Baum. Füge Aufgaben hinzu, gruppiere sie in Pakete und schachtle sie so tief wie nötig. Klicke eine Zeile, um sie im Seitenpanel zu bearbeiten.',

  'tour.s1.icon': '📅', 'tour.s1.title': 'Automatische Planung',
  'tour.s1.body': 'Planr plant jede Aufgabe automatisch — Person für Person, unter Berücksichtigung von Abhängigkeiten, Kapazität und Feiertagen. Wechsle zum Tab "Zeitplan" um den Gantt-Chart zu sehen.',

  'tour.s2.icon': '+', 'tour.s2.title': 'Erste Aufgabe anlegen',
  'tour.s2.body': 'Klicke auf "+ Item hinzufügen" in der Arbeitspakete-Toolbar (oder den Button wenn der Baum leer ist). Vergib einen Namen, weise eine Person zu und gib eine grobe Schätzung in Tagen an.',

  'tour.s3.icon': '📊', 'tour.s3.title': 'Fortschritt verfolgen',
  'tour.s3.body': 'Die Übersicht zeigt den Projektpuls: Roadmap, Planungssicherheit, Fokus-Items und anstehende Arbeit. Setze Aufgaben auf "In Bearbeitung" oder "Erledigt" um den Fortschritt zu zeigen.',

  // ── Neue-Features-Popover (einmalig für Bestandsnutzer) ──
  'new.title': 'Was ist neu in Planr',
  'new.dismiss': 'Verstanden',
  'new.roadmap': 'Metro-Roadmap in Übersicht — visueller Bus-Linien-Fortschritt pro Oberpaket.',
  'new.dayZoom': 'Tages-Zoom im Zeitplan — Zoom-Regler über 70 px/Woche ziehen für Tagesansicht.',
  'new.confidence': 'Confidence-Marker auf Gantt-Balken — ●◐○ zeigt wie belastbar jede Schätzung ist.',
  'new.dragLink': 'Drag-to-Link für Abhängigkeiten — Randgriff eines Gantt-Balkens ziehen und auf einen anderen fallen lassen.',
  'new.planReview': 'Planungsübersicht-Tab — Confidence-Verteilung, nicht zugewiesene Items und geblockte Arbeit an einem Ort.',

  // ── Feature-Carousel-Untertitel ──
  'carousel.slide1.caption': 'Jedes Projekt ist eine U-Bahn-Linie. Der Zug zeigt den Echtzeit-Fortschritt.',
  'carousel.slide2.caption': 'Automatisch geplanter Gantt — kapazitätsbewusst, respektiert Abhängigkeiten und Urlaub.',
  'carousel.slide3.caption': 'Der Netzwerkgraph zeigt Abhängigkeitsketten und den kritischen Pfad.',
  'carousel.slide4.caption': 'Die Planungsübersicht zeigt Confidence-Verteilung und den nächsten Sprint auf einen Blick.',
};

const LANGS = { en, de };

// ── Detect browser language ──────────────────────────────────────────────────
function detectLang() {
  const nav = navigator.language || navigator.languages?.[0] || 'en';
  return nav.startsWith('de') ? 'de' : 'en';
}

// ── Context ──────────────────────────────────────────────────────────────────
const I18nContext = createContext({ lang: 'en', t: k => k });

export function I18nProvider({ children }) {
  const [langPref, setLangPref] = useState(() => {
    try { return localStorage.getItem('planr_lang') || 'auto'; } catch { return 'auto'; }
  });
  const lang = langPref === 'auto' ? detectLang() : langPref;
  const dict = LANGS[lang] || en;

  const t = useMemo(() => {
    return (key, ...args) => {
      let s = dict[key] ?? en[key] ?? key;
      args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
      return s;
    };
  }, [dict]);

  const setLang = v => { setLangPref(v); try { localStorage.setItem('planr_lang', v); } catch {} };

  return <I18nContext.Provider value={{ lang, langPref, setLang, t }}>
    {children}
  </I18nContext.Provider>;
}

export function useT() { return useContext(I18nContext); }

// ── Theme ────────────────────────────────────────────────────────────────────
const ThemeContext = createContext({ theme: 'dark', themePref: 'auto', setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [themePref, setThemePref] = useState(() => {
    try { return localStorage.getItem('planr_theme') || 'auto'; } catch { return 'auto'; }
  });

  useEffect(() => {
    const apply = () => {
      let effective = themePref;
      if (effective === 'auto') {
        effective = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', effective);
    };
    apply();
    if (themePref === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [themePref]);

  const setTheme = v => { setThemePref(v); try { localStorage.setItem('planr_theme', v); } catch {} };

  return <ThemeContext.Provider value={{ theme: themePref, themePref, setTheme }}>
    {children}
  </ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
