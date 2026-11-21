import { useT } from '../../../i18n.jsx';
import { AutoAssignBadge } from '../AutoAssignBadge.jsx';
import { KVRow, Section } from './InsightParts.jsx';

// People section — assignees + team in one row
export function PeopleSection({ assignees, team, sc, sec }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  return (
    <Section label={t('ins.people')} onClick={sec('people')} editLabel={editLabel}>
      <KVRow label={t('ins.assignees')}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {(assignees.length > 0 || sc?.autoAssigned) && (
            <span>{assignees.length > 0 ? assignees.map(m => m.name).join(', ') : sc?.person}</span>
          )}
          {sc?.autoAssigned && <AutoAssignBadge title={t('ins.autoAssignedTip')}>{t('ins.autoAssigned')}</AutoAssignBadge>}
          {team && (
            <>
              <span style={{ color: 'var(--tx3)', fontSize: 11 }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: team.color || 'var(--b3)' }} />
                <span style={{ color: 'var(--tx2)' }}>{team.name}</span>
              </span>
            </>
          )}
        </span>
      </KVRow>
    </Section>
  );
}
