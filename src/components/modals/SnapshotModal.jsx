import { useEffect, useState } from 'react';

// Lists rolling JSON snapshots from localStorage so the user can recover from
// a corrupted on-disk markdown file. Snapshots are written by App.jsx on
// every successful save (idle write path); see SNAPSHOT_KEY.

const SNAPSHOT_KEY = 'planr_v2_snapshots';

function loadSnapshots() {
  try {
    const arr = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function fmtTs(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function summarize(data) {
  const parts = [];
  if (Array.isArray(data?.tree)) parts.push(`${data.tree.length} items`);
  if (Array.isArray(data?.members)) parts.push(`${data.members.length} members`);
  if (Array.isArray(data?.teams)) parts.push(`${data.teams.length} teams`);
  if (Array.isArray(data?.vacations)) parts.push(`${data.vacations.length} vacations`);
  return parts.join(' · ');
}

export function SnapshotModal({ onClose, onRestore, onExportJson }) {
  const [snaps, setSnaps] = useState(() => loadSnapshots());

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const refresh = () => setSnaps(loadSnapshots());
  const wipe = () => {
    if (!confirm(`Delete all ${snaps.length} snapshots? This cannot be undone.`)) return;
    try { localStorage.removeItem(SNAPSHOT_KEY); } catch { /* ignore */ }
    refresh();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(640px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>↶ Snapshots</h2>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: -4, marginBottom: 12 }}>
          Last {snaps.length} saves are kept locally as JSON. Pick one to restore the whole project, or download as a JSON backup file.
        </p>

        {snaps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)', fontSize: 12 }}>
            No snapshots yet. They are written automatically on every save.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', flex: 1 }}>
            {snaps.map((snap, i) => (
              <li key={snap.ts + ':' + i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderBottom: '1px solid var(--b)',
                fontSize: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--tx)' }}>
                    {fmtTs(snap.ts)}
                    {i === 0 && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--gr)', color: '#fff' }}>LATEST</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
                    {summarize(snap.data)}
                  </div>
                </div>
                <button className="btn btn-sec btn-xs"
                  data-htip="Download this snapshot as a .json file"
                  onClick={() => onExportJson?.(snap)}>↓ JSON</button>
                <button className="btn btn-pri btn-xs"
                  data-htip="Replace current project with this snapshot"
                  onClick={() => onRestore?.(snap)}>↶ Restore</button>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-footer">
          {snaps.length > 0 && (
            <button className="btn btn-danger btn-sm" onClick={wipe}>Clear all</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
