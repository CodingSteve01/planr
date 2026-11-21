import { Icon } from '../../shared/Icon.jsx';
import { hasChildren } from '../../../utils/scheduler.js';
import { withKey, ariaChord } from '../../../utils/shortcuts.js';

// `shortcutId` names the ⌘⇧ chord for aria-keyshortcuts, so a screen
// reader announces the key as well as the tooltip shows it.
function toolBtn(label, title, onClick, disabled, icon, testId, shortcutId) {
  return (
    <button
      className="btn btn-sec btn-xs"
      disabled={disabled}
      onClick={onClick}
      data-htip={title}
      data-testid={testId}
      aria-label={label ? undefined : title}
      aria-keyshortcuts={shortcutId ? ariaChord(shortcutId) : undefined}
      style={{
        padding: '2px 7px',
        fontSize: 12,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {icon && <Icon name={icon} size={11} />}
      {label}
    </button>
  );
}

// The contextual action row: acts on the one selected item. Stateless; the
// view decides when it shows and passes the commands in.
export function TreeSelectionBar({
  selBarRef,
  selected,
  multiMove,
  multiSel,
  onFullEdit,
  editorInDialog,
  onInsertAfter,
  onInsertChild,
  onCommand,
  onDelete,
  tree,
  canRun,
  runCommand,
  startEdit,
  startNewSibling,
  startNewChild,
  t,
}) {
  return (
    <div
      ref={selBarRef}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        rowGap: 3,
        gap: 4,
        padding: '4px 10px',
        borderBottom: '1px solid var(--b)',
        background: 'var(--bg3)',
        alignItems: 'center',
        position: 'sticky',
        top: 'var(--tv-bar1-top)',
        zIndex: 11,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>
        {t('tv.selected')}
      </span>
      {multiMove ? (
        <span
          data-testid="tv-moves-selection"
          style={{ fontSize: 12, color: 'var(--ac)', marginRight: 8 }}
          data-htip={t('tv.movesSelectionTip')}
        >
          {t('tv.movesSelection', multiSel.size)}
        </span>
      ) : (
        <>
          <span style={{ fontSize: 12, color: 'var(--tx2)', fontFamily: 'var(--mono)', marginRight: 4 }}>{selected.id}</span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--tx3)',
              marginRight: 8,
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selected.name}
          </span>
        </>
      )}
      {/* Edit & create — the mouse twin of Enter / ⇧Enter. */}
      {toolBtn(t('tv.rename'), withKey(t('tv.renameTip', selected.id), 'rename'), () => startEdit(selected.id), false, 'pencil')}
      {/* With the editor docked as a dialog there is no panel on the right
      to carry the selection — this is the way in. */}
      {onFullEdit &&
        editorInDialog &&
        toolBtn(t('tv.editItem'), t('nm.fullEditTip'), () => onFullEdit(selected), false, 'maximize', 'tv-edit-selected')}
      {onInsertAfter &&
        toolBtn(t('tv.newRow'), withKey(t('tv.newRowTip', selected.id), 'newRow'), () => startNewSibling(selected.id), false, 'plus')}
      {onInsertChild &&
        toolBtn(
          t('tv.newChild'),
          withKey(t('tv.newChildTip', selected.id), 'newChild'),
          () => startNewChild(selected.id),
          false,
          'subtask',
        )}
      {/* Structure — move up / down among the siblings, then indent /
      outdent. Four commands, four buttons, each disabled exactly when
      its command cannot run (canRun is the command's own check). */}
      {onCommand && (
        <>
          <span className="sab-divider" style={{ height: 16, margin: '0 2px' }} />
          {toolBtn(
            t('tv.moveFirst'),
            withKey(t('tv.moveFirstTip', selected.id), 'reorderEnds'),
            () => runCommand('moveFirst'),
            !canRun(selected.id, 'moveFirst'),
            'moveTop',
            'tv-move-first',
          )}
          {toolBtn(
            t('tv.moveUp'),
            withKey(t('tv.moveUpTip', selected.id), 'moveUp'),
            () => runCommand('moveUp'),
            !canRun(selected.id, 'moveUp'),
            'moveUp',
            'tv-move-up',
            'moveUp',
          )}
          {toolBtn(
            t('tv.moveDown'),
            withKey(t('tv.moveDownTip', selected.id), 'moveDown'),
            () => runCommand('moveDown'),
            !canRun(selected.id, 'moveDown'),
            'moveDown',
            'tv-move-down',
            'moveDown',
          )}
          {toolBtn(
            t('tv.moveLast'),
            withKey(t('tv.moveLastTip', selected.id), 'reorderEnds'),
            () => runCommand('moveLast'),
            !canRun(selected.id, 'moveLast'),
            'moveBottom',
            'tv-move-last',
          )}
          <span className="sab-divider" style={{ height: 16, margin: '0 2px' }} />
          {toolBtn(
            '',
            withKey(t('tv.outdentTip', selected.id), 'outdent'),
            () => runCommand('outdent'),
            !canRun(selected.id, 'outdent'),
            'outdent',
            'tv-outdent',
            'outdent',
          )}
          {toolBtn(
            '',
            withKey(t('tv.indentTip', selected.id), 'indent'),
            () => runCommand('indent'),
            !canRun(selected.id, 'indent'),
            'indent',
            'tv-indent',
            'indent',
          )}
        </>
      )}
      <span style={{ flex: 1 }} />
      <button
        className="btn btn-sec btn-xs"
        data-testid="tv-delete-selected"
        onClick={() => onDelete(selected.id)}
        data-htip={withKey(
          hasChildren(tree, selected.id) ? t('tv.deleteSubtreeTip', selected.id) : t('tv.deleteRowTip', selected.id),
          'delete',
        )}
        style={{ padding: '2px 7px', fontSize: 12, color: 'var(--re)', display: 'inline-flex', alignItems: 'center', gap: 5 }}
      >
        <Icon name="trash" size={11} />
        {t('tv.deleteItem')}
      </button>
    </div>
  );
}
