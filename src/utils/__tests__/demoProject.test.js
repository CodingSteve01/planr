import { describe, expect, test } from 'vitest';
import { buildDemoProject } from '../demoProject.js';
import { computeDiff } from '../diff.js';

const dayMs = 86400000;
const diffDays = (a, b) => Math.round((new Date(a) - new Date(b)) / dayMs);

describe('demo project', () => {
  test('uses a 60 day past/future Gantt horizon and historical done items', () => {
    const demo = buildDemoProject(k => k);
    expect(diffDays(demo.meta.planEnd, demo.meta.planStart)).toBe(120);

    const doneLeaves = demo.tree.filter(item => item.status === 'done' && item.id.includes('.'));
    expect(doneLeaves.length).toBeGreaterThan(0);
    expect(doneLeaves.every(item => item.completedStart && item.completedAt)).toBe(true);

    const deadlines = demo.tree.filter(item => item.type === 'deadline');
    expect(deadlines.every(item => {
      const offset = diffDays(item.date, demo.meta.planStart);
      return offset >= 0 && offset <= 120;
    })).toBe(true);

    expect(demo.historyEvents.length).toBeGreaterThan(doneLeaves.length);
    const since = new Date();
    since.setDate(since.getDate() - 14);
    since.setHours(23, 59, 59, 999);
    const diff = computeDiff({
      tree: demo.tree,
      historyEvents: demo.historyEvents,
      sinceDate: since,
    });
    expect(diff).not.toBeNull();
    expect(diff.changedInWindowIds.length).toBeGreaterThan(0);
  });
});
