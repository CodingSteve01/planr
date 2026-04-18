import { useMemo, useState, useCallback, useRef } from 'react';
import { renderRoadmapSvg } from '../../utils/roadmap.js';

export function Roadmap({ tree, scheduled, stats, onOpenItem }) {
  const svg = useMemo(() => renderRoadmapSvg({ tree, scheduled, stats }), [tree, scheduled, stats]);
  const [tip, setTip] = useState(null);
  const ref = useRef(null);

  const onMove = useCallback(e => {
    const g = e.target.closest('[data-tip]');
    if (g) {
      const text = g.getAttribute('data-tip');
      if (text) {
        const rect = ref.current?.getBoundingClientRect();
        setTip({ text, x: e.clientX - (rect?.left || 0) + 12, y: e.clientY - (rect?.top || 0) - 8 });
        return;
      }
    }
    setTip(null);
  }, []);

  const onLeave = useCallback(() => setTip(null), []);

  const onClick = useCallback(e => {
    const el = e.target.closest('[data-item-id]');
    if (el && onOpenItem) {
      const id = el.getAttribute('data-item-id');
      if (id) onOpenItem(id);
    }
  }, [onOpenItem]);

  if (!svg) return null;
  return (
    <div ref={ref} style={{ marginBottom: 20, overflow: 'hidden', position: 'relative' }}
      onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}>
      <style>{`.rm-legend-item:hover{background:var(--bg3,#232830)}`}</style>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {tip && (
        <div
          style={{
            position: 'absolute', left: tip.x, top: tip.y,
            background: 'var(--bg2, #191d25)', border: '1px solid var(--b2, #364456)',
            borderRadius: 'var(--r, 7px)', padding: '8px 10px', zIndex: 20,
            boxShadow: 'var(--sh, 0 4px 24px rgba(0,0,0,.55))',
            pointerEvents: 'none', minWidth: 180, maxWidth: 320,
            color: 'var(--tx, #e8ecf4)',
          }}
          dangerouslySetInnerHTML={{ __html: tip.text }}
        />
      )}
    </div>
  );
}
