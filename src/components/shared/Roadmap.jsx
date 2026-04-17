import { useMemo } from 'react';
import { leafNodes, re } from '../../utils/scheduler.js';
import { iso, diffDays } from '../../utils/date.js';
import { GT } from '../../constants.js';

/**
 * Roadmap "bus line" — horizontal milestone timeline.
 * Shows root items as stops, colored by type, with progress and a "bus" marker.
 */
export function Roadmap({ tree, scheduled, goals, stats }) {
  const now = new Date();
  const lvs = useMemo(() => leafNodes(tree), [tree]);

  // Build stops from root items, sorted by projected end date
  const stops = useMemo(() => {
    const roots = tree.filter(r => !r.id.includes('.'));
    return roots.map(r => {
      const st = stats?.[r.id];
      const children = lvs.filter(l => l.id.startsWith(r.id + '.'));
      const done = children.filter(l => l.status === 'done').length;
      const total = children.length;
      const prog = total > 0 ? Math.round(done / total * 100) : 0;
      const endDate = st?._endD || null;
      const deadline = r.date ? new Date(r.date) : null;
      const atRisk = deadline && endDate && endDate > deadline;
      return { id: r.id, name: r.name, type: r.type, endDate, deadline, prog, done, total, atRisk };
    }).sort((a, b) => {
      // Done items first, then by end date
      if (a.prog === 100 && b.prog !== 100) return -1;
      if (b.prog === 100 && a.prog !== 100) return 1;
      const aD = a.endDate || a.deadline || new Date('2099-01-01');
      const bD = b.endDate || b.deadline || new Date('2099-01-01');
      return aD - bD;
    });
  }, [tree, lvs, stats]);

  if (!stops.length) return null;

  const typeColor = { goal: 'var(--ac)', painpoint: 'var(--am)', deadline: 'var(--re)' };
  const typeIcon = { goal: '🎯', painpoint: '⚡', deadline: '⏰' };

  return <div style={{ marginBottom: 20 }}>
    {/* The bus line */}
    <div style={{ position: 'relative', padding: '0 20px' }}>
      {/* Horizontal line */}
      <div style={{ position: 'absolute', top: 20, left: 20, right: 20, height: 3, background: 'var(--bg4)', borderRadius: 2, zIndex: 0 }} />
      {/* Progress fill */}
      {(() => {
        const totalProg = stops.length > 0 ? stops.reduce((s, st) => s + st.prog, 0) / stops.length : 0;
        return <div style={{ position: 'absolute', top: 20, left: 20, width: `${Math.max(totalProg, 2)}%`, height: 3, background: 'var(--gr)', borderRadius: 2, zIndex: 1, transition: 'width .3s' }} />;
      })()}

      {/* Stops */}
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
        {stops.map((stop, i) => {
          const col = stop.prog === 100 ? 'var(--gr)' : stop.atRisk ? 'var(--re)' : typeColor[stop.type] || 'var(--tx3)';
          const icon = stop.prog === 100 ? '✓' : typeIcon[stop.type] || '●';
          return <div key={stop.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
            {/* Stop marker */}
            <div style={{
              width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: stop.prog === 100 ? 'var(--gr)' : 'var(--bg2)',
              border: `2px solid ${col}`,
              fontSize: 10, color: stop.prog === 100 ? '#fff' : col,
              fontWeight: 700, flexShrink: 0,
            }}>{stop.prog === 100 ? '✓' : stop.prog > 0 ? `${stop.prog}` : icon}</div>
            {/* Label */}
            <div style={{ fontSize: 9, fontWeight: 600, color: col, marginTop: 4, textAlign: 'center', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stop.name}</div>
            {/* Date + progress */}
            <div style={{ fontSize: 8, color: 'var(--tx3)', fontFamily: 'var(--mono)', textAlign: 'center' }}>
              {stop.deadline ? iso(stop.deadline) : stop.endDate ? `→ ${iso(stop.endDate)}` : ''}
            </div>
            <div style={{ fontSize: 8, color: 'var(--tx3)' }}>{stop.done}/{stop.total}</div>
            {stop.atRisk && <div style={{ fontSize: 7, color: 'var(--re)', fontWeight: 700 }}>AT RISK</div>}
          </div>;
        })}
      </div>
    </div>
  </div>;
}
