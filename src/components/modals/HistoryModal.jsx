import { useEffect, useMemo, useState } from 'react';
import { formatHistoryBlock, parseHistoryBlock } from '../../utils/history.js';

function inspectHistoryText(text) {
  const badLines = [];
  for (const [idx, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line === 'v1' || line.startsWith('#') || line.startsWith('//')) continue;
    if (!/^\d{4}-\d{2}-\d{2}T\S+\s+\S+\s+\S+=/.test(line)) badLines.push(idx + 1);
  }
  return { events: parseHistoryBlock(text), badLines };
}

export function HistoryModal({ events = [], onClose, onSave }) {
  const [text, setText] = useState(() => formatHistoryBlock(events));
  const parsed = useMemo(() => inspectHistoryText(text), [text]);
  const hasErrors = parsed.badLines.length > 0;

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ width: 'min(920px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>History</h2>
        <p className="helper" style={{ marginTop: -4, marginBottom: 10 }}>
          Edit the planr-history block. Format: ISO timestamp, item id, then key=value pairs such as status=done progress=100 completedAt=2026-05-20.
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          spellCheck={false}
          style={{
            minHeight: 420,
            flex: 1,
            resize: 'vertical',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            lineHeight: 1.45,
            background: 'var(--bg)',
            color: 'var(--tx)',
            border: `1px solid ${hasErrors ? 'var(--re)' : 'var(--b2)'}`,
            borderRadius: 6,
            padding: 10,
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 11, color: hasErrors ? 'var(--re)' : 'var(--tx3)' }}>
          {hasErrors
            ? <span>Invalid event lines: {parsed.badLines.slice(0, 8).join(', ')}{parsed.badLines.length > 8 ? '…' : ''}</span>
            : <span>{parsed.events.length} events parsed</span>}
          <span style={{ marginLeft: 'auto' }}>Saving rewrites the block in canonical format.</span>
        </div>
        <div className="modal-footer">
          <button className="btn btn-sec" onClick={onClose}>Cancel</button>
          <button className="btn btn-pri" disabled={hasErrors} onClick={() => onSave(parsed.events)}>Apply</button>
        </div>
      </div>
    </div>
  );
}
