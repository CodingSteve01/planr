import { Icon } from '../shared/Icon.jsx';
import { isEmbedded } from '../../utils/embedHost.js';
import { withKey } from '../../utils/shortcuts.js';

export function TopBarFile({
  SAVE_DEBOUNCE_MS,
  _t,
  autoSave,
  fileName,
  fileSynced,
  fileWriteOk,
  hosted,
  lastSavedAt,
  meta,
  saveCountdown,
  saveToFile,
  saved,
  saving,
  setAutoSave,
}) {
  return (
    <>
      {/* Not a button. It was "New project" — the same command the / palette
          carries, on a target nobody aims at deliberately, discarding the
          whole plan behind one confirm. ↔ duplicate of palette.newProject. */}
      {/* A host already says where you are — the Obsidian tab is labelled
          with the plan's name. A wordmark on top of that is decoration. */}
      {!isEmbedded() && (
        <>
          <span className="logo">
            Planr<span className="logo-dot">.</span>
          </span>
          <div className="vsep" />
        </>
      )}
      {/* One shrinkable group for everything file/save related. The bar used
          to wrap, and the save status changes its own text constantly
          ("saving…" → "all saved · 14:32" → "unsaved · saving in 3s"), so on
          a narrow window the whole header kept re-sorting itself while you
          worked. Now this group absorbs the width instead: it truncates, the
          controls on the right never move. */}
      <span className="topbar-file">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--tx2)',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {meta.name || 'Untitled'}
          </span>
          <span
            className={`save-dot ${fileName && !fileSynced ? 'dirty' : saved ? 'clean' : 'dirty'}`}
            data-htip={
              !saved ? _t('app.save.dotUnsaved') : fileName && !fileSynced ? _t('app.save.dotLocalOnly') : _t('app.save.dotAllSaved')
            }
          />
        </span>
        {fileName && (
          <span style={{ fontSize: 12, color: 'var(--tx2)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* A host names the tab after the file already. Repeating it here
            spends the narrowest part of the bar saying the same thing twice. */}
            {!hosted && fileName}
            {(!saved || !fileWriteOk || !fileSynced) && (
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => saveToFile()}
                data-htip={withKey(_t('app.save.saveNowTip', SAVE_DEBOUNCE_MS / 1000), 'save')}
                style={{ padding: '2px 5px', display: 'inline-flex', alignItems: 'center' }}
              >
                <Icon name="save" size={13} />
              </button>
            )}
          </span>
        )}
        <label
          data-htip={autoSave ? _t('app.save.autoToggleOn', SAVE_DEBOUNCE_MS / 1000) : _t('app.save.autoToggleOff')}
          className="toggle"
        >
          <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} />
          <span className="slider" />
        </label>
        {(() => {
          // One status pill that summarises everything: file mounted? auto on? changes pending? countdown?
          let text,
            color,
            tip,
            clickable = false;
          if (!fileName) {
            text = 'no file mounted';
            color = 'var(--tx3)';
            tip = _t('app.save.pillNoFile');
          } else if (!fileWriteOk) {
            text = 'click to re-mount';
            color = 'var(--am)';
            clickable = true;
            tip = _t('app.save.pillPermissionLost');
          } else if (!autoSave) {
            text = lastSavedAt
              ? `auto-save off · last saved ${lastSavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
              : 'auto-save off';
            color = 'var(--tx3)';
            tip = _t('app.save.pillAutoOff');
          } else if (saving) {
            text = 'saving…';
            color = 'var(--ac)';
            tip = _t('app.save.pillSaving');
          } else if (fileSynced) {
            text = lastSavedAt
              ? `all saved · ${lastSavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
              : 'all saved';
            color = 'var(--gr)';
            tip = _t('app.save.pillAllSaved');
          } else {
            text = saveCountdown > 0 ? `unsaved · saving in ${saveCountdown}s` : 'saving…';
            color = 'var(--am)';
            tip = _t('app.save.pillPending', SAVE_DEBOUNCE_MS / 1000);
          }
          return (
            <span
              className="topbar-status"
              style={{
                fontSize: 11,
                color,
                cursor: clickable ? 'pointer' : 'default',
                userSelect: 'none',
                fontFamily: 'var(--mono)',
              }}
              data-htip={tip}
              onClick={() => {
                if (clickable) saveToFile(true);
              }}
            >
              {text}
            </span>
          );
        })()}
      </span>
    </>
  );
}
