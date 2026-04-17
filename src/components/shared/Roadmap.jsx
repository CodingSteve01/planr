import { useMemo } from 'react';
import { leafNodes, isLeafNode } from '../../utils/scheduler.js';

/**
 * Metro roadmap with turns. Each line starts at the top, runs down,
 * then turns right (90° rounded corner), runs horizontal, turns down again, etc.
 * Creates a zig-zag route like real metro lines that aren't straight.
 * Stations ordered by scheduler. Only major (level-2) labeled.
 */

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export function Roadmap({ tree, scheduled, stats }) {
  const lvs = useMemo(() => leafNodes(tree), [tree]);
  const sMap = useMemo(() => scheduled ? Object.fromEntries(scheduled.map(s => [s.id, s])) : {}, [scheduled]);

  const lines = useMemo(() => {
    const roots = tree.filter(r => !r.id.includes('.'));
    return roots.map((root, ri) => {
      const descendants = tree.filter(r => r.id.startsWith(root.id + '.') && r.id !== root.id);
      const stations = descendants.map(item => {
        const depth = item.id.split('.').length;
        const children = lvs.filter(l => l.id === item.id || l.id.startsWith(item.id + '.'));
        const done = children.filter(l => l.status === 'done').length;
        const total = children.length;
        let earliest = null;
        children.forEach(l => { const s = sMap[l.id]; if (s?.startD && (!earliest || s.startD < earliest)) earliest = s.startD; });
        return { id: item.id, name: item.name, depth, done, total, prog: total ? done / total : 0, allDone: total > 0 && done === total, major: depth === 2, earliestStart: earliest };
      }).sort((a, b) => {
        if (a.earliestStart && b.earliestStart) return a.earliestStart - b.earliestStart;
        if (a.earliestStart) return -1;
        if (b.earliestStart) return 1;
        return a.id.localeCompare(b.id);
      });

      const allCh = lvs.filter(l => l.id.startsWith(root.id + '.'));
      const totalDone = allCh.filter(l => l.status === 'done').length;
      const lineProg = allCh.length > 0 ? totalDone / allCh.length : 0;
      let trainIdx = 0;
      for (let i = 0; i < stations.length; i++) {
        if (stations[i].allDone) trainIdx = i + 1;
        else if (stations[i].prog > 0) { trainIdx = i + stations[i].prog; break; }
        else break;
      }
      const st = stats?.[root.id];
      const atRisk = root.date && st?._endD && st._endD > new Date(root.date);
      return { id: root.id, name: root.name, type: root.type, col: PALETTE[ri % PALETTE.length], stations, trainIdx, lineProg, atRisk };
    }).filter(l => l.stations.length > 0);
  }, [tree, lvs, sMap, stats]);

  if (!lines.length) return null;

  // ── Route each line as a zig-zag path ──
  // Segments alternate: vertical (down) and horizontal (right).
  // Each segment holds ~SEG_LEN stations before turning.
  const SEG_LEN = 5; // stations per segment before a turn
  const GAP = 28; // pixels between stations along the segment
  const TURN_R = 14; // corner radius
  const LINE_W = 5;
  const MAJ_R = 5;
  const MIN_R = 2.5;
  const PAD = 30;
  const LABEL_W = 120;
  const LABEL_H = 28;
  const COL_W = 180; // horizontal space per line
  const NAME_OFF = 10; // label offset from station dot

  // For each line, compute station coordinates along a zig-zag route
  const routedLines = useMemo(() => {
    return lines.map((line, li) => {
      const baseX = PAD + li * COL_W + COL_W / 2;
      const startY = PAD + LABEL_H + 16;

      // Build segments: alternate V (down) and H (right)
      const points = [];
      let x = baseX, y = startY;
      let dir = 'V'; // V = vertical (down), H = horizontal (right)
      let segCount = 0;
      const hDir = li % 2 === 0 ? 1 : -1; // alternate left/right for variety

      line.stations.forEach((st, si) => {
        points.push({ x, y, station: st, si });

        segCount++;
        const nextIsLast = si === line.stations.length - 1;

        if (!nextIsLast && segCount >= SEG_LEN) {
          // Turn
          if (dir === 'V') {
            // Add corner point, switch to H
            y += TURN_R;
            dir = 'H';
          } else {
            // Add corner point, switch to V
            x += TURN_R * hDir;
            dir = 'V';
          }
          segCount = 0;
        } else if (!nextIsLast) {
          // Continue in same direction
          if (dir === 'V') y += GAP;
          else x += GAP * hDir;
        }
      });

      return { ...line, points, li };
    });
  }, [lines]);

  // Compute SVG bounds
  const allPts = routedLines.flatMap(l => l.points);
  const minX = Math.min(...allPts.map(p => p.x)) - PAD - 40;
  const maxX = Math.max(...allPts.map(p => p.x)) + PAD + 100;
  const maxY = Math.max(...allPts.map(p => p.y)) + PAD + 40;
  const svgW = maxX - minX;
  const svgH = maxY;

  // Build SVG path through points with rounded corners
  const buildPath = (points) => {
    if (points.length < 2) return points.length ? `M${points[0].x},${points[0].y}` : '';
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L${points[i].x},${points[i].y}`;
    }
    return d;
  };

  // Split path at train index
  const splitPath = (rl) => {
    const pts = rl.points;
    const n = pts.length;
    if (n === 0) return { done: '', rem: '', trainPt: null };
    const full = buildPath(pts);
    if (rl.trainIdx <= 0) return { done: '', rem: full, trainPt: null };
    if (rl.trainIdx >= n) return { done: full, rem: '', trainPt: null };

    const ti = Math.min(rl.trainIdx, n - 1);
    const fi = Math.floor(ti);
    const frac = ti - fi;
    const p1 = pts[fi];
    const p2 = fi + 1 < n ? pts[fi + 1] : p1;
    const tp = { x: p1.x + (p2.x - p1.x) * frac, y: p1.y + (p2.y - p1.y) * frac };

    const donePts = [...pts.slice(0, fi + 1), { x: tp.x, y: tp.y }];
    const remPts = [{ x: tp.x, y: tp.y }, ...pts.slice(fi + 1)];
    return { done: buildPath(donePts), rem: buildPath(remPts), trainPt: tp };
  };

  return <div style={{ overflowX: 'auto', overflowY: 'auto', marginBottom: 20 }}>
    <svg width={svgW} height={svgH} viewBox={`${minX} 0 ${svgW} ${svgH}`} style={{ display: 'block' }}>
      <style>{`
        .m-name{font:500 8px/1 'Inter',system-ui,sans-serif;fill:var(--tx)}
        .m-done{font:500 8px/1 'Inter',system-ui,sans-serif;fill:var(--tx3);text-decoration:line-through}
        .m-cnt{font:400 7px/1 'JetBrains Mono',monospace;fill:var(--tx3)}
        .m-pct{font:800 13px/1 'JetBrains Mono',monospace}
        .m-id{font:800 10px/1 'JetBrains Mono',monospace;fill:#fff}
        .m-lbl{font:600 7.5px/1 'Inter',system-ui,sans-serif;fill:rgba(255,255,255,.9)}
      `}</style>

      {routedLines.map(rl => {
        const { done, rem, trainPt } = splitPath(rl);
        const pts = rl.points;
        const lastPt = pts[pts.length - 1];

        return <g key={rl.id}>
          {/* Track */}
          {rem && <path d={rem} stroke={rl.col} strokeWidth={LINE_W} fill="none" opacity={0.15} strokeLinecap="round" strokeLinejoin="round" />}
          {done && <path d={done} stroke={rl.col} strokeWidth={LINE_W} fill="none" strokeLinecap="round" strokeLinejoin="round" />}

          {/* Label */}
          {(() => {
            const lx = pts[0]?.x || PAD;
            return <>
              <rect x={lx - LABEL_W / 2} y={PAD - LABEL_H - 4} width={LABEL_W} height={LABEL_H} rx={5} fill={rl.col} />
              <text x={lx - LABEL_W / 2 + 8} y={PAD - LABEL_H / 2 - 6} className="m-id" dominantBaseline="middle">{rl.id}</text>
              <text x={lx - LABEL_W / 2 + 8} y={PAD - LABEL_H / 2 + 5} className="m-lbl" dominantBaseline="middle">
                {rl.name.length > 16 ? rl.name.slice(0, 15) + '…' : rl.name}
              </text>
            </>;
          })()}

          {/* Stations */}
          {pts.map((pt, pi) => {
            const st = pt.station;
            const r = st.major ? MAJ_R : MIN_R;
            return <g key={st.id}>
              {st.allDone
                ? <circle cx={pt.x} cy={pt.y} r={r} fill={rl.col} />
                : <><circle cx={pt.x} cy={pt.y} r={r + 0.5} fill="var(--bg)" /><circle cx={pt.x} cy={pt.y} r={r} fill="var(--bg2)" stroke={st.prog > 0 ? rl.col : 'var(--b3)'} strokeWidth={st.major ? 2 : 1.2} /></>}
              {st.major && <text x={pt.x + NAME_OFF} y={pt.y + 1} className={st.allDone ? 'm-done' : 'm-name'} dominantBaseline="middle">
                {st.name.length > 20 ? st.name.slice(0, 19) + '…' : st.name}
              </text>}
              {st.major && st.total > 0 && <text x={pt.x + NAME_OFF} y={pt.y + 10} className="m-cnt">{st.done}/{st.total}</text>}
            </g>;
          })}

          {/* Train */}
          {trainPt && <g>
            <circle cx={trainPt.x} cy={trainPt.y} r={MAJ_R + 3} fill={rl.col} opacity={0.2}>
              <animate attributeName="r" values={`${MAJ_R + 2};${MAJ_R + 5};${MAJ_R + 2}`} dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={trainPt.x} cy={trainPt.y} r={MAJ_R + 1} fill={rl.col} />
            <circle cx={trainPt.x} cy={trainPt.y} r={MAJ_R - 2} fill="#fff" />
          </g>}

          {/* End pct */}
          {lastPt && <>
            <text x={lastPt.x} y={lastPt.y + 24} className="m-pct" textAnchor="middle" fill={rl.lineProg >= 1 ? 'var(--gr)' : rl.col}>
              {Math.round(rl.lineProg * 100)}%
            </text>
            {rl.atRisk && <text x={lastPt.x} y={lastPt.y + 37} textAnchor="middle" style={{ font: '700 7px Inter', fill: 'var(--re)' }}>AT RISK</text>}
          </>}
        </g>;
      })}
    </svg>
  </div>;
}
