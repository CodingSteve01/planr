// The key under the graph: what the line styles mean and how to move around.
export function NetLegend() {
  return (
    <div className="ng-legend">
      <div className="ng-li">
        <div style={{ width: 14, height: 1, background: 'var(--b3)', flexShrink: 0 }} />
        Hierarchy
      </div>
      <div className="ng-li">
        <div style={{ width: 14, height: 0, borderTop: '1.5px solid var(--ac)', flexShrink: 0 }} />
        Dependency
      </div>
      <div className="ng-li" style={{ color: 'var(--re)' }}>
        Crit. path
      </div>
      <span style={{ color: 'var(--tx3)', fontSize: 10 }}>Scroll=pan · Pinch=zoom · Click=highlight · Dbl-click=edit</span>
    </div>
  );
}
