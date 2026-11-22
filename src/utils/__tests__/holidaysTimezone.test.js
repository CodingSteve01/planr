import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { computeNRW, buildHMap, buildWeeks } from '../holidays.js';

// Holiday keys are plain calendar days ("2026-04-06"). Parsing them as UTC
// instants moves a Monday to Sunday evening west of Greenwich.
describe('buildWeeks() west of UTC', () => {
  const saved = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  });

  const hm = buildHMap(computeNRW([2026]));

  test('a Monday holiday marks its own week', () => {
    const weeks = buildWeeks('2026-04-06', '2026-04-17', hm);
    expect(weeks[0].hasH).toBe(true);
    expect(weeks[1].hasH).toBe(false);
  });
});
