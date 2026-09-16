// Build-time replacement for src/utils/fileHandleStore.js.
//
// The web build parks a FileSystemFileHandle in IndexedDB so the last-opened
// file comes back after a reload, and asks the browser whether the handle may
// still be read or written. Neither applies here: a vault handle is a path
// (not structured-cloneable — it carries methods), and a file inside the open
// vault needs no permission grant. Same module shape, so nothing in the app
// has to know which one it got.

import { getMountedPath, handleForPath, setMountedPath } from './vaultFs.js';

export async function persistMountedFileHandle(handle) {
  if (!handle?.path) return;
  setMountedPath(handle.path);
}

export async function loadMountedFileHandle() {
  const path = getMountedPath();
  if (!path) return null;
  const handle = handleForPath(path);
  // Deleted, renamed, or not synced down yet — report "nothing mounted"
  // rather than handing back a handle whose every call throws.
  try { await handle.getFile(); } catch { return null; }
  return handle;
}

export async function clearMountedFileHandle() {
  setMountedPath(null);
}

export async function queryHandlePermission() { return 'granted'; }

export async function requestHandlePermission() { return 'granted'; }
