import { useT } from '../../../i18n.jsx';
import { capPct, movedText, plainTone, projectTone } from '../../../utils/scenarioUi/compareFigures.js';
import { changeTitle } from '../../../utils/scenarioUi/fieldLabels.js';
import { ShiftBar } from './CompareParts.jsx';
import { useCompareBadges } from './useCompareBadges.jsx';
import { useFmt } from './useFmt.js';

// The five tabs of the comparison dialog, one panel each. What a panel shows
// is decided by ScenarioCompare.jsx (which rows, the longest shift for the
// bars); the panel only lays it out.

export function ProjectsPanel({ shownProjects, maxProjectShift, onOpenItem }) {
  const { t } = useT();
  const fmt = useFmt();
  const { stateBadge, presence, empty } = useCompareBadges();
  return shownProjects.length === 0 ? (
    empty(t('scn.empty.projects'))
  ) : (
    <table className="scn-table" data-testid="scn-projects">
      <thead>
        <tr>
          <th>{t('scn.col.project')}</th>
          <th>{t('scn.col.deadline')}</th>
          <th>{t('scn.col.planEnd')}</th>
          <th>{t('scn.col.scnEnd')}</th>
          <th className="num">{t('scn.col.shift')}</th>
          <th />
          <th className="num">{t('scn.col.movedTasks')}</th>
        </tr>
      </thead>
      <tbody>
        {shownProjects.map(p => (
          <tr key={p.id} data-testid={`scn-project-${p.id}`}>
            <td>
              <button type="button" className="scn-link" onClick={() => onOpenItem(p.id)}>
                <span className="scn-id">{p.id}</span>
                {p.name}
              </button>{' '}
              {presence(p)} {stateBadge(p)}
              {!p.shift && p.moved > 0 && (
                <span className="scn-badge muted" data-htip={t('scn.endHeldTip')}>
                  {t('scn.endHeld')}
                </span>
              )}
            </td>
            <td>{p.date ? fmt.date(p.date) : '—'}</td>
            <td>{fmt.date(p.baseEnd)}</td>
            <td>{fmt.date(p.workEnd)}</td>
            <td className="num" style={{ color: projectTone(p), fontWeight: p.shift ? 600 : 400 }}>
              {fmt.shift(p.shift)}
            </td>
            <td className="bar">
              <ShiftBar shift={p.shift} max={maxProjectShift} tone={p.workLate !== p.baseLate ? projectTone(p) : null} />
            </td>
            <td className="num" style={{ color: plainTone(p.moved || p.gone || p.added) }}>
              {movedText(t, fmt, p)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeamsPanel({ shownTeams, maxTeamShift }) {
  const { t } = useT();
  const fmt = useFmt();
  const { presence, empty } = useCompareBadges();
  return shownTeams.length === 0 ? (
    empty(t('scn.empty.teams'))
  ) : (
    <table className="scn-table" data-testid="scn-teams">
      <thead>
        <tr>
          <th>{t('scn.col.team')}</th>
          <th className="num">{t('scn.col.people')}</th>
          <th className="num">{t('scn.col.capacity')}</th>
          <th className="num">{t('scn.col.movedTasks')}</th>
          <th>{t('scn.col.teamEnd')}</th>
          <th className="num">{t('scn.col.shift')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {shownTeams.map(tm => (
          <tr key={tm.id} data-testid={`scn-team-${tm.id}`}>
            <td>
              {tm.name} {presence(tm)}
            </td>
            <td
              className="num"
              style={{
                color: plainTone(tm.basePeople !== tm.workPeople),
                fontWeight: tm.basePeople !== tm.workPeople ? 600 : 400,
              }}
            >
              {tm.basePeople === tm.workPeople ? tm.workPeople : `${tm.basePeople} → ${tm.workPeople}`}
            </td>
            <td
              className="num"
              style={{ color: plainTone(tm.capShiftPct || tm.capNew), fontWeight: tm.capShiftPct || tm.capNew ? 600 : 400 }}
            >
              {tm.capNew ? t('scn.capNew') : tm.capShiftPct ? capPct(tm.capShiftPct) : '±0'}
            </td>
            <td className="num" style={{ color: plainTone(tm.moved || tm.gone || tm.added) }}>
              {movedText(t, fmt, tm)}
            </td>
            <td>
              {fmt.date(tm.baseUntil)} → {fmt.date(tm.workUntil)}
            </td>
            <td className="num" style={{ color: plainTone(tm.untilShift), fontWeight: tm.untilShift ? 600 : 400 }}>
              {fmt.shift(tm.untilShift)}
            </td>
            <td className="bar">
              <ShiftBar shift={tm.untilShift} max={maxTeamShift} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PeoplePanel({ shownPeople, maxPersonShift }) {
  const { t } = useT();
  const fmt = useFmt();
  const { presence, empty } = useCompareBadges();
  return shownPeople.length === 0 ? (
    empty(t('scn.empty.people'))
  ) : (
    <table className="scn-table" data-testid="scn-people">
      <thead>
        <tr>
          <th>{t('scn.col.person')}</th>
          <th className="num">{t('scn.col.load')}</th>
          <th className="num">{t('scn.col.loadShift')}</th>
          <th>{t('scn.col.busyUntil')}</th>
          <th className="num">{t('scn.col.shift')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {shownPeople.map(p => (
          <tr key={p.id} data-testid={`scn-person-${p.id}`}>
            <td>
              {p.name} {presence(p)}
            </td>
            <td className="num">
              {fmt.pt(p.baseEffort)} → {fmt.pt(p.workEffort)}
            </td>
            <td className="num" style={{ color: plainTone(p.effortShift), fontWeight: p.effortShift ? 600 : 400 }}>
              {p.effortShift ? `${p.effortShift > 0 ? '+' : '−'}${fmt.pt(Math.abs(p.effortShift))}` : '±0'}
            </td>
            <td>
              {fmt.date(p.baseUntil)} → {fmt.date(p.workUntil)}
            </td>
            {/* No colour: a person free earlier is not "good", it is
                  capacity nobody has planned yet. */}
            <td className="num" style={{ color: plainTone(p.untilShift), fontWeight: p.untilShift ? 600 : 400 }}>
              {fmt.shift(p.untilShift)}
            </td>
            <td className="bar">
              <ShiftBar shift={p.untilShift} max={maxPersonShift} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ItemsPanel({ items, maxItemShift, text, onOpenItem }) {
  const { t } = useT();
  const fmt = useFmt();
  const { presence, empty } = useCompareBadges();
  const ITEM_LIMIT = 150;
  return items.length === 0 ? (
    empty(t('scn.empty.items'))
  ) : (
    <>
      <table className="scn-table" data-testid="scn-items">
        <thead>
          <tr>
            <th>{t('scn.col.item')}</th>
            <th>{t('scn.col.plan')}</th>
            <th>{t('scn.col.scenario')}</th>
            <th>{t('scn.col.who')}</th>
            <th className="num">{t('scn.col.shift')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.slice(0, ITEM_LIMIT).map(i => (
            <tr key={i.id}>
              <td>
                <button type="button" className="scn-link" onClick={() => onOpenItem(i.id)}>
                  <span className="scn-id">{i.id}</span>
                  {i.name}
                </button>{' '}
                {presence(i)}
              </td>
              <td>{i.baseStart ? `${fmt.date(i.baseStart)} – ${fmt.date(i.baseEnd)}` : '—'}</td>
              <td>{i.workStart ? `${fmt.date(i.workStart)} – ${fmt.date(i.workEnd)}` : '—'}</td>
              <td>
                {i.peopleChanged
                  ? `${i.basePeople.map(text.person).join(', ') || '—'} → ${i.workPeople.map(text.person).join(', ') || '—'}`
                  : (i.workPeople.length ? i.workPeople : i.basePeople).map(text.person).join(', ')}
              </td>
              <td className="num" style={{ color: plainTone(i.endShift), fontWeight: i.endShift ? 600 : 400 }}>
                {fmt.shift(i.endShift)}
              </td>
              <td className="bar">
                <ShiftBar shift={i.endShift} max={maxItemShift} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > ITEM_LIMIT && <div className="scn-more-rows">{t('scn.moreItems', items.length - ITEM_LIMIT)}</div>}
    </>
  );
}

export function ChangesPanel({ list, grouped, text, onOpenItem, onRevert }) {
  const { t } = useT();
  const fmt = useFmt();
  const { empty } = useCompareBadges();
  return list.length === 0 ? (
    empty(t('scn.empty.changes'))
  ) : (
    <div data-testid="scn-changes">
      {grouped.map(([kind, entries]) => (
        <div key={kind} className="scn-group">
          <div className="scn-group-head">
            {t(`scn.kind.${kind}`)}
            <span className="scn-tab-n">{entries.length}</span>
          </div>
          {entries.map(c => {
            const head = changeTitle(c, t, text, fmt);
            const revertTip = c.fields.length > 1 ? t('scn.revertTipMany', c.fields.length) : t('scn.revertTip');
            return (
              <div key={`${c.kind}:${c.op}:${c.id}`} className="scn-change" data-testid={`scn-change-${c.kind}-${c.id}`}>
                <span className="scn-op" aria-hidden="true">
                  {c.op === 'add' ? '+' : c.op === 'remove' ? '−' : '~'}
                </span>
                <span className="scn-change-text">
                  <span className="scn-change-title">
                    {c.kind === 'item' && c.op !== 'remove' ? (
                      <button type="button" className="scn-link" onClick={() => onOpenItem(c.id)}>
                        <span className="scn-id">{head.id}</span>
                        {head.title}
                      </button>
                    ) : (
                      <>
                        {head.id && <span className="scn-id">{head.id}</span>}
                        {head.title}
                      </>
                    )}
                    {c.op === 'add' && <span className="scn-badge new">{t('scn.added')}</span>}
                    {c.op === 'remove' && <span className="scn-badge muted">{t('scn.removed')}</span>}
                  </span>
                  {c.fields.length > 0 && c.kind !== 'order' && <span className="scn-change-fields">{text.fields(c.fields)}</span>}
                </span>
                <button
                  type="button"
                  className="scn-revert"
                  aria-label={`${t('scn.revert')}: ${head.title}`}
                  data-htip={revertTip}
                  data-testid={`scn-revert-${c.kind}-${c.id}`}
                  onClick={() => onRevert(c)}
                >
                  {t('scn.revert')}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
