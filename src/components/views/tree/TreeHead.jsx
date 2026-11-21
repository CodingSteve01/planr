// The column head of the tree table. Stateless: `showIds` toggles the ID gutter label.
export function TreeHead({ showIds, t }) {
  return (
    <thead>
      <tr>
        <th data-col="gutter" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>
          {showIds ? 'ID' : ''}
        </th>
        <th data-col="name" style={{ background: 'var(--bg)', width: '100%' }}>
          {t('col.name')}
        </th>
        <th data-col="team" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>
          {t('col.team')}
        </th>
        <th data-col="who" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>
          {t('col.who')}
        </th>
        <th data-col="signal" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>
          {t('col.signal')}
        </th>
        <th data-col="effort" className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>
          {t('col.effort')}
        </th>
        <th data-col="progress" className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>
          %
        </th>
        <th data-col="schedule" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>
          {t('col.schedule')}
        </th>
        <th data-col="acts" style={{ background: 'var(--bg)', whiteSpace: 'nowrap', textAlign: 'center' }}></th>
      </tr>
    </thead>
  );
}
