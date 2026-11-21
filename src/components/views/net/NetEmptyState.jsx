import { Icon } from '../../shared/Icon.jsx';

// What the graph shows when there is nothing to draw.
export function NetEmptyState({ isFiltered, onAddNode }) {
  return (
    <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ textAlign: 'center', color: 'var(--tx3)' }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          <Icon name="network" size={32} strokeWidth={1.4} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>
          {isFiltered ? 'No items match this filter' : 'No items yet'}
        </div>
        {isFiltered ? (
          <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Adjust the root or team filter to widen the graph.</div>
        ) : (
          onAddNode && (
            <button className="btn btn-pri" onClick={onAddNode}>
              + Add first item
            </button>
          )
        )}
      </div>
    </div>
  );
}
