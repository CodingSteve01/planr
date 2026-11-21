import { NODE_W, NODE_H } from '../../../utils/net/geometry.js';
import { NodeRing } from './NodeRing.jsx';
import { NodeLabels } from './NodeLabels.jsx';

// One node card: its outline, the diff-window ring, the progress ring and the
// labels. How it looks depends on selection, search, the critical path and the
// diff window, so those come in from the graph.
export function NetNode({
  activeMatchId,
  assignLabel,
  connectedSet,
  cpSet,
  diffDoneSet,
  diffProgSet,
  hasChildrenSet,
  onCtx,
  onNodeClick,
  p,
  r,
  sc,
  searchMatches,
  selId,
  setHoverId,
  setSelId,
  setTip,
  stC,
  stats,
  tc,
}) {
  const isSel = selId === r.id;
  const isDone = r.status === 'done';
  const isCp = cpSet?.has(r.id);
  const isConn = connectedSet?.has(r.id);
  // Only dim on deliberate selection — hover alone should not push non-connected nodes into the background.
  const subtreeDimmed = selId && connectedSet && connectedSet.size > 3 && !connectedSet.has(r.id);
  const isRoot = !r.id.includes('.');
  const depth = r.id.split('.').length;
  const prog = stats?.[r.id]?._progress ?? 0;
  // Search highlight: matches stay full opacity + amber outline; non-matches dim.
  const isMatch = searchMatches?.has(r.id);
  const isActiveMatch = r.id === activeMatchId;
  const searchDimmed = searchMatches && searchMatches.size > 0 && !isMatch;
  // "Only changed" mode: dim nodes that didn't move in the window so
  // the eye locks onto the active sprint subset without rearranging
  // the layout. Roots stay legible because their subtree may contain
  // changed leaves even when the root id itself isn't in the set.
  // Diff / Horizon do NOT dim the graph any more — the matching nodes
  // already wear a ring (see the rect overlay below), so dimming the
  // rest only made labels unreadable without adding signal. Hard
  // filtering happens upstream via the "Only" toggles.
  const finalOpacity = subtreeDimmed ? 0.45 : searchDimmed ? 0.35 : 1;
  const diffDoneHere = diffDoneSet.has(r.id);
  const diffProgHere = !diffDoneHere && diffProgSet.has(r.id);
  // The amber branch marks "progressed within the diff window", not
  // wip — kept as a literal, see docs/design-tokens.md "Not yet mapped".
  const diffStroke = diffDoneHere ? 'var(--st-done)' : diffProgHere ? 'var(--diff)' : null;
  return (
    <g key={r.id} transform={`translate(${p.x},${p.y})`} opacity={finalOpacity}>
      {diffStroke && (
        <rect
          x={-3}
          y={-3}
          width={NODE_W + 6}
          height={NODE_H + 6}
          rx={7}
          fill="none"
          stroke={diffStroke}
          strokeWidth={2}
          style={{ pointerEvents: 'none', filter: `drop-shadow(0 0 4px ${diffStroke})` }}
        >
          <animate attributeName="opacity" values="1;.55;1" dur="2.4s" repeatCount="indefinite" />
        </rect>
      )}
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={5}
        fill={isDone ? 'var(--bg-done)' : isRoot ? tc : 'var(--bg2)'}
        stroke={
          isActiveMatch
            ? 'var(--ac)'
            : isMatch
              ? 'var(--am)'
              : isSel
                ? 'var(--ac)'
                : isCp
                  ? 'var(--re)'
                  : isConn
                    ? tc
                    : isRoot
                      ? tc
                      : tc + '44'
        }
        strokeWidth={isMatch ? 2.5 : isSel ? 2.5 : isRoot ? 2 : isConn ? 1.5 : isCp ? 1.5 : 0.7}
        style={{ cursor: 'pointer' }}
        onClick={e => {
          e.stopPropagation();
          setSelId(isSel ? null : r.id);
        }}
        onDoubleClick={e => {
          e.stopPropagation();
          onNodeClick(r);
        }}
        onContextMenu={e => onCtx(e, r)}
        onMouseEnter={e => {
          setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY });
          setHoverId(r.id);
        }}
        onMouseLeave={() => {
          setTip(null);
          setHoverId(null);
        }}
      />
      <NodeRing isRoot={isRoot} prog={prog} stC={stC} />
      <NodeLabels assignLabel={assignLabel} depth={depth} hasChildrenSet={hasChildrenSet} isRoot={isRoot} r={r} sc={sc} tc={tc} />
    </g>
  );
}
