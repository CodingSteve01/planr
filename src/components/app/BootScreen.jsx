// The two screens shown before a plan is loaded and the app has anything to
// edit: the short wait while the last project is restored, and the prompt
// that asks for file access again after a reload.
import { Icon } from '../shared/Icon.jsx';

export function BootScreen() {
  return (
    <div className="onboard">
      <div className="onboard-card fade" style={{ padding: 32, width: 360 }}>
        <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>
          Planr<span style={{ color: 'var(--ac)' }}>.</span>
        </div>
        <div className="onboard-sub" style={{ marginBottom: 0 }}>
          Restoring project context...
        </div>
      </div>
    </div>
  );
}

export function RestoreMountScreen({ fileName, onRestore, onForget }) {
  return (
    <div className="onboard">
      <div className="onboard-card fade" style={{ padding: 32, width: 420, textAlign: 'center' }}>
        <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>
          Planr<span style={{ color: 'var(--ac)' }}>.</span>
        </div>
        <div className="onboard-sub" style={{ marginBottom: 22 }}>
          Restore mounted project
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
          Browser security requires you to grant file access again after a page reload.
        </p>
        <div className="ob-actions">
          <button className="ob-btn ob-pri" onClick={onRestore}>
            Reactivate file access
          </button>
          <button
            className="ob-btn ob-sec"
            onClick={async () => {
              await onForget();
            }}
          >
            Discard mount
          </button>
        </div>
      </div>
    </div>
  );
}
