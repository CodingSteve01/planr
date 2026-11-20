// Writing a plan file that a sync service is also touching.
//
// A synced folder locks a file for a moment while it uploads, and bumps its
// modification time without changing a byte. Both used to look like trouble:
// one failed write asked for the file to be picked again, and every touch
// announced that the file had changed.

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Errors that pass on their own: the file is locked or was changed under the
// handle. A file that is gone, or a permission that was taken away, is not
// one of them, and trying again only delays saying so.
const BUSY = new Set(['NoModificationAllowedError', 'InvalidStateError', 'InvalidModificationError', 'AbortError', 'TimeoutError', 'OperationError', 'UnknownError']);
export const isBusy = error => BUSY.has(error?.name);

// Write, and try again after a pause while the file is busy. Throws the last
// error when every attempt failed, and at once for any other error.
export async function writeWithRetry(handle, content, { delays = [0, 1200, 3500], sleep = wait } = {}) {
  let last;
  for (const delay of delays) {
    if (delay) await sleep(delay);
    let writable = null;
    try {
      writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (e) {
      last = e;
      // A half-written stream leaves a swap file beside the plan.
      try { await writable?.abort?.(); } catch { /* already closed */ }
      if (!isBusy(e)) throw e;
    }
  }
  throw last;
}

// Is the handle still allowed to write? A failed write with the permission
// intact is the file being busy, not the file being gone.
export async function stillWritable(handle) {
  try { return !handle.queryPermission || (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; }
  catch { return false; }
}

// How often a busy file is waited for before the save is reported as failed.
export const MAX_BUSY_ROUNDS = 6;
