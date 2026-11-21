import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { initials } from '../../../utils/res/initials.js';

export function ResVacationsSection({
  t,
  fMembers,
  fVacations,
  sortedVacs,
  vacsByYear,
  vacYears,
  allVacYears,
  vacMember,
  setVacMember,
  vacYear,
  setVacYear,
  vacations,
  members,
  teams,
  setEditingVacIdx,
}) {
  return (
    <>
      <p className="helper" style={{ marginBottom: 10 }}>
        {t('rv.vacHint')}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ width: 200 }}>
          <SearchSelect
            value={vacMember}
            options={fMembers.map(m => ({ id: m.id, label: m.name || m.id }))}
            onSelect={setVacMember}
            placeholder={t('tv.allPeople')}
            allowEmpty
            emptyLabel={t('tv.allPeople')}
          />
        </div>
        <select
          value={vacYear}
          onChange={e => setVacYear(e.target.value)}
          style={{
            padding: '5px 8px',
            fontSize: 12,
            background: 'var(--bg3)',
            color: 'var(--tx)',
            border: '1px solid var(--b2)',
            borderRadius: 'var(--r)',
            minWidth: 100,
          }}
        >
          <option value="">{t('rv.allYears')}</option>
          {allVacYears.map(y => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {(vacMember || vacYear) && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => {
              setVacMember('');
              setVacYear('');
            }}
            data-htip={t('rv.clearFilters')}
            aria-label={t('rv.clearFilters')}
            style={{ padding: '2px 7px', fontSize: 12 }}
          >
            <Icon name="x" size={11} />
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
          {sortedVacs.length} / {fVacations.length}
        </span>
      </div>
      {sortedVacs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>—</div>
      ) : (
        vacYears.map(year => (
          <div key={year} style={{ marginBottom: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                paddingBottom: 4,
                borderBottom: '2px solid var(--b)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--tx2)' }}>{year}</span>
              <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{vacsByYear[year].length}</span>
            </div>
            <table className="res-table">
              <colgroup>
                <col style={{ width: 30 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 180 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  <th>{t('rv.person')}</th>
                  <th>{t('rv.period')}</th>
                  <th>{t('rv.note')}</th>
                </tr>
              </thead>
              <tbody>
                {vacsByYear[year].map(v => {
                  const origIdx = vacations.indexOf(v);
                  const mem = members.find(m => m.id === v.person);
                  const team = mem ? teams.find(tm => tm.id === mem.team) : null;
                  const range = [v.from, v.to].filter(Boolean).join(' – ') || (
                    <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.vacDateRange')}</span>
                  );
                  return (
                    <tr key={origIdx} data-testid={`rv-vac-row-${origIdx}`} onClick={() => setEditingVacIdx(origIdx)}>
                      <td className="res-td-avatar">
                        <span className="res-avatar" style={{ background: team?.color || 'var(--ac)' }}>
                          {initials(mem?.name || v.person || '?')}
                        </span>
                      </td>
                      <td className="res-row-name">
                        {mem?.name || v.person || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.choosePerson')}</span>}
                      </td>
                      <td className="res-row-meta">{range}</td>
                      <td className="res-row-meta" style={{ opacity: 0.7, fontStyle: 'italic', fontFamily: 'var(--font)' }}>
                        {v.note || ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  );
}
