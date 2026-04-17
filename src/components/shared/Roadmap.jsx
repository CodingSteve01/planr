import { useMemo } from 'react';
import { leafNodes, isLeafNode } from '../../utils/scheduler.js';

/**
 * Metro-style roadmap. Every non-root item is a station on its root's line.
 * Level-2 items = major stations (bold). Deeper items = minor stations (tick).
 * Names at 45° to avoid overlap. Pure horizontal lines. Wide, scrollable.
 */

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const LINE_W = 5;
const LANE_H = 100; // vertical space per line
const STOP_GAP = 38; // horizontal pixels between stations
const PAD_L = 130;
const PAD_R = 30;
const PAD_T = 14;
const MAJOR_R = 5;
const MINOR_R = 3;

export function Roadmap({ tree, stats }) {
  const lvs = useMemo(() => leafNodes(tree), [tree]);

  const lines = useMemo(() => {
    const roots = tree.filter(r => !r.id.includes('.'));
    return roots.map((root, ri) => {
      // ALL non-root descendants as stations, ordered by ID
      const allItems = tree.filter(r => r.id.startsWith(root.id + '.') && r.id !== root.id)
        .sort((a, b) => a.id.localeCompare(b.id));

      const stations = allItems.map(item => {
        const depth = item.id.split('.').length; // 2 = major, 3+ = minor
        const isLeaf = isLeafNode(tree, item.id);
        const children = lvs.filter(l => l.id === item.id || l.id.startsWith(item.id + '.'));
        const done = children.filter(l => l.status === 'done').length;
        const total = children.length;
        return {
          id: item.id, name: item.name, depth, isLeaf,
          done, total, prog: total ? done / total : 0,
          allDone: total > 0 && done === total,
          major: depth === 2,
        };
      });

      const allCh = lvs.filter(l => l.id.startsWith(root.id + '.'));
      const totalDone = allCh.filter(l => l.status === 'done').length;
      const lineProg = allCh.length > 0 ? totalDone / allCh.length : 0;

      // Train position: fraction of stations that are complete
      let trainIdx = 0;
      for (let i = 0; i < stations.length; i++) {
        if (stations[i].allDone) trainIdx = i + 1;
        else if (stations[i].prog > 0) { trainIdx = i + stations[i].prog; break; }
        else break;
      }

      const deadline = root.date ? new Date(root.date) : null;
      const st = stats?.[root.id];
      const atRisk = deadline && st?._endD && st._endD > deadline;

      return {
        id: root.id, name: root.name, type: root.type,
        col: PALETTE[ri % PALETTE.length],
        stations, trainIdx, lineProg, atRisk,
      };
    }).filter(l => l.stations.length > 0);
  }, [tree, lvs, stats]);

  if (!lines.length) return null;

  const maxStations = Math.max(...lines.map(l => l.stations.length));
  const svgW = PAD_L + maxStations * STOP_GAP + PAD_R + 50;
  const svgH = PAD_T + lines.length * LANE_H + 10;

  return <div style={{ overflowX: 'auto', marginBottom: 20 }}>
    <svg width={svgW} height={svgH} style={{ display: 'block' }}>
      <style>{`
        .rm-name { font: 500 7.5px/1 'Inter', system-ui, sans-serif; fill: var(--tx2); }
        .rm-name-major { font: 600 8.5px/1 'Inter', system-ui, sans-serif; fill: var(--tx); }
        .rm-count { font: 400 6.5px/1 'JetBrains Mono', monospace; fill: var(--tx3); }
        .rm-pct { font: 800 12px/1 'JetBrains Mono', monospace; }
        .rm-id { font: 800 11px/1 'JetBrains Mono', monospace; fill: #fff; }
        .rm-label { font: 600 8.5px/1 'Inter', system-ui, sans-serif; fill: rgba(255,255,255,.9); }
        .rm-risk { font: 700 7px/1 'Inter', system-ui, sans-serif; fill: var(--re); }
      `}</style>

      {lines.map((line, li) => {
        const y = PAD_T + li * LANE_H + LANE_H / 2;
        const n = line.stations.length;
        const sx = si => PAD_L + si * STOP_GAP;
        const lineEnd = sx(n - 1);

        // Train x position
        const ti = Math.min(line.trainIdx, n - 1);
        const trainX = sx(Math.floor(ti)) + (ti - Math.floor(ti)) * STOP_GAP;
        const hasTrain = line.trainIdx > 0 && line.trainIdx < n;

        return <g key={line.id}>
          {/* Track: remaining (thin, dashed) */}
          <line x1={sx(0)} y1={y} x2={lineEnd} y2={y}
            stroke={line.col} strokeWidth={LINE_W} strokeLinecap="round" opacity={0.15} />

          {/* Track: done (solid) */}
          {line.trainIdx > 0 && <line x1={sx(0)} y1={y} x2={Math.min(trainX, lineEnd)} y2={y}
            stroke={line.col} strokeWidth={LINE_W} strokeLinecap="round" />}

          {/* Line label */}
          <rect x={4} y={y - 13} width={PAD_L - 14} height={26} rx={5} fill={line.col} />
          <text x={12} y={y + 1} className="rm-id" dominantBaseline="middle">{line.id}</text>
          <text x={PAD_L - 18} y={y + 1} className="rm-label" dominantBaseline="middle" textAnchor="end">
            {line.name.length > 13 ? line.name.slice(0, 12) + '…' : line.name}
          </text>

          {/* Stations */}
          {line.stations.map((st, si) => {
            const x = sx(si);
            const r = st.major ? MAJOR_R : MINOR_R;
            const above = si % 2 === 0;
            // 45° rotated names
            const nameX = x + 3;
            const nameY = above ? y - r - 4 : y + r + 4;
            const nameAnchor = above ? 'start' : 'start';
            const nameRotate = above ? -45 : 45;

            return <g key={st.id}>
              {/* Station dot */}
              {st.allDone
                ? <circle cx={x} cy={y} r={r} fill={line.col} />
                : <><circle cx={x} cy={y} r={r + 0.5} fill="var(--bg)" />
                    <circle cx={x} cy={y} r={r} fill="var(--bg2)" stroke={st.prog > 0 ? line.col : 'var(--b3)'} strokeWidth={st.major ? 2 : 1.5} /></>}

              {/* Station name (45° rotated) */}
              <text x={nameX} y={nameY}
                className={st.major ? 'rm-name-major' : 'rm-name'}
                transform={`rotate(${nameRotate}, ${nameX}, ${nameY})`}
                textAnchor={nameAnchor}>
                {st.name.length > 22 ? st.name.slice(0, 20) + '…' : st.name}
              </text>

              {/* Progress fraction for major stations */}
              {st.major && !st.allDone && st.total > 0 && <text x={x} y={above ? y + r + 10 : y - r - 5}
                className="rm-count" textAnchor="middle">{st.done}/{st.total}</text>}
            </g>;
          })}

          {/* Train marker */}
          {hasTrain && <g>
            <circle cx={trainX} cy={y} r={MAJOR_R + 3} fill={line.col} opacity={0.2}>
              <animate attributeName="r" values={`${MAJOR_R + 2};${MAJOR_R + 5};${MAJOR_R + 2}`} dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={trainX} cy={y} r={MAJOR_R + 1} fill={line.col} />
            <circle cx={trainX} cy={y} r={MAJOR_R - 2} fill="#fff" />
          </g>}

          {/* End percentage */}
          <text x={lineEnd + 16} y={y - 2} className="rm-pct"
            fill={line.lineProg >= 1 ? 'var(--gr)' : line.col}>{Math.round(line.lineProg * 100)}%</text>
          {line.atRisk && <text x={lineEnd + 16} y={y + 11} className="rm-risk">AT RISK</text>}
        </g>;
      })}
    </svg>
  </div>;
}
