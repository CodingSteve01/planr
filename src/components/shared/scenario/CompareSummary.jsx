import { useT } from '../../../i18n.jsx';
import { plainTone } from '../../../utils/scenarioUi/compareFigures.js';
import { Tile } from './CompareParts.jsx';
import { useFmt } from './useFmt.js';

// What the changes come to, above the tabs: a sentence per team and the four
// figure tiles. A tile or a team name opens the tab that holds the detail.
export function CompareSummary({ story, totals, projects, list, setTab }) {
  const { t } = useT();
  const fmt = useFmt();
  return (
    <>
      {story.length > 0 && (
        <ul className="scn-story" data-testid="scn-story">
          {story.map(line => (
            <li key={line.id}>
              <button type="button" className="scn-link" onClick={() => setTab('teams')}>
                <b>{line.name}:</b>
              </button>{' '}
              {line.text}
            </li>
          ))}
        </ul>
      )}

      <div className="scn-tiles">
        <Tile
          testid="scn-tile-dates"
          label={t('scn.kpi.dates')}
          onClick={() => setTab('projects')}
          sub={t('scn.kpi.datesSub')}
          figures={[
            { n: totals.newlyLate || 0, label: t('scn.kpi.newlyLate'), tone: totals.newlyLate ? 'var(--st-risk)' : 'var(--tx3)' },
            { n: totals.rescued || 0, label: t('scn.kpi.rescued'), tone: totals.rescued ? 'var(--st-done)' : 'var(--tx3)' },
          ]}
        />
        <Tile
          testid="scn-tile-projects"
          label={t('scn.kpi.projects')}
          onClick={() => setTab('projects')}
          sub={t('scn.kpi.projectsSub', projects.length)}
          figures={[
            { n: totals.affected || 0, label: t('scn.kpi.affected'), tone: plainTone(totals.affected) },
            { n: totals.later || 0, label: t('scn.kpi.endLater'), tone: plainTone(totals.later) },
            { n: totals.earlier || 0, label: t('scn.kpi.endEarlier'), tone: plainTone(totals.earlier) },
          ]}
        />
        <Tile
          testid="scn-tile-end"
          label={t('scn.kpi.end')}
          figures={[{ n: fmt.shift(totals.endShift), tone: plainTone(totals.endShift) }]}
          sub={totals.baseEnd || totals.workEnd ? `${fmt.date(totals.baseEnd)} → ${fmt.date(totals.workEnd)}` : null}
        />
        <Tile
          testid="scn-tile-changes"
          label={t('scn.tab.changes')}
          onClick={() => setTab('changes')}
          figures={[{ n: list.length, tone: plainTone(list.length) }]}
          sub={t('scn.kpi.itemsSub', totals.itemsMoved || 0)}
        />
      </div>
    </>
  );
}
