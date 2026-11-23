import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadMountedFileHandle } from '../fileHandleStore.js';

afterEach(() => {
  vi.unstubAllGlobals();
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
