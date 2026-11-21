import { NODE_W } from '../../../utils/net/geometry.js';
import { progressPctLabel } from '../../../utils/progress.js';

// The circular progress mark in the corner of a node.
export function NodeRing({ isRoot, prog, stC }) {
  const pR = 5,
    pCx = NODE_W - 8,
    pCy = 8;
  const pCirc = 2 * Math.PI * pR;
  const pOff = pCirc * (1 - prog / 100);
  return (
    <>
      {/* Circular progress */}
      <circle
        cx={pCx}
        cy={pCy}
        r={pR}
        fill="none"
        stroke={isRoot ? '#ffffff22' : 'var(--b2)'}
        strokeWidth={1.5}
        style={{ pointerEvents: 'none' }}
      />
      {prog > 0 && (
        <circle
          cx={pCx}
          cy={pCy}
          r={pR}
          fill="none"
          stroke={prog >= 100 ? 'var(--gr)' : stC}
          strokeWidth={1.5}
          strokeDasharray={pCirc}
          strokeDashoffset={pOff}
          strokeLinecap="round"
          transform={`rotate(-90 ${pCx} ${pCy})`}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {prog >= 100 && (
        <text x={pCx} y={pCy + 1.5} fontSize={5} textAnchor="middle" fill="var(--gr)" fontWeight={700} style={{ pointerEvents: 'none' }}>
          ●
        </text>
      )}
      {/* The raw number, not the formatted one, used to go in here: a
                leaf 2.562761506276151 % of the way through printed all
                sixteen digits across the node. progress.js is the single
                source for this figure AND its rounding, precisely so the
                graph cannot disagree with the tree. */}
      {prog > 0 && prog < 100 && (
        <text
          x={pCx}
          y={pCy + 2}
          fontSize={4}
          textAnchor="middle"
          fill={isRoot ? '#ffffffcc' : 'var(--tx3)'}
          fontFamily="var(--mono)"
          style={{ pointerEvents: 'none' }}
        >
          {progressPctLabel(prog)}
        </text>
      )}
    </>
  );
}
