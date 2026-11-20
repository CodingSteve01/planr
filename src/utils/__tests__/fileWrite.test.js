import { describe, test, expect } from 'vitest';
import { writeWithRetry, stillWritable } from '../fileWrite.js';

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
});
