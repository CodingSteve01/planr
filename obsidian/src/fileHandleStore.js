// Build-time replacement for src/utils/fileHandleStore.js.
//
// The web build parks a FileSystemFileHandle in IndexedDB so the last-opened
// file comes back after a reload, and asks the browser whether that handle may
// still be read or written. Neither question arises here. Which plan a tab is
// editing is the tab's business — Obsidian hands the view its file and
// restores it with the workspace — and a file inside the open vault needs no
// permission grant. Same module shape, so nothing in the app has to know which
// one it got; the answers are simply "nothing remembered" and "yes".

export async function persistMountedFileHandle() {}

export async function loadMountedFileHandle() { return null; }

export async function clearMountedFileHandle() {}

export async function queryHandlePermission() { return 'granted'; }

export async function requestHandlePermission() { return 'granted'; }
