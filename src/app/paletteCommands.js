import { TAB_IDS } from '../utils/modes.js';
import { TAB_ICONS } from './shell.js';
import { BRIEFING_JOB_EVENT } from '../components/views/BriefingView.jsx';
import { RES_JOB_EVENT } from '../components/views/ResView.jsx';
import { KEYMAP_OPEN_EVENT } from '../components/shared/KeyboardMap.jsx';
import { EFFECTIVE_OPEN_EVENT } from '../components/shared/Effective.jsx';
import { SCENARIO_NEW_EVENT } from '../components/shared/Scenario.jsx';

// `keywords` are the words you reach for when the label is in the other
// language, or is a sentence where your head holds one noun.
const JOBS = [
  {
    id: 'jira',
    icon: 'swap',
    labelKey: 'job.jira',
    tab: 'briefing',
    event: BRIEFING_JOB_EVENT,
    keywords: ['jira', 'sync', 'abgleich', 'reconcile', 'ticket'],
  },
  {
    id: 'vacation',
    icon: 'beach',
    labelKey: 'job.vacation',
    tab: 'resources',
    event: RES_JOB_EVENT,
    keywords: ['vacation', 'holiday', 'urlaub', 'abwesenheit'],
  },
  {
    id: 'onboard',
    icon: 'plus',
    labelKey: 'job.onboard',
    tab: 'resources',
    event: RES_JOB_EVENT,
    keywords: ['onboard', 'onboarding', 'einstellen', 'mitarbeiter', 'person', 'hire'],
  },
];

// `/` command palette: every control displaced from the topbar (principle
// 4, tier 2), plus a jump to each mode and each view. One flat list; the
// palette itself groups by `group`/`groupLabel` and fuzzy-filters
// (src/utils/palette.js).
// `icon` and `key` are what make this list scannable rather than twenty
// rows of identical text; `key` is a shortcuts.js id, so the palette
// teaches the keystroke instead of hiding it.
function fileCommands({ _t, saved, loadFromFile, saveToFile, setModal, setTab, newProject, startTour }) {
  const fileGroup = _t('palette.group.file');
  return [
    { id: 'load', icon: 'folder', labelKey: 'palette.load', group: 'file', groupLabel: fileGroup, key: 'open', run: () => loadFromFile() },
    {
      id: 'snapshots',
      icon: 'undo',
      labelKey: 'palette.snapshots',
      group: 'file',
      groupLabel: fileGroup,
      run: () => setModal('snapshots'),
    },
    {
      id: 'saveAs',
      icon: 'save',
      labelKey: 'palette.saveAs',
      group: 'file',
      groupLabel: fileGroup,
      key: 'saveAs',
      run: () => saveToFile(true),
    },
    // Export… means "go look at the Report view" — the export cards rendered
    // as a normal view (ReportView.jsx). The old dialog stays one entry below
    // so nothing that worked before stops working.
    {
      id: 'export',
      icon: 'upload',
      labelKey: 'palette.export',
      group: 'file',
      groupLabel: fileGroup,
      key: 'export',
      run: () => setTab('report'),
    },
    {
      id: 'exportDialog',
      icon: 'doc',
      labelKey: 'palette.exportDialog',
      group: 'file',
      groupLabel: fileGroup,
      run: () => setModal('export'),
    },
    {
      id: 'jiraImport',
      icon: 'download',
      labelKey: 'ji.title',
      group: 'file',
      groupLabel: fileGroup,
      keywords: ['jira', 'import', 'csv', 'tickets', 'übernehmen', 'board'],
      run: () => setModal('jiraImport'),
    },
    {
      id: 'newProject',
      icon: 'sparkle',
      labelKey: 'palette.newProject',
      group: 'file',
      groupLabel: fileGroup,
      run: () => {
        if (!saved && !confirm(_t('app.newConfirm'))) return;
        newProject();
      },
    },
    { id: 'help', icon: 'help', labelKey: 'tour.helpTitle', group: 'file', groupLabel: fileGroup, run: () => startTour() },
    {
      id: 'keymap',
      icon: 'keyboard',
      labelKey: 'km.title',
      group: 'file',
      groupLabel: fileGroup,
      key: 'keymap',
      run: () => window.dispatchEvent(new Event(KEYMAP_OPEN_EVENT)),
    },
  ];
}

