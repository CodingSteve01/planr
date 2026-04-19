import { useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { renderRoadmapSvg } from '../../utils/roadmap.js';
import { useT } from '../../i18n.jsx';

export function Roadmap({ tree, scheduled, stats, onOpenItem }) {
  const { t } = useT();
  // Pass raw template strings (with {0}) so roadmap.js can substitute the percentage itself.
  // t() without extra args leaves {0} intact, which roadmap.js replaces with the actual %.
  const labels = useMemo(() => ({
    train: t('rm.train'),
    currentPos: t('rm.currentPos'),  // keeps "{0}" placeholder — roadmap.js fills it
    atRisk: t('rm.atRisk'),
  }), [t]);
  const svg = useMemo(() => renderRoadmapSvg({ tree, scheduled, stats, labels }), [tree, scheduled, stats, labels]);
  const [tip, setTip] = useState(null);
  const ref = useRef(null);
  const tipRef = useRef(null);

  const onMove = useCallback(e => {
    const g = e.target.closest('[data-tip]');
    if (g) {
      const text = g.getAttribute('data-tip');
      if (text) {
        const rect = ref.current?.getBoundingClientRect();
        setTip({
          text,
          cx: e.clientX - (rect?.left || 0),
          cy: e.clientY - (rect?.top || 0),
          cw: rect?.width || 0,
          ch: rect?.height || 0,
          x: e.clientX - (rect?.left || 0) + 14,
          y: e.clientY - (rect?.top || 0) - 8,
        });
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

  // After render, measure tooltip and flip it left/up if it would overflow the container
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const tw = tipRef.current.offsetWidth;
    const th = tipRef.current.offsetHeight;
    let nx = tip.cx + 14;
    let ny = tip.cy - 8;
    if (nx + tw > tip.cw - 8) nx = tip.cx - tw - 14;    // flip left
    if (nx < 8) nx = 8;                                  // clamp left edge
    if (ny + th > tip.ch - 8) ny = tip.ch - th - 8;      // clamp bottom
    if (ny < 8) ny = 8;                                  // clamp top
    if (nx !== tip.x || ny !== tip.y) {
      tipRef.current.style.left = nx + 'px';
      tipRef.current.style.top = ny + 'px';
    }
  }, [tip]);

  if (!svg) return null;
  return (
    <div ref={ref} style={{ marginBottom: 20, position: 'relative' }}
      onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}>
      <style>{`.rm-legend-item:hover{background:var(--bg3,#232830)}`}</style>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {tip && (
        <div
          ref={tipRef}
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
