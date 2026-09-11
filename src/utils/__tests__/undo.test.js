import { describe, expect, test, vi } from 'vitest';
import { createHistory, push, undo, redo, canUndo, canRedo } from '../undo.js';

describe('createHistory', () => {
  test('starts empty — nothing to undo or redo', () => {
    const h = createHistory();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
  });

  test('defaults the cap to 100', () => {
    expect(createHistory().limit).toBe(100);
  });

  test('accepts a custom limit', () => {
    expect(createHistory({ limit: 5 }).limit).toBe(5);
  });
});

describe('push', () => {
  test('records a snapshot and makes undo available', () => {
    const h0 = createHistory();
    const h1 = push(h0, { v: 1 });
    expect(canUndo(h1)).toBe(true);
    expect(h1.past).toEqual([{ v: 1 }]);
  });

  test('accumulates snapshots in order across several pushes', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    h = push(h, { v: 2 });
    h = push(h, { v: 3 });
    expect(h.past).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
  });

  test('clears the redo stack', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    const afterUndo = undo(h, { v: 2 });
    expect(canRedo(afterUndo.history)).toBe(true);
    const afterPush = push(afterUndo.history, { v: 3 });
    expect(canRedo(afterPush)).toBe(false);
    expect(afterPush.future).toEqual([]);
  });

  test('never mutates the object passed in as a snapshot', () => {
    const snap = { v: 1, tree: [{ id: 'P1' }] };
    const h = push(createHistory(), snap);
    expect(h.past[0]).toBe(snap); // same reference — no cloning
    expect(snap).toEqual({ v: 1, tree: [{ id: 'P1' }] });
  });

  test('caps the stack at `limit`, dropping the oldest first', () => {
    let h = createHistory({ limit: 3 });
    for (let i = 1; i <= 5; i++) h = push(h, { v: i });
    expect(h.past).toEqual([{ v: 3 }, { v: 4 }, { v: 5 }]);
  });
});

describe('push coalescing', () => {
  test('pushes within coalesceMs of the previous push collapse into one entry', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      let h = createHistory();
      h = push(h, { v: 0 }, { coalesceMs: 300 }); // burst starts — records the pre-burst state
      vi.setSystemTime(50);
      h = push(h, { v: 1 }, { coalesceMs: 300 }); // coalesced
      vi.setSystemTime(120);
      h = push(h, { v: 2 }, { coalesceMs: 300 }); // coalesced
      vi.setSystemTime(200);
      h = push(h, { v: 3 }, { coalesceMs: 300 }); // coalesced
      expect(h.past).toEqual([{ v: 0 }]);
      expect(canUndo(h)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a push after the coalesce window starts a new entry', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      let h = createHistory();
      h = push(h, { v: 0 }, { coalesceMs: 300 });
      vi.setSystemTime(500); // past the window
      h = push(h, { v: 1 }, { coalesceMs: 300 });
      expect(h.past).toEqual([{ v: 0 }, { v: 1 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('coalesceMs: 0 (or omitted) never coalesces, even for back-to-back pushes', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      let h = createHistory();
      h = push(h, { v: 0 });
      h = push(h, { v: 1 });
      h = push(h, { v: 2 });
      expect(h.past).toEqual([{ v: 0 }, { v: 1 }, { v: 2 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a redo branch is still cleared by a coalesced push', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      let h = createHistory();
      h = push(h, { v: 0 }, { coalesceMs: 300 });
      const afterUndo = undo(h, { v: 1 });
      expect(canRedo(afterUndo.history)).toBe(true);
      vi.setSystemTime(50);
      const afterCoalescedPush = push(afterUndo.history, { v: 5 }, { coalesceMs: 300 });
      expect(canRedo(afterCoalescedPush)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('undo resets the coalescing window so the next edit is never merged into a stale burst', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      let h = createHistory();
      h = push(h, { v: 0 }, { coalesceMs: 300 });
      const afterUndo = undo(h, { v: 1 });
      vi.setSystemTime(10); // well within 300ms of the last push
      const afterPush = push(afterUndo.history, { v: 2 }, { coalesceMs: 300 });
      // Must be recorded as its own entry, not merged away.
      expect(afterPush.past).toEqual([{ v: 2 }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('undo', () => {
  test('is a no-op on an empty history', () => {
    const h = createHistory();
    const result = undo(h, { v: 'current' });
    expect(result.snapshot).toBeUndefined();
    expect(result.history).toBe(h);
  });

  test('returns the most recently pushed snapshot and pops it off `past`', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    h = push(h, { v: 2 });
    const result = undo(h, { v: 'current' });
    expect(result.snapshot).toEqual({ v: 2 });
    expect(result.history.past).toEqual([{ v: 1 }]);
  });

  test('pushes the current state onto `future` so redo can restore it', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    const result = undo(h, { v: 'current' });
    expect(result.history.future).toEqual([{ v: 'current' }]);
    expect(canRedo(result.history)).toBe(true);
  });

  test('without a current value, still undoes but leaves `future` untouched', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    const result = undo(h);
    expect(result.snapshot).toEqual({ v: 1 });
    expect(result.history.future).toEqual([]);
  });

  test('repeated undo walks all the way back through the stack', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    h = push(h, { v: 2 });
    h = push(h, { v: 3 });
    let cur = { v: 'current' };
    let r = undo(h, cur); expect(r.snapshot).toEqual({ v: 3 }); cur = r.snapshot; h = r.history;
    r = undo(h, cur); expect(r.snapshot).toEqual({ v: 2 }); cur = r.snapshot; h = r.history;
    r = undo(h, cur); expect(r.snapshot).toEqual({ v: 1 }); h = r.history;
    expect(canUndo(h)).toBe(false);
  });
});

describe('redo', () => {
  test('is a no-op with nothing to redo', () => {
    const h = createHistory();
    const result = redo(h, { v: 'current' });
    expect(result.snapshot).toBeUndefined();
    expect(result.history).toBe(h);
  });

  test('restores the state that was just undone', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    const afterUndo = undo(h, { v: 2 });
    const afterRedo = redo(afterUndo.history, afterUndo.snapshot);
    expect(afterRedo.snapshot).toEqual({ v: 2 });
    expect(canRedo(afterRedo.history)).toBe(false);
    expect(canUndo(afterRedo.history)).toBe(true);
  });

  test('undo → redo → undo round-trips cleanly', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    const u1 = undo(h, { v: 2 });
    const r1 = redo(u1.history, u1.snapshot);
    const u2 = undo(r1.history, r1.snapshot);
    expect(u2.snapshot).toEqual({ v: 1 });
    expect(u2.history.future).toEqual([{ v: 2 }]);
  });

  test('a fresh edit after undo clears the redo branch (push, not redo, wins)', () => {
    let h = createHistory();
    h = push(h, { v: 1 });
    const afterUndo = undo(h, { v: 2 });
    expect(canRedo(afterUndo.history)).toBe(true);
    const afterEdit = push(afterUndo.history, afterUndo.snapshot === undefined ? { v: 1 } : { v: 1 });
    // Whatever new edit comes in, it appends to past and drops the redo branch.
    expect(canRedo(afterEdit)).toBe(false);
  });
});

describe('canUndo / canRedo', () => {
  test('tolerate a null/undefined history without throwing', () => {
    expect(canUndo(undefined)).toBe(false);
    expect(canRedo(null)).toBe(false);
  });
});
