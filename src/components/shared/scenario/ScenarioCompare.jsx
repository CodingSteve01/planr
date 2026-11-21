import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon.jsx';
import { useT } from '../../../i18n.jsx';
import { describeChanges } from '../../../utils/scenario.js';
import { projectDiffers, teamDiffers } from '../../../utils/scenarioCompare.js';
import { KIND_ORDER, TAB_IDS, personDiffers, storyLines } from '../../../utils/scenarioUi/compareFigures.js';
import { CompareSummary } from './CompareSummary.jsx';
import { ChangesPanel, ItemsPanel, PeoplePanel, ProjectsPanel, TeamsPanel } from './ComparePanels.jsx';
import { useFieldText } from './useFieldText.js';
import { useFmt } from './useFmt.js';

// `memory` is a plain object the App keeps for the length of a scenario
// visit: which tab was open, whether "only what differs" was on. Jumping to a
// task and coming back lands where you left, not on the first tab.
export function ScenarioCompare({
  scenario,
  base,
  work,
  comparison,
  changes,
  conflicts,
  memory,
  onClose,
  onApply,
  onRevert,
  onOpenItem,
  onExport,
}) {
  const { t } = useT();
  const fmt = useFmt();
  const text = useFieldText(base, work, fmt);
  const [tab, setTabState] = useState(() => (TAB_IDS.includes(memory?.tab) ? memory.tab : 'projects'));
  const [onlyMoved, setOnlyMovedState] = useState(() => memory?.onlyMoved !== false);
  const setTab = id => {
    setTabState(id);
    if (memory) memory.tab = id;
  };
  const setOnlyMoved = v => {
    setOnlyMovedState(v);
    if (memory) memory.onlyMoved = v;
  };
  const [exporting, setExporting] = useState(false);
  const dialogRef = useRef(null);
  // A dialog: focus goes in, Tab stays in, and on close focus returns to
  // whatever opened it.
  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.focus?.();
    return () => {
      opener?.focus?.();
    };
  }, []);
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input, [tabindex="0"]')];
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const list = changes || describeChanges(base, work);
  const totals = comparison?.totals || {};
  const projects = comparison?.projects || [];
  const people = comparison?.people || [];
  const items = comparison?.items || [];
  const differingProjects = projects.filter(projectDiffers);
  const teams = comparison?.teams || [];
  const differingTeams = teams.filter(teamDiffers);
  const shownTeams = onlyMoved ? differingTeams : teams;
  const maxTeamShift = Math.max(0, ...teams.map(tm => Math.abs(tm.untilShift || 0)));
  // What the changes mean, in a sentence per team: the step from "one person
  // is out" to "this team has less, so all of its work moves". Teams whose
  // people or capacity changed come first, then by how far their work moves.
  const story = storyLines(t, fmt, teams);
  const differingPeople = people.filter(personDiffers);
  const shownProjects = onlyMoved ? differingProjects : projects;
  const shownPeople = onlyMoved ? differingPeople : people;
  const maxProjectShift = Math.max(0, ...projects.map(p => Math.abs(p.shift || 0)));
  const maxItemShift = Math.max(0, ...items.map(i => Math.abs(i.endShift || 0)));
  const maxPersonShift = Math.max(0, ...people.map(p => Math.abs(p.untilShift || 0)));
  const grouped = KIND_ORDER.map(kind => [kind, list.filter(c => c.kind === kind)]).filter(([, l]) => l.length);
  const tabs = [
    ['projects', t('scn.tab.projects'), differingProjects.length],
    ['teams', t('scn.tab.teams'), differingTeams.length],
    ['people', t('scn.tab.people'), differingPeople.length],
    ['items', t('scn.tab.items'), items.length],
    ['changes', t('scn.tab.changes'), list.length],
  ];
  const onTabKey = e => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = TAB_IDS[(TAB_IDS.indexOf(tab) + dir + TAB_IDS.length) % TAB_IDS.length];
    setTab(next);
    dialogRef.current?.querySelector(`[data-testid="scn-tab-${next}"]`)?.focus();
  };
  const title = t('scn.compareTitle', scenario?.name || '');

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal scn-compare"
        data-testid="scenario-compare-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <div className="scn-compare-head">
          <h2>
            <Icon name="branch" size={15} />
            {title}
          </h2>
          <button type="button" className="btn btn-ghost btn-xs" aria-label={t('close')} onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <p className="scn-compare-lede">{t('scn.compareLede')}</p>
        <CompareSummary story={story} totals={totals} projects={projects} list={list} setTab={setTab} />
        {conflicts > 0 && (
          <div className="scn-notice" data-testid="scn-conflict-note">
            <Icon name="alert" size={13} />
            {conflicts === 1 ? t('scn.conflictNoteOne') : t('scn.conflictNote', conflicts)}
          </div>
        )}

        <div className="scn-tabs" role="tablist" onKeyDown={onTabKey}>
          {tabs.map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls="scn-panel"
              tabIndex={tab === id ? 0 : -1}
              className={`scn-tab${tab === id ? ' on' : ''}`}
              data-testid={`scn-tab-${id}`}
              onClick={() => setTab(id)}
            >
              {label}
              <span className="scn-tab-n">{n}</span>
            </button>
          ))}
          <span className="sp" />
          {(tab === 'projects' || tab === 'teams' || tab === 'people') && (
            <label className="scn-only">
              <input type="checkbox" checked={onlyMoved} onChange={e => setOnlyMoved(e.target.checked)} />
              {t('scn.onlyMoved')}
            </label>
          )}
        </div>

        <div className="scn-body" id="scn-panel" role="tabpanel">
          {tab === 'projects' && <ProjectsPanel shownProjects={shownProjects} maxProjectShift={maxProjectShift} onOpenItem={onOpenItem} />}
          {tab === 'teams' && <TeamsPanel shownTeams={shownTeams} maxTeamShift={maxTeamShift} />}
          {tab === 'people' && <PeoplePanel shownPeople={shownPeople} maxPersonShift={maxPersonShift} />}
          {tab === 'items' && <ItemsPanel items={items} maxItemShift={maxItemShift} text={text} onOpenItem={onOpenItem} />}
          {tab === 'changes' && <ChangesPanel list={list} grouped={grouped} text={text} onOpenItem={onOpenItem} onRevert={onRevert} />}
        </div>

        <div className="scn-compare-foot">
          <span className="scn-foot-hint">{t('scn.footHint')}</span>
          <span className="sp" />
          {onExport && (
            <button
              type="button"
              className="btn btn-sec btn-sm"
              data-testid="scenario-export-pdf"
              disabled={exporting}
              data-htip={t('scn.pdfTip')}
              onClick={async () => {
                setExporting(true);
                try {
                  await onExport();
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? '…' : t('scn.pdf')}
            </button>
          )}
          <button type="button" className="btn btn-sec btn-sm" onClick={onClose}>
            {t('close')}
          </button>
          <button
            type="button"
            className="btn btn-sm scn-apply"
            data-testid="scenario-apply-modal"
            disabled={!list.length}
            onClick={onApply}
          >
            {t('scn.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
