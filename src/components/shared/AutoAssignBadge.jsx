export function AutoAssignBadge({ children, title, style = {} }) {
  return (
    <span
      data-htip={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 4,
        border: '1px dashed var(--am)',
        color: 'var(--am)',
        background: 'transparent',
        fontSize: 10,
        lineHeight: 1.2,
        opacity: 0.8,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