// The three things you do with the scenario on screen.
function activeScenarioCommands({ _t, scenarioSwitch, scenarioApply, exportScenarioPDF, setModal }) {
  return [
    {
      id: 'scenario.leave',
      icon: 'undo',
      labelKey: 'scn.cmd.leave',
      group: 'scenario',
      groupLabel: _t('palette.group.scenario'),
      keywords: ['plan', 'verlassen', 'leave'],
      run: () => scenarioSwitch(null),
    },
    {
      id: 'scenario.compare',
      icon: 'swap',
      labelKey: 'scn.cmd.compare',
      group: 'scenario',
      groupLabel: _t('palette.group.scenario'),
      keywords: ['vergleich', 'compare', 'diff'],
      run: () => setModal('scenario'),
    },
    {
      id: 'scenario.pdf',
      icon: 'doc',
      labelKey: 'scn.cmd.pdf',
      group: 'scenario',
      groupLabel: _t('palette.group.scenario'),
      keywords: ['pdf', 'report', 'bericht', 'export', 'vergleich'],
      run: () => exportScenarioPDF?.(),
    },
    {
      id: 'scenario.apply',
      icon: 'check',
      labelKey: 'scn.cmd.apply',
      group: 'scenario',
      groupLabel: _t('palette.group.scenario'),
      keywords: ['übernehmen', 'apply', 'merge'],
      run: () => scenarioApply(),
    },
  ];
}

// Scenarios: one entry to start one, one per scenario to go there, and
// while one is on screen the three things you do with it.
function scenarioCommands({ _t, scn, scenarioList, scenarioSwitch, scenarioApply, exportScenarioPDF, setModal }) {
  return [
    {
      id: 'effective.pick',
      icon: 'calendar',
      labelKey: 'eff.cmd',
      group: 'scenario',
      groupLabel: _t('palette.group.scenario'),
      keywords: [
        'stichtag',
        'datum',
        'ab',
        'kapazität',
        'capacity',
        'effective',
        'date',
        'meeting',
        'teilzeit',
        'backdate',
        'rückdatieren',
        'nachtragen',
        'früher',
        'earlier',
        'zeitreise',
      ],
      run: () => window.dispatchEvent(new Event(EFFECTIVE_OPEN_EVENT)),
    },
    {
      id: 'scenario.new',
      icon: 'branch',
      labelKey: 'scn.cmd.new',
      group: 'scenario',
      groupLabel: _t('palette.group.scenario'),
      keywords: ['scenario', 'szenario', 'what if', 'was wäre wenn', 'variante', 'alternative', 'simulation'],
      run: () => window.dispatchEvent(new Event(SCENARIO_NEW_EVENT)),
    },
    ...(scn ? activeScenarioCommands({ _t, scenarioSwitch, scenarioApply, exportScenarioPDF, setModal }) : []),
    ...scenarioList
      .filter(sc => sc.id !== scn?.id)
      .map(sc => ({
        id: `scenario.go.${sc.id}`,
        icon: 'branch',
        label: _t('scn.cmd.switch', sc.name),
        labelKey: 'scn.cmd.switch',
        group: 'scenario',
        groupLabel: _t('palette.group.scenario'),
        keywords: ['scenario', 'szenario'],
        run: () => scenarioSwitch(sc.id),
      })),
  ];
}

function jobAndViewCommands({ _t, setTab }) {
  const jobGroup = _t('palette.group.jobs');
  const viewGroup = _t('palette.group.views');
  return [
    // The jobs that come back every week. Each lands on the surface with the
    // work already started — the paste box focused, the row created — rather
    // than on the tab that contains it. A command that only changed tabs would
    // duplicate the view jumps below it.
    ...JOBS.map(j => ({
      id: `job.${j.id}`,
      icon: j.icon,
      labelKey: j.labelKey,
      keywords: j.keywords,
      group: 'job',
      groupLabel: jobGroup,
      run: () => {
        setTab(j.tab);
        window.setTimeout(() => window.dispatchEvent(new CustomEvent(j.event, { detail: { job: j.id } })), 0);
      },
    })),
    ...TAB_IDS.map(id => ({
      id: `view.${id}`,
      icon: TAB_ICONS[id] || 'chevronRight',
      labelKey: `tab.${id}`,
      group: 'view',
      groupLabel: viewGroup,
      run: () => setTab(id),
    })),
  ];
}

/** The command list the palette shows, in order: file, scenario, job, view. */
export function buildPaletteCommands(args) {
  return [...fileCommands(args), ...scenarioCommands(args), ...jobAndViewCommands(args)];
}
