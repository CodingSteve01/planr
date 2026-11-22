/** @vitest-environment happy-dom */
// The snapshot ring keeps the latest state of an editing burst, holds at most
// 20 slots, and never takes the app down when the storage is full.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEY = 'planr_v2_snapshots';
const plan = n => ({ tree: [{ id: 'P1', name: `State ${n}` }] });
const ring = () => JSON.parse(localStorage.getItem(KEY) || '[]');

let pushSnapshot;
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
    ({ pushSnapshot } = await import('../app/snapshots.js'));
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

  it('keeps the later of two states 30 seconds apart', async () => {
    const t0 = Date.parse('2026-03-02T09:00:00Z');
    await push(1, t0);
    await push(2, t0 + 30_000);
    const slots = ring();
    expect(slots).toHaveLength(1);
    expect(slots[0].data.tree[0].name).toBe('State 2');
  });

  it('does not throw when the storage quota is exceeded', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(push(1, Date.parse('2026-03-02T09:00:00Z'))).resolves.toBeUndefined();
  });
});
