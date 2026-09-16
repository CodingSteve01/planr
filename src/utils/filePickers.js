// Choosing a file to open, and a place to save one.
//
// On the web this is the File System Access API, and the answer is a
// FileSystemFileHandle. A host that keeps its files somewhere else — the
// Obsidian plugin, whose files live in the vault — replaces this module at
// build time and returns its own handles.
//
// It is a module rather than a patched `window.showSaveFilePicker` on purpose:
// a plugin that redefines a browser global changes what every other plugin in
// the app sees, and "we put it back on unload" is not an argument, it is a
// promise. Whoever needs different behaviour gets a different module.
export function filePickerAvailable() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/** One handle, or a rejection with `AbortError` when the user backs out. */
export async function pickFileToOpen(options) {
  const [handle] = await window.showOpenFilePicker(options);
  return handle;
}

export async function pickFileToSave(options) {
  return window.showSaveFilePicker(options);
}
