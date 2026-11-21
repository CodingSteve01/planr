import { useMemo, useState } from 'react';
import { useT } from '../../../i18n.jsx';
import { Roadmap } from '../../shared/Roadmap.jsx';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { TimetableView } from '../TimetableView.jsx';
import { DiffBanner } from './DiffBanner.jsx';
import { RetroPanel } from './RetroPanel.jsx';

export function RoadmapSwitcher({
  tree,
  scheduled,
  stats,
  goals,
  teams,
  members,
  onOpenItem,
  sinceDate,
  diff,
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
}) {
  const { t } = useT();
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('planr_roadmap_view') || 'map';
    } catch {
      return 'map';
    }
  });
  const setAndPersist = v => {
    setView(v);
    try {
      localStorage.setItem('planr_roadmap_view', v);
    } catch {
      /* noop */
    }
  };
  // The MAP is the portfolio lens (docs/features.md, Roadmap lenses): every
  // project, one glance, Δ since the last review window. Its old "solo one
  // line" mode is gone — a duplicate of the calendar that now lives beside
  // the Gantt in Plan mode (RoadmapLens.jsx), and a worse fit here besides:
  // a portfolio review is exactly the moment you do not want to narrow to
  // one line.
  //
  // The TIMETABLE is a different surface that happens to share this switcher,
  // and narrowing it to one project is NOT a duplicate of anything — no
  // other view lists one project's dates as a schedule. So the picker stays,
  // scoped to the view that still needs it. (Phase 5 dropped it for both;
  // that took a capability away, which is the one thing a removal may never
  // do.)
  const [scheduleRoot, setScheduleRoot] = useState(() => {
    try {
      return localStorage.getItem('planr_timetable_root') || '';
    } catch {
      return '';
    }
  });
  const roots = useMemo(() => tree.filter(node => !String(node.id).includes('.')), [tree]);
  // A stored root that no longer exists (renamed, deleted, archived) must not
  // blank the schedule.
  const scopeRoot = scheduleRoot && roots.some(r => r.id === scheduleRoot) ? scheduleRoot : '';
  const setScope = id => {
    const next = id === scopeRoot ? '' : id;
    setScheduleRoot(next);
    try {
      localStorage.setItem('planr_timetable_root', next);
    } catch {
      /* noop */
    }
  };
  const scheduleTree = useMemo(
    () => (scopeRoot ? tree.filter(n => n.id === scopeRoot || String(n.id).startsWith(scopeRoot + '.')) : tree),
    [tree, scopeRoot],
  );
  // diff comes in from App.jsx — same precomputed bag every view uses, so
  // Roadmap, Timetable, Tree, Gantt and Network stay in sync.

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          className={`btn btn-xs ${view === 'map' ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => setAndPersist('map')}
        >
          {t('tt.map')}
        </button>
        <button
          className={`btn btn-xs ${view === 'schedule' ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => setAndPersist('schedule')}
        >
          {t('tt.title')}
        </button>
        {view === 'schedule' && roots.length > 1 && (
          <span style={{ width: 190, marginLeft: 8 }} data-htip={t('tt.scopeTip')} data-testid="timetable-root-picker">
            <SearchSelect
              value={scopeRoot}
              options={roots.map(root => ({ id: root.id, label: root.name || root.id }))}
              onSelect={id => setScope(id)}
              placeholder={t('tt.allProjects')}
              allowEmpty
              emptyLabel={t('tt.allProjects')}
              showIds
            />
          </span>
        )}
        <span style={{ marginLeft: 8 }}>
          {/* The filter control lives in the sub-toolbar now, which the
              Overview gets like every other filtered view. Two copies of the
              same control on one screen is one too many. */}
        </span>
        {/* Archived count stays visible next to the filters so a shorter map
            is never a silent omission. */}
        {!!archive?.count && !showArchived && typeof setShowArchived === 'function' && (
          <button
            className="btn btn-xs btn-sec"
            style={{ padding: '3px 8px', fontSize: 11 }}
            onClick={() => setShowArchived(true)}
            data-htip={t(
              'arch.pillTip',
              [
                archive.roots.length ? t(archive.roots.length === 1 ? 'arch.root' : 'arch.roots', archive.roots.length) : '',
                archive.members.length ? t(archive.members.length === 1 ? 'arch.member' : 'arch.members', archive.members.length) : '',
              ]
                .filter(Boolean)
                .join(' · '),
            )}
          >
            {t('arch.pill', archive.count)}
          </button>
        )}
        {/* hideDone toggle lives in the App-level subtoolbar / popup, not
            here — Summary's tt.map view doesn't filter rows by status. */}
      </div>

      {view === 'map' && diff && <DiffBanner diff={diff} sinceDate={sinceDate} />}
      {view === 'map' && diff && sinceDate && (
        <RetroPanel diff={diff} holidayIso={holidayIso} onOpenItem={onOpenItem} tree={tree} workDays={workDays} />
      )}
      {view === 'map' ? (
        <Roadmap
          tree={tree}
          scheduled={scheduled}
          goals={goals}
          stats={stats}
          teams={teams}
          members={members}
          onOpenItem={onOpenItem}
          diff={diff}
          scenarioShifts={scenarioShifts}
          horizonIds={horizonIds}
          horizonEnd={horizonEnd}
          futureProgressByRootId={futureProgressByRootId}
          assignment={roadmapAssignment}
          onAssignmentChange={onAssignmentChange}
        />
      ) : (
        <TimetableView
          tree={scheduleTree}
          scheduled={scheduled}
          stats={stats}
          teams={teams}
          members={members}
          diffDoneIds={diff?.doneInWindowIds}
          diffProgressedIds={diff?.progressedInWindowIds}
          sinceDate={sinceDate}
          scenarioShifts={scenarioShifts}
        />
      )}
    </div>
  );
}
