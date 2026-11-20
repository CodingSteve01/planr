import { describe, test, expect } from 'vitest';
import { writeWithRetry, stillWritable, isBusy } from '../fileWrite.js';

// A handle whose first `failures` writes throw, the way a file does while a
// sync service has it.
function handle(failures, permission = 'granted') {
  const state = { tries: 0, written: null };
  return {
    state,
    queryPermission: async () => permission,
    createWritable: async () => {
      state.tries++;
      if (state.tries <= failures) throw new DOMException('busy', 'NoModificationAllowedError');
      return { write: async c => { state.written = c; }, close: async () => {} };
    },
  };
}
const noSleep = async () => {};

describe('writing a file a sync service is touching', () => {
  test('a write that fails twice and then works is a write that worked', async () => {
    const h = handle(2);
    await writeWithRetry(h, 'plan', { sleep: noSleep });
    expect(h.state).toEqual({ tries: 3, written: 'plan' });
  });

  test('waits between the attempts, and not before the first', async () => {
    const waits = [];
    const h = handle(2);
    await writeWithRetry(h, 'plan', { delays: [0, 10, 20], sleep: async ms => { waits.push(ms); } });
    expect(waits).toEqual([10, 20]);
  });

  test('gives up with the last error when every attempt fails', async () => {
    const h = handle(9);
    await expect(writeWithRetry(h, 'plan', { sleep: noSleep })).rejects.toThrow('busy');
    expect(h.state.tries).toBe(3);
  });

  test('a busy file is still writable; a lost permission is not', async () => {
    expect(await stillWritable(handle(9))).toBe(true);
    expect(await stillWritable(handle(0, 'prompt'))).toBe(false);
    expect(await stillWritable({ queryPermission: async () => { throw new Error('gone'); } })).toBe(false);
    // A host without the permission API (the plugin's own file object).
    expect(await stillWritable({})).toBe(true);
  });

  test('a file that is gone is reported at once, not waited for', async () => {
    const state = { tries: 0 };
    const gone = { createWritable: async () => { state.tries++; throw new DOMException('gone', 'NotFoundError'); } };
    await expect(writeWithRetry(gone, 'plan', { sleep: noSleep })).rejects.toThrow('gone');
    expect(state.tries).toBe(1);
    expect([isBusy(new DOMException('x', 'NoModificationAllowedError')), isBusy(new DOMException('x', 'NotFoundError')), isBusy(new DOMException('x', 'NotAllowedError')), isBusy(new DOMException('x', 'InvalidStateError')), isBusy(null)])
      .toEqual([true, false, false, false, false]);
  });

  test('a stream that failed half way is thrown away before the next attempt', async () => {
    const aborted = [];
    let tries = 0;
    const h = { createWritable: async () => {
      const n = ++tries;
      return { write: async () => { if (n === 1) throw new DOMException('busy', 'NoModificationAllowedError'); }, close: async () => {}, abort: async () => { aborted.push(n); } };
    } };
    await writeWithRetry(h, 'plan', { sleep: noSleep });
    expect(aborted).toEqual([1]);
    expect(tries).toBe(2);
  });
});
