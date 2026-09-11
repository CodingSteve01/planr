import { useState, useEffect, useRef, useMemo } from 'react';
import { useT } from '../../i18n.jsx';
import { filterCommands } from '../../utils/palette.js';

// Tier-2 catch-all (docs/principles.md, principle 4): everything displaced
// from the calmed-down topbar lives here, plus a jump to every mode and
// every view. Opens with `/` (only when focus isn't already in a field) or
// Cmd/Ctrl+K; a topbar button can also open it by dispatching
// PALETTE_OPEN_EVENT, so there is exactly one source of truth for "is it
// open" (this component's own state) instead of prop-drilling it through
// App.jsx.
export const PALETTE_OPEN_EVENT = 'planr:command-palette:open';

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!el.isContentEditable;
}

export function CommandPalette({ commands }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      if (!open && e.key === '/' && !isEditableTarget(document.activeElement)) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(PALETTE_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpenEvent);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIdx(0);
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  const resolved = useMemo(
    () => (commands || []).map(c => ({ ...c, label: t(c.labelKey) })),
    [commands, t],
  );
  const filtered = useMemo(() => filterCommands(resolved, query), [resolved, query]);
  const safeIdx = filtered.length ? Math.min(idx, filtered.length - 1) : 0;

  if (!open) return null;

  const run = (cmd) => {
    setOpen(false);
    cmd?.run?.();
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx(i => (filtered.length ? Math.min(i + 1, filtered.length - 1) : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[safeIdx]) run(filtered[safeIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  let lastGroup;
  return (
    <div className="overlay" onClick={() => setOpen(false)} data-testid="command-palette">
      <div
        className="modal fade"
        style={{ width: 'min(560px, 100%)', maxWidth: 560, padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setIdx(0); }}
          onKeyDown={onInputKeyDown}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.placeholder')}
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px solid var(--b)',
            background: 'transparent', color: 'var(--tx)', fontSize: 13, padding: '12px 14px', outline: 'none',
          }}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--tx3)' }}>{t('palette.noResults')}</div>
          )}
          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            return (
              <div key={cmd.id}>
                {showGroup && cmd.groupLabel && (
                  <div style={{ padding: '8px 14px 3px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>
                    {cmd.groupLabel}
                  </div>
                )}
                <div
                  role="option"
                  aria-selected={i === safeIdx}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => run(cmd)}
                  style={{
                    padding: '7px 14px', fontSize: 12.5, cursor: 'pointer',
                    background: i === safeIdx ? 'rgba(59,130,246,.16)' : 'transparent',
                    color: 'var(--tx)',
                  }}
                >
                  {cmd.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
