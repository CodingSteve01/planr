// Writing a plan file that a sync service is also touching.
//
// A synced folder locks a file for a moment while it uploads, and bumps its
// modification time without changing a byte. Both used to look like trouble:
// one failed write asked for the file to be picked again, and every touch
// announced that the file had changed.

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Write, and try again after a pause when it fails. Throws the last error
// when every attempt failed.
export async function writeWithRetry(handle, content, { delays = [0, 1200, 3500], sleep = wait } = {}) {
  let last;
  for (const delay of delays) {
    if (delay) await sleep(delay);
    try {
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (e) { last = e; }
  }
  throw last;
}

// Is the handle still allowed to write? A failed write with the permission
// intact is the file being busy, not the file being gone.
export async function stillWritable(handle) {
  try { return !handle.queryPermission || (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; }
  catch { return false; }
}
