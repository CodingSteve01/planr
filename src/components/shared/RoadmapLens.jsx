import { useMemo } from 'react';
import { PlanRoadmap } from '../views/PlanRoadmap.jsx';
import { SearchSelect } from './SearchSelect.jsx';
import { getLineColor } from '../../utils/roadmap.js';
import { useT } from '../../i18n.jsx';

// Plan mode's Roadmap tab — the calendar-style per-project roadmap
// (utils/projectRoadmap.js, drawn through Roadmap.jsx's `soloRootId` path),
// a sibling of the Gantt at full width. It shipped as a chip in the filter
// row opening a 380px sidebar and nobody found it: a view is not a filter,
// and "beside the Gantt, in the same style" means a tab, not a panel.
//
// It draws through PlanRoadmap.jsx, a DOM renderer, not the SVG one. The SVG
// keeps the Subway map and the PDF, where one scalable image is exactly
// right; here it was wrong, because a fixed viewBox at width:100% SCALES —
// on a wide window every row and label grew, which is why this view looked
// oversized next to the Gantt it is supposed to match. This file is just the
// project picker around it. This used to be reachable
// from Summary by soloing one line on the Subway map; that surface is gone
// (see SumView.jsx / docs/features.md) because a project's calendar belongs
// next to the tool used to plan it, not buried behind a toggle on the tool
// used to review the whole portfolio. This is its one remaining home.
//
// No second renderer: everything below is chrome (a project picker) around
// the same `<Roadmap soloRootId>` call SumView used to make.
export function RoadmapLens({ tree, scheduled, stats, roadmapAssignment, focusId, onFocusChange, onOpenItem }) {
  const { t } = useT();
  const roots = useMemo(() => tree.filter(node => !String(node.id).includes('.')), [tree]);
  // A remembered focus that no longer exists (renamed, deleted, archived)
  // falls back to the first project rather than rendering nothing.
  const effectiveId = focusId && roots.some(root => root.id === focusId) ? focusId : (roots[0]?.id || '');
  const color = effectiveId ? getLineColor(effectiveId, roadmapAssignment) : null;

  if (!roots.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* No title here: the tab is called Roadmap, so repeating it above the
          picker just spends a line saying where you already know you are. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--b)', flexShrink: 0 }}>
        <span style={{ width: 280, flexShrink: 0 }} data-testid="gantt-roadmap-lens-picker">
          <SearchSelect
            value={effectiveId}
            options={roots.map(root => ({ id: root.id, label: root.name || root.id }))}
            onSelect={onFocusChange}
            placeholder={t('rm.pickProject')}
            showIds
          />
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {effectiveId && (
          <PlanRoadmap
            tree={tree}
            scheduled={scheduled}
            stats={stats}
            rootId={effectiveId}
            color={color || 'var(--ac)'}
            onOpenItem={onOpenItem}
          />
        )}
      </div>
    </div>
  );
}
