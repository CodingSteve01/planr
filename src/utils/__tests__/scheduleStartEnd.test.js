import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { schedule } from '../scheduler.js';
import { buildHMap } from '../holidays.js';

// A scheduled row never ends before it starts, whatever the plan does with
// absences, holidays and dependencies.
const NOW = new Date(2026, 5, 15, 12, 0, 0);

let demo;
beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetModules();
  const { buildDemoProject } = await import('../demoProject.js');
  demo = buildDemoProject(k => k);
});
afterAll(() => vi.useRealTimers());

const day = d => d.toLocaleDateString('sv');
const offenders = results =>
  results.filter(r => r.startD && r.endD && r.startD > r.endD).map(r => `${r.id} (${day(r.startD)} > ${day(r.endD)})`);

describe('schedule start/end invariant', () => {
  test('demo plan: every scheduled item has startD <= endD', () => {
    const { meta, tree, members, vacations, holidays } = demo;
    const hm = buildHMap(holidays);
    const { results } = schedule(tree, members, vacations || [], meta.planStart, meta.planEnd, hm, null, meta.planStart);
    expect(results.length).toBeGreaterThan(0);
    expect(offenders(results), `start after end: ${offenders(results).join(', ')}`).toEqual([]);
  });
});
