import { useMemo } from 'react';
import { renderRoadmapSvg } from '../../utils/roadmap.js';

export function Roadmap({ tree, scheduled, stats }) {
  const svg = useMemo(() => renderRoadmapSvg({ tree, scheduled, stats }), [tree, scheduled, stats]);
  if (!svg) return null;
  return <div style={{ marginBottom: 20, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
