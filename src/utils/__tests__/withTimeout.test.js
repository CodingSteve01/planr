import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout } from '../withTimeout.js';
import { loadMountedFileHandle } from '../fileHandleStore.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('withTimeout', () => {
  it('passes the value of a promise that settles in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 'read')).resolves.toBe(7);
  });

  it('rejects with an error that names the step when the promise never settles', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 500, 'read the file');
    const seen = p.catch(e => e);
    await vi.advanceTimersByTimeAsync(500);
    const err = await seen;
    expect(err.name).toBe('TimeoutError');
    expect(err.message).toContain('read the file');
  });

  it('passes on the rejection of a promise that fails in time', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'read')).rejects.toThrow('boom');
  });
});

describe('opening the handle database', () => {
  it('rejects when another tab blocks the open', async () => {
    const req = {};
    vi.stubGlobal('indexedDB', { open: () => req });
    const p = loadMountedFileHandle();
    const seen = p.catch(e => e);
    await Promise.resolve();
    req.onblocked();
    expect((await seen).message).toMatch(/blocked/i);
  });
});
