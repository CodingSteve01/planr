import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout } from '../withTimeout.js';

afterEach(() => {
  vi.useRealTimers();
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
