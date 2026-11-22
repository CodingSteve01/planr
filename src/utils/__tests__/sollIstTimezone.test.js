import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { computeSollIst } from '../sollIst.js';

// Completion days are plain calendar days ("2026-03-02"). Read as UTC instants
// they move to the evening before west of Greenwich and a Monday stops counting.
describe('computeSollIst() west of UTC', () => {
  const saved = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  });

  const task = { id: 'w', status: 'done', best: 5, factor: 1, completedStart: '2026-03-02', completedEnd: '2026-03-06' };

  test('a Monday–Friday task is five working days and starts on the 2nd', () => {
    const r = computeSollIst(task, { workDays: new Set([1, 2, 3, 4, 5]), holidayIso: [] });
    expect(r.ist.workDays).toBe(5);
    expect(r.ist.startD.getDate()).toBe(2);
    expect(r.ist.endD.getDate()).toBe(6);
  });

  test('the planned window is read the same way', () => {
    const r = computeSollIst(
      { ...task, plannedStart: '2026-03-02', plannedEnd: '2026-03-06' },
      { workDays: new Set([1, 2, 3, 4, 5]), holidayIso: [] },
    );
    expect(r.planned.workDays).toBe(5);
  });
});
