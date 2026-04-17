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
  'qe.quickEstimate': 'Quick estimate', 'qe.bestDays': 'Best (days)', 'qe.factor': 'Factor',
  'qe.priority': 'Priority', 'qe.estimationWizard': 'Estimation Wizard...',
  'qe.decideBy': 'Decide by', 'qe.pinnedStart': 'Pinned start', 'qe.parallel': 'Parallel',
  'qe.queue': 'Queue', 'qe.predecessors': 'Predecessors', 'qe.successors': 'Successors',
  'qe.notes': 'Notes', 'qe.duplicate': 'Duplicate', 'qe.assignPerson': 'Assign person...',
  'qe.children': 'Children', 'qe.best': 'Best', 'qe.realistic': 'Realistic',
  'qe.period': 'Period', 'qe.duration': 'Duration', 'qe.person': 'Person',
  'qe.effort': 'Effort', 'qe.realisticSuffix': 'realistic', 'qe.notScheduled': 'not scheduled',
  'qe.leafItems': 'leaf items', 'qe.autoStatus': '(auto)',
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

  // ── TreeView ──
  'tv.collapseAll': 'Collapse all', 'tv.expandAll': 'Expand all',
  'tv.items': 'items', 'tv.leafs': 'leafs',
  'tv.addItem': '+ Add item', 'tv.allTeams': 'All teams',
};

const de = {
  // ── Global / shared ──
  'save': 'Speichern', 'cancel': 'Abbrechen', 'delete': 'Löschen', 'close': 'Schließen', 'back': 'Zurück', 'next': 'Weiter',
  'yes': 'Ja', 'no': 'Nein', 'auto': 'Auto', 'none': '— Keine',
  'open': 'Offen', 'wip': 'In Bearbeitung', 'done': '✓ Erledigt',
  'critical': 'Kritisch', 'high': 'Hoch', 'medium': 'Mittel', 'low': 'Niedrig',
  'goal': 'Ziel', 'painpoint': 'Problemfeld', 'deadline': 'Deadline',
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
  'qe.quickEstimate': 'Schnellschätzung', 'qe.bestDays': 'Best (Tage)', 'qe.factor': 'Faktor',
  'qe.priority': 'Priorität', 'qe.estimationWizard': 'Schätzungs-Wizard...',
  'qe.decideBy': 'Entscheiden bis', 'qe.pinnedStart': 'Fixierter Start', 'qe.parallel': 'Parallel',
  'qe.queue': 'Reihenfolge', 'qe.predecessors': 'Vorgänger', 'qe.successors': 'Nachfolger',
  'qe.notes': 'Notizen', 'qe.duplicate': 'Duplizieren', 'qe.assignPerson': 'Person zuweisen...',
  'qe.children': 'Unterelemente', 'qe.best': 'Best', 'qe.realistic': 'Realistisch',
  'qe.period': 'Zeitraum', 'qe.duration': 'Dauer', 'qe.person': 'Person',
  'qe.effort': 'Aufwand', 'qe.realisticSuffix': 'realistisch', 'qe.notScheduled': 'nicht eingeplant',
  'qe.leafItems': 'Leaf-Items', 'qe.autoStatus': '(auto)',
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

  // ── TreeView ──
  'tv.collapseAll': 'Alle zuklappen', 'tv.expandAll': 'Alle aufklappen',
  'tv.items': 'Items', 'tv.leafs': 'Leaves',
  'tv.addItem': '+ Item hinzufügen', 'tv.allTeams': 'Alle Teams',
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
