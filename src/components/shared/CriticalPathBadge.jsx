export function CriticalPathBadge({ id, labels = {}, style = {}, compact = false }) {
  const cpLabels = id ? (labels[id] || []) : [];
  if (!cpLabels.length) return null;
  const primary = cpLabels[0];
  const extra = cpLabels.length > 1 ? ` +${cpLabels.length - 1}` : '';
  const title = cpLabels.length > 1 ? cpLabels.join(', ') : primary;
  return (
    <span
      className="badge b-cp"
      data-htip={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'var(--mono)',
        fontSize: compact ? 9 : 10,
        lineHeight: 1,
        ...style,
      }}
    >
      <span>{primary}</span>
      {extra && <span style={{ opacity: 0.8 }}>{extra}</span>}
    </span>
  );
}
