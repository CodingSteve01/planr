// The subway map marks the stations a scenario moves work at.
import { describe, test, expect } from 'vitest';
import { computeRoadmapModel, renderRoadmapSvg } from '../roadmap.js';
import { treeStats } from '../scheduler.js';

const day = n => new Date(2027, 0, 4 + n);
const tree = [
  { id: 'P1', name: 'Project', status: 'open', type: 'goal' },
  { id: 'P1.1', name: 'Preise', status: 'open' },
  { id: 'P1.1.1', name: 'One', status: 'open', best: 5, factor: 1 },
  { id: 'P1.2', name: 'Masken', status: 'open' },
  { id: 'P1.2.1', name: 'Two', status: 'open', best: 5, factor: 1 },
];
const scheduled = [
  ['P1.1.1', 0],
  ['P1.2.1', 60],
].map(([id, d]) => ({ id, treeId: id, startD: day(d), endD: day(d + 4), status: 'open', effort: 5 }));
const svg = extra => renderRoadmapSvg({ tree, scheduled, stats: treeStats(tree), ...extra });

describe('scenario halos on the subway map', () => {
  test('none without a scenario — the PDF path and the plan are untouched', () => {
    expect(svg({})).not.toContain('rm-scenario-halo');
    expect(svg({ scenarioIds: new Map() })).not.toContain('rm-scenario-halo');
  });

  test('one per station with moved work, in the scenario colour', () => {
    const out = svg({ scenarioIds: new Map([['P1.2.1', 30]]) });
    expect(out.match(/rm-scenario-halo/g)).toHaveLength(1);
    expect(out).toContain('stroke="var(--sc)"');
    expect(computeRoadmapModel({ tree, scheduled, stats: treeStats(tree) }).lines.length).toBe(1);
  });
});
