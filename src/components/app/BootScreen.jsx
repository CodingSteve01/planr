// The two screens shown before a plan is loaded and the app has anything to
// edit: the short wait while the last project is restored, and the prompt
// that asks for file access again after a reload.
import { useState } from 'react';
import { useT } from '../../i18n.jsx';
import { Icon } from '../shared/Icon.jsx';

export function BootScreen() {
  const { t } = useT();
  return (
    <div className="onboard">
      <div className="onboard-card fade" style={{ padding: 32, width: 360 }}>
        <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>
          Planr<span style={{ color: 'var(--ac)' }}>.</span>
        </div>
        <div className="onboard-sub" style={{ marginBottom: 0 }}>
          {t('boot.restoring')}
        </div>
      </div>
    </div>
  );
}

// `hosted`: the file comes from the host (the Obsidian plugin), not from a
// browser handle. There is no access to grant again and no mount to discard;
// the screen only shows up when the host's file was too slow to arrive.
export function RestoreMountScreen({ fileName, onRestore, onForget, hosted = false }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  // One read at a time. `onRestore` answers `{ error }` when the file could
  // not be read: 'timeout' is worth another try, 'read' names the cause.
  const reactivate = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const result = await onRestore();
      if (result && result.error) setFailed(result);
    } catch (e) {
      setFailed({ error: 'read', detail: String(e?.message || e) });
    }
    setBusy(false);
  };
  const failure = failed && (failed.error === 'timeout' ? t('boot.readFailed') : t('boot.readError', failed.detail));
  return (
    <div className="onboard">
      <div className="onboard-card fade" style={{ padding: 32, width: 420, textAlign: 'center' }}>
        <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>
          Planr<span style={{ color: 'var(--ac)' }}>.</span>
        </div>
        <div className="onboard-sub" style={{ marginBottom: 22 }}>
          {t('boot.restoreTitle')}
        </div>
        <div
          style={{
            background: 'var(--bg3)',
            border: '1px solid var(--b2)',
            borderRadius: 'var(--r)',
            padding: 12,
            marginBottom: 18,
            fontSize: 12,
            fontFamily: 'var(--mono)',
            color: 'var(--tx2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <Icon name="doc" size={14} />
          {fileName}
        </div>
        <p className="helper" style={{ marginBottom: 18, fontSize: 12 }}>
          {hosted ? t('boot.hostedSlow') : t('boot.grantAgain')}
        </p>
        {failure && (
          <p role="alert" className="helper" style={{ marginBottom: 18, fontSize: 12, color: 'var(--re)' }}>
            {failure}
          </p>
        )}
        <div className="ob-actions">
          <button className="ob-btn ob-pri" onClick={reactivate} disabled={busy} aria-busy={busy}>
            {busy ? t('boot.reading') : hosted ? t('boot.retry') : t('boot.reactivate')}
          </button>
          {!hosted && (
            <button
              className="ob-btn ob-sec"
              onClick={async () => {
                await onForget();
              }}
            >
              {t('boot.discard')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
