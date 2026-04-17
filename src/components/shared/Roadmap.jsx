import { useMemo } from 'react';

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const ROOT_PAD_X = 28;
const ROOT_PAD_Y = 16;
const ROOT_GAP_X = 88;

const HEADER_Y = 8;
const HEADER_W = 136;
const HEADER_H = 32;
const ROOT_ANCHOR_Y = 76;
const ROOT_STATION_GAP_Y = 40;

const TRUNK_GAP_Y = 84;
const TRUNK_GAP_MIN_Y = 62;
const BRANCH_GAP_Y = 58;
const BRANCH_GAP_MIN_Y = 42;
const BRANCH_STEP_X = 88;

const LINE_W = 5;
const MAJOR_R = 5.5;
const MINOR_R = 3.25;
const MAJOR_LABEL_W = 154;
const MINOR_LABEL_W = 124;
const LABEL_OFF_X = 12;

const parentId = id => id.split('.').slice(0, -1).join('.');
const depthOf = id => id.split('.').length;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const truncate = (s, n) => !s ? '' : s.length > n ? `${s.slice(0, n - 1)}…` : s;

function compactGap(count, base, min) {
  return Math.max(min, base - Math.max(0, count - 6) * 4);
}

function polylinePath(points) {
  if (!points.length) return '';
  return points.map((pt, i) => `${i ? 'L' : 'M'}${pt.x},${pt.y}`).join(' ');
}

function compareNodes(a, b, meta) {
  const ma = meta[a.id];
  const mb = meta[b.id];
  if (ma?.earliestStart && mb?.earliestStart) {
    if (+ma.earliestStart !== +mb.earliestStart) return ma.earliestStart - mb.earliestStart;
  } else if (ma?.earliestStart) return -1;
  else if (mb?.earliestStart) return 1;
  if (ma?.latestEnd && mb?.latestEnd) {
    if (+ma.latestEnd !== +mb.latestEnd) return ma.latestEnd - mb.latestEnd;
  } else if (ma?.latestEnd) return -1;
  else if (mb?.latestEnd) return 1;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

function progressIndex(stations) {
  let idx = 0;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    if (st.allDone) idx = i + 1;
    else if (st.prog > 0) return i + st.prog;
    else return idx;
  }
  return idx;
}

function progressPoint(anchor, stations, idx) {
  if (!stations.length || idx <= 0) return null;
  if (idx >= stations.length) {
    const last = stations[stations.length - 1];
    return { x: anchor.x, y: last.y };
  }
  const fi = Math.floor(idx);
  const frac = idx - fi;
  if (fi === 0) {
    const first = stations[0];
    return { x: anchor.x, y: anchor.y + (first.y - anchor.y) * frac };
  }
  const start = stations[fi - 1];
  const end = stations[fi];
  return { x: start.x, y: start.y + (end.y - start.y) * frac };
}

