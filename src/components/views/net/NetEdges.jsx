// The hierarchy connectors and the dependency arrows, drawn under the nodes.
export function NetEdges({ activeId, allEdges, cpSet, iMap }) {
  return (
    <>
      {/* Hierarchy edges (tree connectors) */}
      {allEdges
        .filter(e => e.isHier)
        .map(e => {
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          return (
            <path
              key={e.id}
              d={e.path}
              fill="none"
              stroke={isActive ? 'var(--tx2)' : 'var(--b3)'}
              strokeWidth={isActive ? 1.5 : 0.8}
              opacity={isActive ? 0.7 : 0.35}
            />
          );
        })}

      {/* Dependency edges — hard = solid blue / red (CP), soft = grey + thinner */}
      {allEdges
        .filter(e => !e.isHier)
        .map(e => {
          const isCp = cpSet?.has(e.from) && cpSet?.has(e.to);
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          const op = isActive ? 0.9 : isCp ? 0.7 : e.isSoft ? 0.55 : 0.7;
          const owner = iMap[e.depOwner || e.from];
          const label = owner?._depLabels?.[e.depTarget || e.to] || '';
          const lp = e.labelPt;
          const stroke = isCp ? 'var(--re)' : e.isSoft ? 'var(--tx3)' : 'var(--ac)';
          return (
            <g key={e.id}>
              <path
                d={e.path}
                fill="none"
                stroke={stroke}
                strokeWidth={isActive ? 2.5 : isCp ? 1.5 : e.isSoft ? 0.8 : 1}
                opacity={op}
                markerEnd={isCp ? 'url(#ar-cp)' : 'url(#ar-d)'}
              />
              {label && isActive && lp && (
                <>
                  <rect
                    x={lp.x - label.length * 2.5 - 4}
                    y={lp.y - 7}
                    width={label.length * 5 + 8}
                    height={13}
                    rx={3}
                    fill="var(--bg2)"
                    stroke="var(--ac)"
                    strokeWidth={0.5}
                    opacity={0.92}
                    style={{ pointerEvents: 'none' }}
                  />
                  <text
                    x={lp.x}
                    y={lp.y + 3}
                    fontSize={7}
                    fill="var(--ac)"
                    textAnchor="middle"
                    fontFamily="var(--mono)"
                    style={{ pointerEvents: 'none' }}
                  >
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })}
    </>
  );
}
