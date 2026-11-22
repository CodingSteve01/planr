/** @vitest-environment happy-dom */
// The snapshot ring keeps the latest state of an editing burst, holds at most
// 20 slots, and never takes the app down when the storage is full.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEY = 'planr_v2_snapshots';
const plan = n => ({ tree: [{ id: 'P1', name: `State ${n}` }] });
const ring = () => JSON.parse(localStorage.getItem(KEY) || '[]');

let pushSnapshot;
let takeSnapshotNow;
let flushSnapshot;
async function push(n, atMs) {
  vi.setSystemTime(atMs);
  pushSnapshot(plan(n));
  await vi.advanceTimersByTimeAsync(10);
}

describe('snapshot ring', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    delete window.requestIdleCallback; // the timeout path, driven by the fake clock
    vi.resetModules();
    ({ pushSnapshot, takeSnapshotNow, flushSnapshot } = await import('../app/snapshots.js'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps 20 slots out of 25 distinct states a minute apart, dropping the oldest', async () => {
    const t0 = Date.parse('2026-03-02T09:00:00Z');
    for (let i = 0; i < 25; i++) await push(i, t0 + i * 61_000);
    const slots = ring();
    expect(slots).toHaveLength(20);
    expect(slots[0].data.tree[0].name).toBe('State 24');
    expect(slots[19].data.tree[0].name).toBe('State 5');
  });

  it('adds the later of two states 30 seconds apart as a new slot at the window end', async () => {
    const t0 = Date.parse('2026-03-02T09:00:00Z');
    await push(1, t0);
    await push(2, t0 + 30_000);
    expect(ring()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ring().map(x => x.data.tree[0].name)).toEqual(['State 2', 'State 1']);
  });

  it('writes at most once per 60 s in a 2 minute burst and ends on the last state', async () => {
    vi.setSystemTime(Date.parse('2026-03-02T09:00:00Z'));
    for (let i = 0; i < 24; i++) {
      pushSnapshot(plan(i));
      await vi.advanceTimersByTimeAsync(5_000);
    }
    await vi.advanceTimersByTimeAsync(60_000);
    const slots = ring();
    expect(slots).toHaveLength(3);
    expect(slots[0].data.tree[0].name).toBe('State 23');
    // Neighbouring slots are at least one window apart: one write per window.
    expect(slots[0].ts - slots[1].ts).toBeGreaterThanOrEqual(60_000);
    expect(slots[1].ts - slots[2].ts).toBeGreaterThanOrEqual(60_000);
  });

  it('keeps the defensive slot when the restored data is autosaved 5 s later', async () => {
    vi.setSystemTime(Date.parse('2026-03-02T09:00:00Z'));
    pushSnapshot(plan(1));
    await vi.advanceTimersByTimeAsync(1_000);
    takeSnapshotNow(plan(2));
    await vi.advanceTimersByTimeAsync(5_000);
    pushSnapshot(plan(3));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ring().map(x => x.data.tree[0].name)).toEqual(['State 3', 'State 2', 'State 1']);
  });

  it('writes the defensive snapshot at once, inside the throttle window', async () => {
    vi.setSystemTime(Date.parse('2026-03-02T09:00:00Z'));
    pushSnapshot(plan(1));
    await vi.advanceTimersByTimeAsync(10);
    takeSnapshotNow(plan(2));
    expect(ring()[0].data.tree[0].name).toBe('State 2');
  });

  it('keeps the last state of plan A when plan B saves 10 s later', async () => {
    const t0 = Date.parse('2026-03-02T09:00:00Z');
    await push('A', t0);
    await push('B', t0 + 10_000);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ring().map(x => x.data.tree[0].name)).toEqual(['State B', 'State A']);
  });

  it('keeps the unwritten last state of plan A when another plan is opened', async () => {
    const t0 = Date.parse('2026-03-02T09:00:00Z');
    await push('A1', t0);
    await push('A2', t0 + 10_000); // pending inside the window
    flushSnapshot(); // another document is about to replace plan A
    await push('B', t0 + 20_000);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ring().map(x => x.data.tree[0].name)).toEqual(['State B', 'State A2', 'State A1']);
  });

  it('flushes a pending write on pagehide', async () => {
    const t0 = Date.parse('2026-03-02T09:00:00Z');
    await push(1, t0);
    await push(2, t0 + 10_000);
    expect(ring()).toHaveLength(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(ring()[0].data.tree[0].name).toBe('State 2');
  });

  it('does not throw when the storage quota is exceeded', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(push(1, Date.parse('2026-03-02T09:00:00Z'))).resolves.toBeUndefined();
  });
});
