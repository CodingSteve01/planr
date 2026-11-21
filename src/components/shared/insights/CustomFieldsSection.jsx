import { resolveUri } from '../../../utils/customFields.js';
import { useT } from '../../../i18n.jsx';
import { KVRow, Section } from './InsightParts.jsx';

// Custom fields with values
export function CustomFieldsSection({ node, filledCustomFields, sec }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  return (
    <Section label={t('cf.fieldValues')} onClick={sec('customFields')} editLabel={editLabel}>
      {filledCustomFields.map(cf => {
        const val = (node.customValues || {})[cf.id];
        const url = cf.type === 'uri' ? resolveUri(cf, val) : null;
        return (
          <KVRow key={cf.id} label={cf.name}>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                style={{ color: 'var(--ac)', fontSize: 12 }}
              >
                {val}
              </a>
            ) : (
              <span style={{ fontSize: 12 }}>{val}</span>
            )}
          </KVRow>
        );
      })}
    </Section>
  );
}
