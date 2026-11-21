export { PlanPicker };

// Simple plan picker: toggle chips for each plan. Used for Team + Member.
function PlanPicker({ label, hint, plans, selected, onChange }) {
  if (!plans.length) return null;
  const toggle = id => {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    onChange(next);
  };
  return (
    <div className="field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <label style={{ marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {plans.map(p => {
          const on = selected.includes(p.id);
          return (
            <button key={p.id} className={`btn btn-xs ${on ? 'btn-pri' : 'btn-sec'}`} onClick={() => toggle(p.id)} style={{ fontSize: 11 }}>
              {on ? '● ' : ''}
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
