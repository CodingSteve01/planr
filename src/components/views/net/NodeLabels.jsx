import { wrapTwoLines, NAME_CHARS } from '../../../utils/net/label.js';

// The id, the name over two lines, and the info line of a node.
export function NodeLabels({ assignLabel, depth, hasChildrenSet, isRoot, r, sc, tc }) {
  return (
    <>
      {/* ID */}
      <text x={5} y={10} fontSize={6} fill={isRoot ? '#ffffffaa' : 'var(--tx3)'} fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>
        {r.id}
      </text>
      {/* Name (2 lines) */}
      <text
        x={5}
        y={21}
        fontSize={7.5}
        fill={isRoot ? '#ffffff' : tc}
        fontWeight={depth <= 1 ? 700 : depth <= 2 ? 600 : 500}
        style={{ pointerEvents: 'none' }}
      >
        {(() => {
          // Two lines, broken where a reader would break them. Slicing
          // at character 26 split "Zulieferung aus dem Betrieb steht"
          // into "…Betrie" / "b steht"; SVG <text> does no wrapping of
          // its own, so the break has to be chosen here.
          const [first, rest] = wrapTwoLines(r.name, NAME_CHARS);
          if (!rest) return first;
          return (
            <>
              {first}
              <tspan x={5} dy={10}>
                {rest}
              </tspan>
            </>
          );
        })()}
      </text>
      {/* Info line with priority chevron (for leaves) */}
      {(() => {
        const isLeafNode = !hasChildrenSet.has(r.id);
        // SVG <text>, so an <Icon> cannot go here — these are the
        // nearest plain-font stand-ins for the chevrons the tree draws.
        const PRIO_GLYPH = { 1: '^^', 2: '^', 3: '=', 4: 'v' };
        const PRIO_COL = { 1: '#f87171', 2: '#fbbf24', 3: '#6ca0ff', 4: '#8090a8' };
        const showPrio = isLeafNode && r.prio;
        const y = wrapTwoLines(r.name, NAME_CHARS)[1] ? 40 : 33;
        return (
          <>
            {showPrio && (
              <text x={5} y={y} fontSize={7} fill={PRIO_COL[r.prio]} fontWeight={700} style={{ pointerEvents: 'none' }}>
                {PRIO_GLYPH[r.prio]}
              </text>
            )}
            {sc && (
              <text
                x={showPrio ? 14 : 5}
                y={y}
                fontSize={5.5}
                fill={isRoot ? '#ffffffaa' : sc.autoAssigned ? 'var(--am)' : 'var(--tx3)'}
                fontFamily="var(--mono)"
                style={{ pointerEvents: 'none' }}
              >
                {sc.effort?.toFixed(0)}d · {assignLabel(r, sc)}
              </text>
            )}
          </>
        );
      })()}
    </>
  );
}
