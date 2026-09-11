import { useState, useRef, useEffect } from 'react';
import { useT } from '../../i18n.jsx';
import { keyHint } from '../../utils/shortcuts.js';

// The file operations, back on screen.
//
// Phase 3 moved Load / Snapshots / Save as / Export / New into the `/`
// palette and left the topbar with `/` and `⚙ Settings`. That was right
// about the topbar being too loud and wrong about these: opening and saving
// a file is not an advanced command you go looking for, it is the first
// thing someone reaches for, and a keyboard-only path to it is a path most
// people never find. ("I'm looking for save/load…")
//
// So: one button, not the old row of five. The palette keeps every one of
// these entries — this adds a visible way in, it does not take one away.
//
// Same popup mechanics as ViewFilters (the established pattern here):
// anchored panel, closes on outside click and on Escape.
export function FileMenu({ onLoad, onSaveAs, onSnapshots, onExport, onNew, fileName, dirty }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = run => { setOpen(false); run?.(); };

  // `key` is a shortcuts.js id where one exists, so the menu teaches the
  // keystroke at the control instead of in a separate list.
  const items = [
    { id: 'load', icon: '📂', label: t('palette.load'), run: onLoad },
    { id: 'saveAs', icon: '💾', label: t('palette.saveAs'), run: onSaveAs, key: 'save' },
    { id: 'snapshots', icon: '↶', label: t('palette.snapshots'), run: onSnapshots },
    { id: 'export', icon: '📤', label: t('palette.export'), run: onExport },
    { id: 'new', icon: '✧', label: t('palette.newProject'), run: onNew, separated: true },
  ];

  return <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
    <button
      type="button"
      className={`btn btn-sec btn-sm${open ? ' on' : ''}`}
      data-testid="file-menu-trigger"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(o => !o)}
      data-htip={fileName ? t('fm.tipWithFile', fileName) : t('fm.tipNoFile')}
    >📁 {t('fm.title')}{dirty ? ' •' : ''}</button>

    {open && <div
      role="menu"
      data-testid="file-menu"
      style={{
        position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 120,
        minWidth: 210, padding: 4, background: 'var(--bg2)',
        border: '1px solid var(--b2)', borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,.32)',
      }}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-testid={`file-menu-${item.id}`}
          onClick={() => pick(item.run)}
          style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%',
            padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit',
            background: 'transparent', border: 'none', borderRadius: 5,
            color: 'var(--tx)', cursor: 'pointer', textAlign: 'left',
            marginTop: item.separated ? 4 : 0,
            borderTop: item.separated ? '1px solid var(--b)' : 'none',
            paddingTop: item.separated ? 9 : 7,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.key && <kbd style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)',
            border: '1px solid var(--b2)', borderRadius: 3, padding: '0 4px',
          }}>{keyHint(item.key)}</kbd>}
        </button>
      ))}
    </div>}
  </span>;
}
