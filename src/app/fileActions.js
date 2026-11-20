import { normalizeLoadedData } from '../utils/loadedData.js';
import { parseMdToProject } from '../utils/markdownParse.js';
import { isBusy, MAX_BUSY_ROUNDS, stillWritable, writeWithRetry } from '../utils/fileWrite.js';
import { inIdsOf } from '../utils/dayLog.js';
import { exportJSON } from '../utils/exports.js';
import { filePickerAvailable, pickFileToOpen, pickFileToSave } from '../utils/filePickers.js';
import { pushSnapshot } from './snapshots.js';
import { ensureHandlePermission } from './useFileSession.js';

// Plain functions over a context object that `useFileSync` builds on every
// render, so each one sees the same values the component body would have.

// Auto-save timer body: write the file once the debounce has run out.
export async function runAutoSave(c) {
  const handle = c.fileHandleRef.current;
  if (!handle) return;
  const canWrite = await ensureHandlePermission(handle, false);
  if (!canWrite) {
    c.setFileWriteOk(false);
    return;
  }
  c.setSaving(true);
  try {
    const { content, ...composed } = c.composeFileForSave();
    await writeWithRetry(handle, content);
    c.diskTextRef.current = content;
    c.busyRoundsRef.current = 0;
    c.setFileWriteOk(true);
    c.setFileSynced(true);
    c.lastOwnWriteRef.current = Date.now();
    c.setLastSavedAt(new Date());
    // Snapshot ring tracks file-save events, throttled internally.
    pushSnapshot(c.fileDataRef.current);
    c.commitSaveSideEffects(composed);
  } catch (e) {
    console.error('Auto-save failed:', e);
    // The file is busy (a sync service uploading it), not gone: keep the
    // handle and try again shortly. Only a lost permission asks for the
    // file to be picked again.
    c.busyRoundsRef.current += 1;
    if (isBusy(e) && c.busyRoundsRef.current <= MAX_BUSY_ROUNDS && (await stillWritable(handle))) {
      clearTimeout(c.saveRetryTimerRef.current);
      c.saveRetryTimerRef.current = setTimeout(() => c.setSaveRetry(n => n + 1), 15000);
    } else c.setFileWriteOk(false);
  } finally {
    c.setSaving(false);
  }
}

// One tick of the external-change poll. NEVER auto-loads: it only notices.
export async function pollDisk(c) {
  try {
    const file = await c.fileHandleRef.current.getFile();
    const mod = file.lastModified;
    // Skip if this is our own write (within 3s window)
    const isOwnWrite = Date.now() - c.lastOwnWriteRef.current < 3000;
    if (c.diskTextRef.current == null) c.diskTextRef.current = await file.text();
    else if (c.lastModRef.current && mod > c.lastModRef.current && !isOwnWrite) {
      // Only a different text is a change. A sync service bumps the time
      // on its own.
      if ((await file.text()) !== c.diskTextRef.current) c.setExternalChangeAvailable(true);
    }
    c.lastModRef.current = mod;
  } catch {}
}

export async function reloadFromFile(c) {
  try {
    const file = await c.fileHandleRef.current.getFile();
    const text = await file.text();
    const isMd = file.name.endsWith('.md');
    const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
    if (d?.tree && Array.isArray(d.tree) && d.tree.length > 0) {
      // What changed outside Planr belongs to the day it was picked up.
      // The plan as it was last saved here stays what the next save measures
      // against (in the ids this load handed out), and the status baseline
      // stays too, so the difference is recorded as a change of today.
      // What was edited here and not saved is gone with the reload and is
      // not part of that.
      const before = c.pastRef.current || c.scnRef.current ? null : c.lastSavedPlanRef.current;
      c.setData(d);
      c.resetHistory(); // reloaded from disk — treat as a fresh document
      if (before && c.lastSavedLeavesRef.current) {
        c.lastSavedPlanRef.current = inIdsOf(before, d);
        c.leafBaselineStaleRef.current = false;
      }
      // After resetHistory, which forgets what the previous document said.
      c.diskTextRef.current = text;
      c.setLastSavedAt(new Date(file.lastModified));
      c.lastModRef.current = file.lastModified;
      c.setSaved(true);
      c.setFileSynced(true);
    }
  } catch (e) {
    console.error('Reload failed:', e);
  }
  c.setExternalChangeAvailable(false);
}

