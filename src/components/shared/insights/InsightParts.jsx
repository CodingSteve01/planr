export const S_LABEL = { open: 'tv.statusOpen', wip: 'tv.statusWip', done: 'tv.statusDone' };

export function KVRow({ label, children, style }) {
  return (
    <>
      <span style={{ fontSize: 12, color: 'var(--tx3)', paddingRight: 8, alignSelf: 'start', paddingTop: 2, ...style }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--tx)', ...style }}>{children}</span>
    </>
  );
}

export function StatChip({ label, value, tone = 'default' }) {
  const toneColor = tone === 'danger' ? 'var(--re)' : tone === 'warn' ? 'var(--am)' : 'var(--tx)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 999,
        background: 'var(--bg3)',
        border: '1px solid var(--b)',
        fontSize: 11,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--tx3)' }}>{label}</span>
      <span style={{ color: toneColor, fontFamily: 'var(--mono)', fontWeight: 700 }}>{value}</span>
    </span>
  );
}

// Everything clickable here is reachable by keyboard too: Tab onto it, and
// Enter or Space does what the click does. The dialog opens with E, and a
// dialog you can open by key and then only use with the mouse is half a
// keyboard path.
export function activatable(onActivate, role = 'button') {
  if (!onActivate) return {};
  return {
    role,
    tabIndex: 0,
    className: 'ins-activatable',
    onKeyDown: e => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onActivate(e);
      }
    },
  };
}

export function Section({ label, onClick, editLabel, children, extra }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      {...activatable(onClick)}
      aria-label={clickable ? `${label} — ${editLabel}` : undefined}
      data-htip={clickable ? editLabel : undefined}
      style={{
        borderRadius: 'var(--r)',
        padding: '6px 8px',
        margin: '8px -8px 0',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background .12s',
      }}
      onMouseEnter={
        clickable
          ? e => {
              e.currentTarget.style.background = 'rgba(108,160,255,.07)';
            }
          : undefined
      }
      onMouseLeave={
        clickable
          ? e => {
              e.currentTarget.style.background = 'transparent';
            }
          : undefined
      }
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          color: clickable ? 'var(--tx2)' : 'var(--tx3)',
          marginBottom: 4,
          borderBottom: '1px solid var(--b)',
          paddingBottom: 3,
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <span>{label}</span>
        {extra && <span onClick={e => e.stopPropagation()}>{extra}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '4px 8px' }}>{children}</div>
    </div>
  );
}