export function Roadmap({ tree, scheduled, stats }) {
  const nodeMap = useMemo(() => Object.fromEntries(tree.map(node => [node.id, node])), [tree]);
  const childMap = useMemo(() => {
    const map = {};
    tree.forEach(node => {
      const pid = parentId(node.id);
      if (!map[pid]) map[pid] = [];
      map[pid].push(node);
    });
    return map;
  }, [tree]);
  const schedMap = useMemo(() => scheduled ? Object.fromEntries(scheduled.map(item => [item.id, item])) : {}, [scheduled]);

  const meta = useMemo(() => {
    const ordered = [...tree].sort((a, b) => depthOf(b.id) - depthOf(a.id) || b.id.localeCompare(a.id));
    const result = {};
    const leafIdsById = {};

    ordered.forEach(node => {
      const children = childMap[node.id] || [];
      const leafIds = children.length
        ? children.flatMap(child => leafIdsById[child.id] || [])
        : [node.id];

      leafIdsById[node.id] = leafIds;

      let done = 0;
      let earliestStart = null;
      let latestEnd = null;

      leafIds.forEach(id => {
        if (nodeMap[id]?.status === 'done') done++;
        const sched = schedMap[id];
        if (sched?.startD && (!earliestStart || sched.startD < earliestStart)) earliestStart = sched.startD;
        if (sched?.endD && (!latestEnd || sched.endD > latestEnd)) latestEnd = sched.endD;
      });

      const progressPct = stats?.[node.id]?._progress ?? (leafIds.length ? Math.round(done / leafIds.length * 100) : 0);
      const branchDepth = children.length ? 1 + Math.max(...children.map(child => result[child.id]?.branchDepth || 0)) : 0;

      result[node.id] = {
        depth: depthOf(node.id),
        total: leafIds.length,
        done,
        prog: clamp(progressPct / 100, 0, 1),
        allDone: leafIds.length > 0 && done === leafIds.length,
        earliestStart,
        latestEnd,
        branchDepth,
        hasChildren: children.length > 0,
      };
    });

    return result;
  }, [tree, childMap, nodeMap, schedMap, stats]);

  const orderedChildrenMap = useMemo(() => {
    const map = {};
    Object.entries(childMap).forEach(([pid, items]) => {
      map[pid] = [...items].sort((a, b) => compareNodes(a, b, meta));
    });
    return map;
  }, [childMap, meta]);

  const layout = useMemo(() => {
    const roots = (orderedChildrenMap[''] || []).filter(node => !node.id.includes('.'));
    if (!roots.length) return null;

    const createStation = (node, x, y, side, level) => {
      const info = meta[node.id] || {};
      return {
        id: node.id,
        name: node.name,
        x,
        y,
        side,
        labelSide: side || 1,
        level,
        major: level === 0,
        prog: info.prog || 0,
        done: info.done || 0,
        total: info.total || 0,
        allDone: !!info.allDone,
        hasChildren: !!info.hasChildren,
      };
    };

    const assignSides = (children, bias) => {
      let leftWeight = 0;
      let rightWeight = 0;
      const sides = {};

      children.forEach((child, index) => {
        const weight = Math.max(1, meta[child.id]?.branchDepth || 0);
        let side;
        if (index === 0) side = bias;
        else if (leftWeight <= rightWeight) side = -1;
        else side = 1;

        sides[child.id] = side;
        if (side < 0) leftWeight += weight;
        else rightWeight += weight;
      });

      return sides;
    };

    const layoutLane = (parentAnchor, children, laneX, startY, side, level) => {
      if (!children.length) return { stations: [], lanes: [], bottomY: parentAnchor.y };

      const localGapY = compactGap(children.length, level === 0 ? TRUNK_GAP_Y : BRANCH_GAP_Y, level === 0 ? TRUNK_GAP_MIN_Y : BRANCH_GAP_MIN_Y);
      const localStations = [];
      const allStations = [];
      const lanes = [];
      let y = startY;
      let bottomY = parentAnchor.y;

      children.forEach(child => {
        const station = createStation(child, laneX, y, side, level);
        localStations.push(station);
        allStations.push(station);

        let childBottom = station.y;
        const nestedChildren = orderedChildrenMap[child.id] || [];
        if (nestedChildren.length) {
          const nested = layoutLane(
            station,
            nestedChildren,
            laneX + side * BRANCH_STEP_X,
            y + Math.round(localGapY * 0.82),
            side,
            level + 1
          );
          allStations.push(...nested.stations);
          lanes.push(...nested.lanes);
          childBottom = Math.max(childBottom, nested.bottomY);
        }

        bottomY = Math.max(bottomY, childBottom);
        y = childBottom + localGapY;
      });

      const points = [{ x: parentAnchor.x, y: parentAnchor.y }];
      if (parentAnchor.x !== laneX) points.push({ x: laneX, y: parentAnchor.y });
      localStations.forEach(station => points.push({ x: laneX, y: station.y }));

      lanes.unshift({
        id: `lane|${parentAnchor.id}|${localStations[0].id}`,
        points,
        stations: localStations,
        level,
      });

      return { stations: allStations, lanes, bottomY };
    };

    const relativeLines = roots.map((root, index) => {
      const directChildren = orderedChildrenMap[root.id] || [];
      if (!directChildren.length) return null;

      const anchor = { id: `${root.id}|anchor`, x: 0, y: ROOT_ANCHOR_Y };
      const directGapY = compactGap(directChildren.length, TRUNK_GAP_Y, TRUNK_GAP_MIN_Y);
      const branchBias = index % 2 === 0 ? 1 : -1;
      const sides = assignSides(directChildren, branchBias);

      const trunkStations = [];
      const stations = [];
      const lanes = [];
      let y = ROOT_ANCHOR_Y + ROOT_STATION_GAP_Y;
      let bottomY = anchor.y;

      directChildren.forEach(child => {
        const station = createStation(child, 0, y, sides[child.id], 0);
        trunkStations.push(station);
        stations.push(station);

        let childBottom = station.y;
        const nestedChildren = orderedChildrenMap[child.id] || [];
        if (nestedChildren.length) {
          const nested = layoutLane(
            station,
            nestedChildren,
            sides[child.id] * BRANCH_STEP_X,
            y + Math.round(directGapY * 0.82),
            sides[child.id],
            1
          );
          stations.push(...nested.stations);
          lanes.push(...nested.lanes);
          childBottom = Math.max(childBottom, nested.bottomY);
        }

        bottomY = Math.max(bottomY, childBottom);
        y = childBottom + directGapY;
      });

      lanes.unshift({
        id: `lane|${root.id}|trunk`,
        points: [{ x: 0, y: anchor.y }, ...trunkStations.map(station => ({ x: 0, y: station.y }))],
        stations: trunkStations,
        level: 0,
        trunk: true,
      });

      let minX = -HEADER_W / 2;
      let maxX = HEADER_W / 2;
      let maxY = bottomY + 54;

      stations.forEach(station => {
        const labelW = station.major ? MAJOR_LABEL_W : MINOR_LABEL_W;
        minX = Math.min(minX, station.x - BRANCH_STEP_X / 2);
        maxX = Math.max(maxX, station.x + BRANCH_STEP_X / 2);
        if (station.labelSide < 0) minX = Math.min(minX, station.x - labelW - LABEL_OFF_X);
        else maxX = Math.max(maxX, station.x + labelW + LABEL_OFF_X);
        maxY = Math.max(maxY, station.y + 24);
      });

      const rootInfo = meta[root.id] || {};
      const rootStats = stats?.[root.id];
      const atRisk = root.date && rootStats?._endD && rootStats._endD > new Date(root.date);
      const train = progressPoint(anchor, trunkStations, progressIndex(trunkStations));

      return {
        root,
        color: PALETTE[index % PALETTE.length],
        anchor,
        trunkStations,
        stations,
        lanes,
        bottomY,
        minX,
        maxX,
        maxY,
        progress: rootInfo.prog || 0,
        atRisk,
        train,
      };
    }).filter(Boolean);

    if (!relativeLines.length) return null;

    let cursorX = ROOT_PAD_X;
    const lines = relativeLines.map(line => {
      const shiftX = cursorX - line.minX;
      cursorX += (line.maxX - line.minX) + ROOT_GAP_X;
      return { ...line, shiftX };
    });

    const svgW = cursorX + ROOT_PAD_X;
    const svgH = Math.max(...lines.map(line => line.maxY)) + ROOT_PAD_Y;
    return { lines, svgW, svgH };
  }, [meta, orderedChildrenMap, stats]);

  if (!layout?.lines.length) return null;

  return <div style={{ overflowX: 'auto', overflowY: 'auto', marginBottom: 20 }}>
    <svg width={layout.svgW} height={layout.svgH} viewBox={`0 0 ${layout.svgW} ${layout.svgH}`} style={{ display: 'block' }}>
      <style>{`
        .rm-major{font:600 11px/1.1 'Inter',system-ui,sans-serif;fill:var(--tx)}
        .rm-minor{font:500 8.5px/1.1 'Inter',system-ui,sans-serif;fill:var(--tx2)}
        .rm-done{fill:var(--tx3);text-decoration:line-through}
        .rm-count{font:400 7px/1 'JetBrains Mono',monospace;fill:var(--tx3)}
        .rm-pct{font:800 14px/1 'JetBrains Mono',monospace}
        .rm-id{font:800 10px/1 'JetBrains Mono',monospace;fill:#fff}
        .rm-title{font:600 7.5px/1 'Inter',system-ui,sans-serif;fill:rgba(255,255,255,.92)}
        .rm-risk{font:700 7px/1 'JetBrains Mono',monospace;fill:var(--re)}
      `}</style>

      {layout.lines.map(line => {
        const trainY = line.train?.y ?? line.anchor.y;
        const lastTrunk = line.trunkStations[line.trunkStations.length - 1];

        return <g key={line.root.id} transform={`translate(${line.shiftX},0)`}>
          {line.lanes.filter(lane => !lane.trunk).map(lane => (
            <path
              key={lane.id}
              d={polylinePath(lane.points)}
              stroke={line.color}
              strokeWidth={LINE_W}
              fill="none"
              opacity={lane.level === 1 ? 0.55 : 0.42}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          <path
            d={polylinePath([{ x: 0, y: line.anchor.y }, { x: 0, y: lastTrunk.y }])}
            stroke={line.color}
            strokeWidth={LINE_W}
            fill="none"
            opacity={0.18}
            strokeLinecap="round"
          />

          {line.progress > 0 && <path
            d={polylinePath([{ x: 0, y: line.anchor.y }, { x: 0, y: trainY }])}
            stroke={line.color}
            strokeWidth={LINE_W}
            fill="none"
            strokeLinecap="round"
          />}

          {line.train && line.progress < 1 && <g>
            <circle cx={0} cy={line.train.y} r={MAJOR_R + 4} fill={line.color} opacity={0.18}>
              <animate attributeName="r" values={`${MAJOR_R + 2};${MAJOR_R + 5};${MAJOR_R + 2}`} dur="2.2s" repeatCount="indefinite" />
            </circle>
            <circle cx={0} cy={line.train.y} r={MAJOR_R + 1.5} fill={line.color} />
            <circle cx={0} cy={line.train.y} r={MAJOR_R - 1.5} fill="#fff" />
          </g>}

          {line.stations.map(station => {
            const isDone = station.allDone;
            const isWip = !isDone && station.prog > 0;
            const r = station.major ? MAJOR_R : MINOR_R;
            const lx = station.x + (station.labelSide < 0 ? -LABEL_OFF_X : LABEL_OFF_X);
            const anchor = station.labelSide < 0 ? 'end' : 'start';
            const nameClass = `${station.major ? 'rm-major' : 'rm-minor'}${isDone ? ' rm-done' : ''}`;

            return <g key={station.id}>
              {isDone
                ? <circle cx={station.x} cy={station.y} r={r} fill={line.color} />
                : <>
                  <circle cx={station.x} cy={station.y} r={r + (station.major ? 1 : 0.75)} fill="var(--bg)" />
                  <circle cx={station.x} cy={station.y} r={r} fill="var(--bg2)" stroke={isWip ? line.color : 'var(--b3)'} strokeWidth={station.major ? 2 : 1.2} />
                  {isWip && <circle cx={station.x} cy={station.y} r={Math.max(1.8, r - 2)} fill={line.color} />}
                </>}

              <text x={lx} y={station.y + (station.major ? -2 : 0)} className={nameClass} textAnchor={anchor} dominantBaseline="middle">
                {truncate(station.name, station.major ? 26 : 21)}
              </text>

              {station.major && station.total > 0 && <text x={lx} y={station.y + 10} className="rm-count" textAnchor={anchor}>
                {station.done}/{station.total}
              </text>}
            </g>;
          })}

          <rect x={-HEADER_W / 2} y={HEADER_Y} width={HEADER_W} height={HEADER_H} rx={7} fill={line.color} />
          <text x={-HEADER_W / 2 + 9} y={HEADER_Y + 12} className="rm-id">{line.root.id}</text>
          <text x={-HEADER_W / 2 + 9} y={HEADER_Y + 23} className="rm-title">
            {truncate(line.root.name, 21)}
          </text>

          <text x={0} y={line.bottomY + 28} className="rm-pct" textAnchor="middle" fill={line.progress >= 1 ? 'var(--gr)' : line.color}>
            {Math.round(line.progress * 100)}%
          </text>
          {line.atRisk && <text x={0} y={line.bottomY + 42} className="rm-risk" textAnchor="middle">AT RISK</text>}
        </g>;
      })}
    </svg>
  </div>;
}