// Pick a fresh file handle via Save-As dialog, suggesting the previous filename.
// Used as fallback when the existing handle's permission/write fails after a reload.
async function pickSaveHandle(c, suggestedFromName) {
  if (!filePickerAvailable()) {
    exportJSON();
    return null;
  }
  const { meta = {} } = c.data; // `App` has not derived its own `meta` yet when this hook is called
  const fallbackSlug = (meta.name || 'project').toLowerCase().replace(/\s+/g, '-');
  const suggested = suggestedFromName || `${fallbackSlug}.planr.json`;
  const isMd = suggested.endsWith('.md');
  return await pickFileToSave({
    suggestedName: suggested,
    types: isMd
      ? [
          { description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
          { description: 'Planr JSON', accept: { 'application/json': ['.json'] } },
        ]
      : [
          { description: 'Planr JSON', accept: { 'application/json': ['.json'] } },
          { description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
        ],
  });
}

// Write content to a handle (caller already has write permission)
async function writeToHandle(c, handle, content) {
  await writeWithRetry(handle, content);
  c.diskTextRef.current = content;
  c.busyRoundsRef.current = 0;
}

// The handle to write to, or null when the save ends here.
async function resolveSaveHandle(c, handle, previousFileName) {
  // Path A: no handle yet → open Save-As picker right away
  if (!handle) return pickSaveHandle(c, previousFileName); // null: exportJSON path or aborted
  // Path B: have a handle → request permission interactively
  const canWrite = await ensureHandlePermission(handle, true);
  if (canWrite) return handle;
  // Permission denied/failed → offer Save-As fallback so the user can re-mount
  // (this is critical after page reload when permissions reset)
  const ok = confirm(
    'File access was not granted by the browser. Click OK to choose where to save (suggesting the original location), or Cancel to skip.',
  );
  if (!ok) {
    c.setFileWriteOk(false);
    return null;
  }
  const picked = await pickSaveHandle(c, previousFileName);
  if (!picked) c.setFileWriteOk(false);
  return picked;
}

// If the write fails because the handle is gone, offer Save-As once more.
// True when that offer was taken up (and so the error is dealt with).
async function retryWithNewHandle(c, e, previousFileName) {
  const retry = confirm(
    `Save failed: ${e.message || e.name}\n\nThe file may have been moved or access was revoked. Click OK to choose where to save (suggesting the original location), or Cancel to skip.`,
  );
  if (!retry) return false;
  try {
    const handle2 = await pickSaveHandle(c, previousFileName);
    if (!handle2) return true;
    const { content, ...composed } = c.composeFileForSave();
    await writeToHandle(c, handle2, content);
    await c.rememberHandle(handle2);
    c.setAutoSave(true);
    c.setFileWriteOk(true);
    c.setFileSynced(true);
    c.setSaved(true);
    c.setLastSavedAt(new Date());
    c.commitSaveSideEffects(composed);
  } catch (e2) {
    if (e2.name !== 'AbortError') alert('Save still failed: ' + (e2.message || e2.name));
  }
  return true;
}

async function handleSaveError(c, e, previousFileName) {
  if (e.name === 'AbortError') return; // user cancelled file picker
  console.error('Save failed:', e);
  // If write fails (handle invalid, file moved/deleted), offer Save-As fallback
  const isInvalidHandle = e.name === 'NotFoundError' || e.name === 'NotAllowedError' || e.name === 'InvalidStateError';
  if (isInvalidHandle && (await retryWithNewHandle(c, e, previousFileName))) return;
  c.setFileWriteOk(false);
  alert('Could not save: ' + (e.message || e.name || 'unknown error'));
}

// Save to file (File System Access API). On failure, fall back to Save-As with previous filename.
export async function saveToFile(c, saveAs) {
  if (!c.data) return;
  const previousFileName = c.fileName; // remember for fallback suggestion
  try {
    const handle = await resolveSaveHandle(c, saveAs ? null : c.fileHandleRef.current, previousFileName);
    if (!handle) return;
    const { content, ...composed } = c.composeFileForSave();
    await writeToHandle(c, handle, content);
    c.lastOwnWriteRef.current = Date.now();
    await c.rememberHandle(handle);
    c.setAutoSave(true);
    c.setFileWriteOk(true);
    c.setFileSynced(true);
    c.setSaved(true);
    c.setLastSavedAt(new Date());
    // Persist a JSON snapshot tied to a real file write — recovery scenarios
    // care about state that landed on disk, not every keystroke. Throttled
    // internally to ≥60s so manual rapid saves don't churn the ring.
    pushSnapshot(c.fileDataRef.current);
    c.commitSaveSideEffects(composed);
  } catch (e) {
    await handleSaveError(c, e, previousFileName);
  }
}

export async function loadFromFile(c) {
  try {
    if (!filePickerAvailable()) {
      c.fRef.current?.click();
      return;
    }
    const handle = await pickFileToOpen({
      types: [
        { description: 'Planr Project', accept: { 'application/json': ['.json'] } },
        { description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
      ],
    });
    const file = await handle.getFile();
    const text = await file.text();
    const isMd = handle.name.endsWith('.md');
    const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
    if (!d.tree || !Array.isArray(d.tree) || d.tree.length === 0)
      throw new Error(
        isMd
          ? 'No work items found in this Markdown file. Expected format: bullet list with **ID** Name entries under a "## Work Tree" heading.'
          : 'Invalid JSON project file — no tree items found.',
      );
    // Apply data immediately — don't block on file write permission
    await c.rememberHandle(handle);
    c.setData(d);
    c.resetHistory(); // different document — the old undo stack doesn't apply
    c.setSel(null);
    c.setSaved(true);
    c.setLastSavedAt(new Date());
    // Try to establish write permission (non-blocking for UI update)
    const canWrite = await ensureHandlePermission(handle, true);
    c.setFileWriteOk(canWrite);
    c.setAutoSave(true);
  } catch (e) {
    if (e.name !== 'AbortError') alert('Could not load file: ' + e.message);
  }
}
