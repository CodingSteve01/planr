// One informational drift/health row — id + name + whatever the caller wants
// on the right (a status pill, a key, nothing). Deliberately not the
// StatusCycleButton row style: these are read as a worklist (matching the
// old Jira-Abgleich dialog's Row component), not edited in place.
export function JiraRow({ id, name, right, onClick, testId }) {
  return (
    <div
      onClick={onClick}
      data-testid={testId}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11, cursor: onClick ? 'pointer' : 'default' }}
    >
      <span style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', width: 70, flexShrink: 0 }}>{id}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tx2)' }}>{name}</span>
      {right}
    </div>
  );
}

export function JiraSection({ title, tone, count, hint, children }) {
  if (!count) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: tone }}>{title}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{count}</span>
      </div>
      {hint && <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 3, fontStyle: 'italic' }}>{hint}</div>}
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '4px 8px' }}>{children}</div>
    </div>
  );
}
