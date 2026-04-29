// Reusable custom-field input — renders the right input type for each field
// definition. Used by NodeModal and QuickEdit.
//
// Text / URI / number variants buffer locally and commit via LazyInput
// (blur or Enter). NodeModal-side this is redundant since NodeModal already
// holds a local form draft, but QuickEdit pipes onChange straight to App's
// updateNode → scheduler re-run — so a per-keystroke commit there means a
// full reschedule on every typed character. LazyInput debounces that.
import { SearchSelect } from './SearchSelect.jsx';
import { LazyInput } from './LazyInput.jsx';
import { resolveUri } from '../../utils/customFields.js';
import { useT } from '../../i18n.jsx';

/**
 * @param {object} field — custom field definition { id, name, type, uriTemplate?, options? }
 * @param {string|number} value — current raw value
 * @param {function} onChange — called with new value (on blur/Enter for text-like types)
 */
export function CustomFieldInput({ field, value, onChange }) {
  const { t } = useT();
  const v = value ?? '';

  if (field.type === 'select') {
    const opts = (field.options || []).map(o => ({ id: o, label: o }));
    return <SearchSelect value={v} options={opts} onSelect={onChange} allowEmpty />;
  }

  if (field.type === 'uri') {
    const url = resolveUri(field, v);
    return <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <LazyInput
        style={{ flex: 1 }}
        value={v}
        placeholder={field.uriTemplate ? 'e.g. PROJ-123' : 'https://…'}
        onCommit={onChange}
      />
      {url && <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-sec btn-xs"
        style={{ padding: '4px 7px', lineHeight: 1, textDecoration: 'none' }}
        data-htip={t('cf.openLink')}
      >↗</a>}
    </div>;
  }

  if (field.type === 'number') {
    return <LazyInput
      type="number"
      value={v}
      onCommit={val => onChange(val === '' ? '' : +val)}
      style={{ fontFamily: 'var(--mono)' }}
    />;
  }

  // default: text
  return <LazyInput value={v} onCommit={onChange} />;
}
