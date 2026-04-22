// Custom fields — project-level field definitions + value helpers.
// Each field: { id, name, type: 'text'|'number'|'uri'|'select', uriTemplate?, options? }
// Values stored on TreeItem as `customValues: { [fieldId]: value }`

export const DEFAULT_CUSTOM_FIELDS = [
  { id: 'jira', name: 'Jira ID', type: 'uri', uriTemplate: '' },
];

/**
 * Resolve the clickable URL for a URI field.
 * If `field.uriTemplate` is set, replaces `{value}` with the value.
 * Otherwise treats the value itself as the URL.
 * Returns null if value is empty.
 */
export function resolveUri(field, value) {
  if (!value) return null;
  if (field.uriTemplate) return field.uriTemplate.replace('{value}', encodeURIComponent(value));
  // Value is a plain URL — return as-is, but ensure a scheme exists
  if (/^https?:\/\//i.test(value)) return value;
  return 'https://' + value;
}
