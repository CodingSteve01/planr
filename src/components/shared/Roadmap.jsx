import { useMemo } from 'react';
import { leafNodes, isLeafNode } from '../../utils/scheduler.js';
import { GT } from '../../constants.js';

const LINE_H = 52;
const STOP_R = 7;
const TRAIN_R = 5;
const PAD_LEFT = 140;
const PAD_RIGHT = 30;
const PAD_TOP = 30;

/**
 * Roadmap — U-Bahn style visualization.
 * Each root item is a "line" (like U1, U2). Level-2 children are stops.
 * A train marker shows progress along each line.
 */
export function Roadmap({ tree, scheduled, goals, stats }) {
  const lvs = useMemo(() => leafNodes(tree), [tree]);

  // Build lines from root items
  const lines = useMemo(() => {
    const roots = tree.filter(r => !r.id.includes('.'));
    return roots.map((root, ri) => {
      // Level-2 children are the "stops"
      const l2 = tree.filter(r => {
        const parts = r.id.split('.');
        return parts.length === 2 && r.id.startsWith(root.id + '.');
      }).sort((a, b) => a.id.localeCompare(b.id));

      const stops = l2.map(item => {
        const children = lvs.filter(l => l.id === item.id || l.id.startsWith(item.id + '.'));
        const done = children.filter(l => l.status === 'done').length;
        const total = children.length;
        const prog = total > 0 ? done / total : 0;
        const allDone = total > 0 && done === total;
        const anyWip = children.some(l => l.status === 'wip');
        return { id: item.id, name: item.name, prog, done, total, allDone, anyWip };
      });

      // Overall line progress
      const allLeaves = lvs.filter(l => l.id.startsWith(root.id + '.'));
      const totalDone = allLeaves.filter(l => l.status === 'done').length;
      const totalAll = allLeaves.length;
      const lineProg = totalAll > 0 ? totalDone / totalAll : 0;

      // Find the "train position" — the fractional index between stops
      // The train is at the last fully-done stop + progress into the current one
      let trainPos = 0;
      for (let i = 0; i < stops.length; i++) {
        if (stops[i].allDone) {
          trainPos = i + 1;
        } else if (stops[i].prog > 0) {
          trainPos = i + stops[i].prog;
          break;
        } else {
          break;
        }
      }

      const typeIcon = GT[root.type] || '●';
      const deadline = root.date ? new Date(root.date) : null;
      const st = stats?.[root.id];
      const endDate = st?._endD || null;
      const atRisk = deadline && endDate && endDate > deadline;

      return {
        id: root.id, name: root.name, type: root.type, typeIcon,
        stops, trainPos, lineProg, deadline, endDate, atRisk,
        totalDone, totalAll,
      };
    }).filter(l => l.stops.length > 0);
  }, [tree, lvs, stats]);

  if (!lines.length) return null;

  // Colors per line (cycle through a palette)
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  const totalH = PAD_TOP + lines.length * LINE_H + 10;
  const maxStops = Math.max(...lines.map(l => l.stops.length), 1);
  const minW = PAD_LEFT + maxStops * 100 + PAD_RIGHT;

  return <div style={{ overflowX: 'auto', marginBottom: 20 }}>
    <svg width={Math.max(minW, 600)} height={totalH} style={{ display: 'block', fontFamily: 'var(--font)' }}>
      {lines.map((line, li) => {
        const y = PAD_TOP + li * LINE_H + LINE_H / 2;
        const col = palette[li % palette.length];
        const stopCount = line.stops.length;
        const trackW = Math.max(minW, 600) - PAD_LEFT - PAD_RIGHT;
        const stopGap = stopCount > 1 ? trackW / (stopCount - 1) : trackW;

        // x position of a stop by index
        const sx = i => PAD_LEFT + (stopCount > 1 ? i * stopGap : trackW / 2);
        // Train x position (fractional)
        const trainX = stopCount > 1
          ? PAD_LEFT + Math.min(line.trainPos, stopCount - 1) * stopGap
          : PAD_LEFT + trackW / 2;

        return <g key={line.id}>
          {/* Line label (left side) */}
          <rect x={4} y={y - 12} width={PAD_LEFT - 12} height={24} rx={4} fill={col} />
          <text x={10} y={y + 1} fontSize={9} fontWeight={700} fill="#fff" dominantBaseline="middle" style={{ fontFamily: 'var(--mono)' }}>{line.id}</text>
          <text x={PAD_LEFT - 14} y={y + 1} fontSize={9} fontWeight={500} fill="#fff" dominantBaseline="middle" textAnchor="end"
            style={{ fontFamily: 'var(--font)' }}>{line.name.length > 14 ? line.name.slice(0, 12) + '…' : line.name}</text>

          {/* Track line (gray background) */}
          <line x1={sx(0)} y1={y} x2={sx(stopCount - 1)} y2={y} stroke="var(--bg4)" strokeWidth={4} strokeLinecap="round" />

          {/* Progress track (colored) */}
          {line.trainPos > 0 && <line x1={sx(0)} y1={y} x2={trainX} y2={y} stroke={col} strokeWidth={4} strokeLinecap="round" />}

          {/* Stops */}
          {line.stops.map((stop, si) => {
            const x = sx(si);
            const done = stop.allDone;
            const active = stop.anyWip || (stop.prog > 0 && !stop.allDone);
            return <g key={stop.id}>
              {/* Stop circle */}
              <circle cx={x} cy={y} r={STOP_R} fill={done ? col : 'var(--bg2)'} stroke={done ? col : active ? col : 'var(--b3)'} strokeWidth={done ? 0 : 2} />
              {done && <text x={x} y={y + 0.5} fontSize={8} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontWeight={700}>✓</text>}
              {!done && stop.prog > 0 && <text x={x} y={y + 0.5} fontSize={6} fill={col} textAnchor="middle" dominantBaseline="middle" fontWeight={700} style={{ fontFamily: 'var(--mono)' }}>{Math.round(stop.prog * 100)}</text>}

              {/* Stop label (above) */}
              <text x={x} y={y - STOP_R - 4} fontSize={8} fill="var(--tx2)" textAnchor="middle" fontWeight={500}
                style={{ fontFamily: 'var(--font)' }}>{stop.name.length > 16 ? stop.name.slice(0, 14) + '…' : stop.name}</text>

              {/* Done count (below) */}
              <text x={x} y={y + STOP_R + 10} fontSize={7} fill="var(--tx3)" textAnchor="middle"
                style={{ fontFamily: 'var(--mono)' }}>{stop.done}/{stop.total}</text>
            </g>;
          })}

          {/* Train marker */}
          {line.trainPos > 0 && line.trainPos < stopCount && <g>
            <circle cx={trainX} cy={y} r={TRAIN_R + 2} fill={col} />
            <circle cx={trainX} cy={y} r={TRAIN_R} fill="#fff" />
            <circle cx={trainX} cy={y} r={2} fill={col} />
          </g>}

          {/* Percentage at end */}
          <text x={sx(stopCount - 1) + 16} y={y + 1} fontSize={9} fill={line.lineProg >= 1 ? 'var(--gr)' : col} dominantBaseline="middle" fontWeight={700}
            style={{ fontFamily: 'var(--mono)' }}>{Math.round(line.lineProg * 100)}%</text>

          {/* AT RISK flag */}
          {line.atRisk && <text x={sx(stopCount - 1) + 16} y={y + 12} fontSize={7} fill="var(--re)" fontWeight={700}>AT RISK</text>}
        </g>;
      })}
    </svg>
  </div>;
}
