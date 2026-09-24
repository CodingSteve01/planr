import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon.jsx';
import { useT } from '../../i18n.jsx';
import { keyHint } from '../../utils/shortcuts.js';

// The file operations, back on screen.
//
// Phase 3 moved Load / Snapshots / Save as / Export / New into the `/`
// palette and left the topbar with `/` and a settings button. That was right
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
const MENU_WIDTH = 230;

export function FileMenu({ onLoad, onSaveAs, onSnapshots, onExport, onNew, onJiraImport, onBackdate, fileName, dirty }) {
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

  // Measured, not guessed: the trigger's position decides which way the menu
  // opens, and it is re-measured every time it opens because a pane can be
  // resized between two clicks.
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!open) return;
    const box = ref.current?.getBoundingClientRect?.();
    if (!box) return;
    const room = (window.innerWidth || 0) - box.left;
    setFlipped(room < MENU_WIDTH);
  }, [open]);

  // `key` is a shortcuts.js id where one exists, so the menu teaches the
  // keystroke at the control instead of in a separate list.
  const items = [
    { id: 'load', icon: 'folder', label: t('palette.load'), run: onLoad, key: 'open' },
    { id: 'saveAs', icon: 'save', label: t('palette.saveAs'), run: onSaveAs, key: 'saveAs' },
    { id: 'snapshots', icon: 'undo', label: t('palette.snapshots'), run: onSnapshots },
    // Catching up at the end of a sprint on work that finished at its start is
    // an ordinary thing to need, and this sat behind the command palette only.
    ...(onBackdate ? [{ id: 'backdate', icon: 'restart', label: t('bd.command'), run: onBackdate }] : []),
    { id: 'export', icon: 'upload', label: t('palette.export'), run: onExport, key: 'export' },
    ...(onJiraImport ? [{ id: 'jiraImport', icon: 'download', label: t('ji.title'), run: onJiraImport }] : []),
    { id: 'new', icon: 'sparkle', label: t('palette.newProject'), run: onNew, separated: true },
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
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    ><Icon name="folder" size={13} />{t('fm.title')}{dirty ? ' •' : ''}</button>

    {open && <div
      role="menu"
      data-testid="file-menu"
      style={{
        // Anchored to whichever edge has room. In a narrow pane — an Obsidian
        // sidebar, say — a menu pinned to the trigger's left edge ran off the
        // right of the window and its items could not be reached.
        position: 'absolute', top: 'calc(100% + 4px)', zIndex: 120,
        ...(flipped ? { right: 0 } : { left: 0 }),
        minWidth: 210, maxWidth: 'min(280px, calc(100vw - 16px))', padding: 4, background: 'var(--bg2)',
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
          <span style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={item.icon} size={14} />
          </span>
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.key && <kbd style={{
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)',
            border: '1px solid var(--b2)', borderRadius: 3, padding: '0 4px',
          }}>{keyHint(item.key)}</kbd>}
        </button>
      ))}
    </div>}
  </span>;
}
