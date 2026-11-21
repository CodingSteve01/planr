// Small pieces of the comparison dialog: the figure tiles and the shift bars.

function Tile({ label, figures, sub, testid, onClick }) {
  const body = (
    <>
      <div className="scn-tile-label">{label}</div>
      <div className="scn-tile-figures">
        {figures.map((f, i) => (
          <span key={i} className="scn-figure">
            <span className="scn-figure-n" style={f.tone ? { color: f.tone } : undefined}>
              {f.n}
            </span>
            {f.label && <span className="scn-figure-label">{f.label}</span>}
          </span>
        ))}
      </div>
      {sub && <div className="scn-tile-sub">{sub}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className="scn-tile" data-testid={testid} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="scn-tile" data-testid={testid}>
      {body}
    </div>
  );
}

// A shift as a bar from the centre line: left is earlier, right is later, and
// the longest bar in the table is the scale for all of them.
function ShiftBar({ shift, max, tone }) {
  if (!shift || !max)
    return (
      <span className="scn-shiftbar" aria-hidden="true">
        <i />
      </span>
    );
  const pct = Math.max(4, Math.round((Math.abs(shift) / max) * 50));
  return (
    <span className="scn-shiftbar" aria-hidden="true">
      <i />
      <b style={{ width: `${pct}%`, ...(shift > 0 ? { left: '50%' } : { right: '50%' }), ...(tone ? { background: tone } : {}) }} />
    </span>
  );
}
export { Tile, ShiftBar };
