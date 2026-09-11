import { useState, useEffect } from 'react';
import { useT } from '../../i18n.jsx';
import { shortcutsByScope } from '../../utils/shortcuts.js';

// The app-wide keyboard reference, one keypress away (`?`).
//
// It owns its own open state and listens for a window event, the same shape
// CommandPalette uses — so a button anywhere can open it without a prop
// being drilled through App.jsx, and there is exactly one answer to "is it
// open".
export const KEYMAP_OPEN_EVENT = 'planr:keymap:open';

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!el.isContentEditable;
}

export function KeyboardMap() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = e => {
      // `?` is Shift+/ on most layouts and its own key on others — accept
      // both, and never while the user is typing into a field (where `?` is
      // just a character).
      if (!open && (e.key === '?' || (e.key === '/' && e.shiftKey)) && !isEditableTarget(document.activeElement)) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (open && e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(KEYMAP_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(KEYMAP_OPEN_EVENT, onOpenEvent);
    };
  }, [open]);

  if (!open) return null;

  const groups = shortcutsByScope().filter(g => g.items.length);

  return <div
    onClick={() => setOpen(false)}
    data-testid="keymap-overlay"
    style={{
      position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
      alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh',
      background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(2px)',
    }}>
    <div
      onClick={e => e.stopPropagation()}
      style={{
        width: 'min(760px, 92vw)', maxHeight: '78vh', overflowY: 'auto',
        background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 10,
        boxShadow: '0 24px 64px rgba(0,0,0,.38)', color: 'var(--tx)',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--b)' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{t('km.title')}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{t('km.closeHint')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 0 }}>
        {groups.map(({ scope, items }) => (
          <div key={scope} style={{ padding: '10px 16px 14px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)', marginBottom: 6 }}>
              {t(`km.scope.${scope}`)}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {items.map(s => (
                  <tr key={s.id}>
                    <td style={{ padding: '3px 0', fontSize: 12, color: 'var(--tx2)', verticalAlign: 'top' }}>{t(s.labelKey)}</td>
                    <td style={{ padding: '3px 0', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      {s.keys.map(k => (
                        <kbd key={k} style={{
                          display: 'inline-block', marginLeft: 4, padding: '1px 6px',
                          fontFamily: 'var(--mono)', fontSize: 11, lineHeight: '16px',
                          background: 'var(--bg3)', border: '1px solid var(--b2)',
                          borderBottomWidth: 2, borderRadius: 4, color: 'var(--tx)',
                        }}>{k}</kbd>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* The glyph legend used to be its own hover-only `?` sitting right next
          to the shortcuts button — two help affordances an inch apart. Same
          question ("what does this mean?"), so: same dialog. */}
      <div style={{ padding: '10px 16px 4px', borderTop: '1px solid var(--b)' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)', marginBottom: 6 }}>
          {t('km.legend')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 12, color: 'var(--tx2)' }}>
          {[
            ['○', t('tv.statusOpen')], ['◐', t('wip')], ['●', t('tv.statusDone')],
            ['⏫', t('tv.prioCrit')], ['▲', t('tv.prioHigh')], ['▬', t('tv.prioMed')], ['▼', t('tv.prioLow')],
            ['⚡', t('km.legendCp')], ['⇄', t('km.legendChain')], ['⋮⋮', t('km.legendDrag')],
          ].map(([glyph, label]) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx)' }}>{glyph}</span>{label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: '8px 16px 12px', fontSize: 11, color: 'var(--tx3)' }}>
        {t('km.footer')}
      </div>
    </div>
  </div>;
}
