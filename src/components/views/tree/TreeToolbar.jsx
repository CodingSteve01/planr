import { withKey } from '../../../utils/shortcuts.js';
import { KEYMAP_OPEN_EVENT } from '../../../utils/events.js';

// The strip above the table: collapse/expand (all, or just the selection),
// the keymap button and the item counter. Stateless; the view passes everything in.
export function TreeToolbar({ toolbarRef, collapseAll, expandAll, hasSelection, multiSel, shownCount, totalCount, t }) {
  return (
    <div
      ref={toolbarRef}
      style={{
        display: 'flex',
        gap: 6,
        padding: '6px 10px',
        borderBottom: '1px solid var(--b)',
        background: 'var(--bg2)',
        alignItems: 'center',
        position: 'sticky',
        top: 'var(--tv-bar0-top)',
        zIndex: 12,
      }}
    >
      <button
        className="btn btn-sec btn-xs"
        onClick={collapseAll}
        data-htip={withKey(hasSelection ? t('tv.collapseSelectionTitle', multiSel.size) : t('tv.collapseAll'), 'collapseAll')}
      >
        {hasSelection ? t('tv.collapseSelection', multiSel.size) : t('tv.collapseAll')}
      </button>
      <button
        className="btn btn-sec btn-xs"
        onClick={expandAll}
        data-htip={withKey(hasSelection ? t('tv.expandSelectionTitle', multiSel.size) : t('tv.expandAll'), 'expandAll')}
      >
        {hasSelection ? t('tv.expandSelection', multiSel.size) : t('tv.expandAll')}
      </button>
      {/* One help affordance, not two. The shortcuts used to be printed above
          the table as a dense line of glyphs, and the symbol legend was a
          separate hover-only `?` beside it — same question, two places. Both
          now open the same dialog, under the key that opens it. */}
      <button
        className="btn btn-sec btn-xs"
        data-testid="tree-keymap-btn"
        onClick={() => window.dispatchEvent(new Event(KEYMAP_OPEN_EVENT))}
        data-htip={withKey(t('km.title'), 'keymap')}
        style={{ padding: '2px 8px', fontSize: 12, marginLeft: 4 }}
      >
        ?
      </button>
      {/* Diff picker lives in the App-level sub-toolbar so it stays
          available next to the root/team/person filters. Toggling the
          "Only changed" checkbox there reaches this view via the
          `onlyChanged` prop. */}
      <span style={{ fontSize: 11, color: 'var(--tx3)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>
        {shownCount}/{totalCount} {t('tv.items')}
      </span>
    </div>
  );
}
