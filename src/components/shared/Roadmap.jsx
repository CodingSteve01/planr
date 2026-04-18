import { useMemo, useState, useCallback, useRef } from 'react';
import { renderRoadmapSvg } from '../../utils/roadmap.js';

export function Roadmap({ tree, scheduled, stats }) {
  const svg = useMemo(() => renderRoadmapSvg({ tree, scheduled, stats }), [tree, scheduled, stats]);
  const [tip, setTip] = useState(null);
  const ref = useRef(null);

  const onMove = useCallback(e => {
    const g = e.target.closest('.rm-stop');
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

  if (!svg) return null;
  return (
    <div ref={ref} style={{ marginBottom: 20, overflow: 'hidden', position: 'relative' }}
      onMouseMove={onMove} onMouseLeave={onLeave}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {tip && (
        <div style={{
          position: 'absolute', left: tip.x, top: tip.y,
          background: 'var(--bg2, #191d25)', border: '1px solid var(--b2, #364456)',
          borderRadius: 'var(--r, 7px)', padding: '8px 12px', zIndex: 20,
          boxShadow: 'var(--sh, 0 4px 24px rgba(0,0,0,.55))',
          pointerEvents: 'none', maxWidth: 280, whiteSpace: 'pre-line',
          font: '500 11px/1.5 Inter, system-ui, sans-serif',
          color: 'var(--tx, #e8ecf4)',
        }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
