import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { futureProgressByRoot } from '../futureProgress.js';

// Plain calendar days ("2026-06-15") read as UTC instants move to the evening
// before west of Greenwich, so a day that is still ahead looks already past.
describe('futureProgressByRoot() west of UTC', () => {
  const saved = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  });

  const leaf = (id, extra = {}) => ({ id, name: id, team: 'Backend', best: 4, factor: 1, status: 'open', ...extra });
  const root = { id: 'P1', name: 'Rechnungen', best: 0 };

  test('a bar given as day strings is cut at the horizon by local days', () => {
    vi.setSystemTime(new Date(2026, 5, 1, 9, 0, 0));
    const horizon = new Date(2026, 5, 14, 20, 0, 0);
    const sched = [{ id: 'P1.1', startD: '2026-06-10', endD: '2026-06-15' }];
    // 4 days 20 h of 5 days → 29/30, not the 0.99 cap of a bar that already ended.
    expect(futureProgressByRoot([root, leaf('P1.1')], sched, horizon).P1).toBeCloseTo(29 / 30, 10);
  });

  test('a due day that is still ahead counts once the horizon passes it', () => {
    vi.setSystemTime(new Date(2026, 5, 14, 20, 0, 0));
    const tree = [root, leaf('P1.1', { status: 'wip', due: '2026-06-15' })];
    expect(futureProgressByRoot(tree, [], new Date(2026, 5, 20)).P1).toBeCloseTo(0.99, 10);
  });

  test('a task due today, checked in the evening, is not treated as overdue', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 20, 0, 0));
    const tree = [root, leaf('P1.1', { status: 'wip', due: '2026-06-15' })];
    expect(futureProgressByRoot(tree, [], new Date(2026, 5, 20)).P1).toBeCloseTo(0.99, 10);
  });
});
