/** @vitest-environment happy-dom */
// The snapshot ring keeps the latest state of an editing burst per document
// source, holds at most 20 slots, and never takes the app down when the
// storage is full.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEY = 'planr_v2_snapshots';
const plan = n => ({ tree: [{ id: 'P1', name: `State ${n}` }] });
const ring = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const names = () => ring().map(x => x.data.tree[0].name);

const SRC = { name: 'source A' };
const SRC_B = { name: 'source B' };
const T0 = Date.parse('2026-03-02T09:00:00Z');

let pushSnapshot;
let takeSnapshotNow;
let flushSnapshot;
async function push(n, atMs, source = SRC) {
  vi.setSystemTime(atMs);
  pushSnapshot(plan(n), source);
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
    for (let i = 0; i < 25; i++) await push(i, T0 + i * 61_000);
    const slots = ring();
    expect(slots).toHaveLength(20);
    expect(slots[0].data.tree[0].name).toBe('State 24');
    expect(slots[19].data.tree[0].name).toBe('State 5');
  });

  it('adds the later of two states 30 seconds apart as a new slot at the window end', async () => {
    await push(1, T0);
    await push(2, T0 + 30_000);
    expect(ring()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(names()).toEqual(['State 2', 'State 1']);
  });

  it('writes at most once per 60 s in a 2 minute burst and ends on the last state', async () => {
    vi.setSystemTime(T0);
    for (let i = 0; i < 24; i++) {
      pushSnapshot(plan(i), SRC);
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
    vi.setSystemTime(T0);
    pushSnapshot(plan(1), SRC);
    await vi.advanceTimersByTimeAsync(1_000);
    takeSnapshotNow(plan(2), SRC);
    await vi.advanceTimersByTimeAsync(5_000);
    pushSnapshot(plan(3), SRC);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(names()).toEqual(['State 3', 'State 2', 'State 1']);
  });

  it('writes the defensive snapshot at once, inside the throttle window', async () => {
    vi.setSystemTime(T0);
    pushSnapshot(plan(1), SRC);
    await vi.advanceTimersByTimeAsync(10);
    takeSnapshotNow(plan(2), SRC);
    expect(ring()[0].data.tree[0].name).toBe('State 2');
  });

  it('keeps the last state of both sources when B pushes 5 s after A inside the window', async () => {
    await push('A1', T0);
    await push('A2', T0 + 10_000); // pending for A
    await push('B1', T0 + 20_000, SRC_B);
    await push('B2', T0 + 25_000, SRC_B); // pending for B, 5 s later
    await vi.advanceTimersByTimeAsync(120_000);
    expect(names()).toContain('State A2');
    expect(names()).toContain('State B2');
  });

  it('keeps the unwritten last state of plan A when another plan is opened', async () => {
    await push('A1', T0);
    await push('A2', T0 + 10_000); // pending inside the window
    flushSnapshot(SRC); // another document is about to replace plan A
    await push('B', T0 + 20_000);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(names()).toEqual(['State B', 'State A2', 'State A1']);
  });

  it('flushes only the source that is asked for', async () => {
    await push('A1', T0);
    await push('A2', T0 + 1_000);
    await push('B1', T0 + 2_000, SRC_B);
    await push('B2', T0 + 3_000, SRC_B);
    flushSnapshot(SRC_B);
    expect(names()).toEqual(['State B2', 'State B1', 'State A1']);
  });

  it('writes the older pending state below the defensive slot on a restore', async () => {
    await push(1, T0);
    await push(2, T0 + 10_000); // pending, older than the current state
    takeSnapshotNow(plan(3), SRC);
    flushSnapshot(SRC); // the restore's document change
    expect(names()).toEqual(['State 3', 'State 2', 'State 1']);
  });

  it('drops the pending state when it equals the defensive one', async () => {
    await push(1, T0);
    await push(2, T0 + 10_000);
    takeSnapshotNow(plan(2), SRC);
    flushSnapshot(SRC);
    expect(names()).toEqual(['State 2', 'State 1']);
  });

  it('removes its pagehide listener once nothing is pending', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    await push(1, T0);
    await push(2, T0 + 10_000);
    await vi.advanceTimersByTimeAsync(120_000);
    const count = spy => spy.mock.calls.filter(c => c[0] === 'pagehide').length;
    expect(count(add)).toBeGreaterThan(0);
    expect(count(remove)).toBe(count(add));
  });

  it('flushes a pending write on pagehide', async () => {
    await push(1, T0);
    await push(2, T0 + 10_000);
    expect(ring()).toHaveLength(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(ring()[0].data.tree[0].name).toBe('State 2');
  });

  it('flushes the pending states of all sources on pagehide', async () => {
    await push('A1', T0);
    await push('A2', T0 + 1_000);
    await push('B1', T0 + 2_000, SRC_B);
    await push('B2', T0 + 3_000, SRC_B);
    window.dispatchEvent(new Event('pagehide'));
    expect(names()).toContain('State A2');
    expect(names()).toContain('State B2');
  });

  it('does not throw when the storage quota is exceeded', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(push(1, T0)).resolves.toBeUndefined();
  });
});
