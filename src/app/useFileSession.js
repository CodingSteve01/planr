import { useState, useRef, useEffect } from 'react';
import { SK } from '../constants.js';
import { isMarkdownName } from '../utils/fileKind.js';
import { normalizeLoadedData } from '../utils/loadedData.js';
import { parseMdToProject } from '../utils/markdownParse.js';
import {
  clearMountedFileHandle,
  loadMountedFileHandle,
  persistMountedFileHandle,
  queryHandlePermission,
  requestHandlePermission,
} from '../utils/fileHandleStore.js';
import { FILE_READ_TIMEOUT_MS, TimeoutError, withTimeout } from '../utils/withTimeout.js';
import { isValidProjectData, scheduleIdleWrite, cancelIdleWrite } from './shell.js';

// How long the start-up restore may wait in all before the app goes on.
export const RESTORE_TIMEOUT_MS = FILE_READ_TIMEOUT_MS;

export async function ensureHandlePermission(handle, interactive = false) {
  if (!handle) return false;
  if (!interactive) {
    // Non-interactive: only check existing permission, do not prompt
    const permission = await queryHandlePermission(handle, 'readwrite');
    return permission === 'granted';
  }
  // Interactive: try requestPermission directly (preserves Chrome user activation)
  // requestPermission returns 'granted' if already granted, otherwise prompts the user
  const permission = await requestHandlePermission(handle, 'readwrite');
  return permission === 'granted';
}

async function rememberHandleIn({ fileHandleRef, setFileName, hosted, onFileChange }, handle) {
  fileHandleRef.current = handle;
  setFileName(handle?.name || null);
  if (hosted) {
    onFileChange(handle || null);
    return;
  }
  try {
    if (handle) await persistMountedFileHandle(handle);
    else await clearMountedFileHandle();
  } catch (e) {
    console.error('Could not persist mounted file handle:', e);
  }
}

async function forgetHandleIn({ fileHandleRef, setFileName, hosted, onFileChange }) {
  fileHandleRef.current = null;
  setFileName(null);
  if (hosted) {
    onFileChange(null);
    return;
  }
  try {
    await clearMountedFileHandle();
  } catch (e) {
    console.error('Could not clear mounted file handle:', e);
  }
}

async function readMountedProject(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const restored = normalizeLoadedData(isMarkdownName(handle.name) ? parseMdToProject(text) : JSON.parse(text));
  if (!isValidProjectData(restored)) throw new Error('Invalid mounted project file.');
  return { restored, text };
}

async function adoptRestored({ isCancelled, setData, resetHistory, setSel, setFileWriteOk, diskTextRef }, handle, { restored, text }) {
  // Asked (without prompting) before anything is adopted, so the document is
  // taken in one step: a limit hit while waiting here cannot leave it half on
  // screen.
  const canWrite = await ensureHandlePermission(handle, false);
  if (isCancelled()) return;
  setData(restored);
  resetHistory(); // different document — the old undo stack doesn't apply
  // After resetHistory, which forgets it: the text read here is what the first
  // poll measures against, so an edit made outside since then is noticed.
  diskTextRef.current = text;
  setSel(null);
  setFileWriteOk(canWrite);
}

// The steps of the restore. `progress` records the step and the handle as they
// are reached, so the caller knows what was going on if the limit is hit.
// Every write to state is guarded by `isCancelled`, which is also true once the
// limit has been hit: a late answer changes nothing.
async function restoreSteps(c, progress) {
  const { mount, isCancelled, fileHandleRef, setFileName, setFileWriteOk } = c;
  progress.step = 'load the stored file handle';
  const handle = mount || (await loadMountedFileHandle());
  if (!handle || isCancelled()) return;
  progress.handle = handle;
  fileHandleRef.current = handle;
  setFileName(handle.name || null);

  progress.step = 'check the file permission';
  const readPermission = await queryHandlePermission(handle, 'read');
  if (isCancelled()) return;
  // Permission is "prompt" or "denied" → keep filename visible so user can re-grant
  if (readPermission !== 'granted') {
    setFileWriteOk(false);
    return;
  }

  progress.step = 'read the file';
  const read = await readMountedProject(handle);
  if (isCancelled()) return;
  progress.step = 'check the write permission';
  await adoptRestored(c, handle, read);
}

// The limit was hit. With a handle known the user lands on the restore screen;
// the local copy is not the file, so it is taken off the screen (not out of
// storage). Without a handle the app starts as if nothing was mounted.
function giveUpWaiting({ fileHandleRef, setFileName, setFileWriteOk, setData }, progress) {
  const { handle } = progress;
  if (!handle) return;
  fileHandleRef.current = handle;
  setFileName(handle.name || null);
  setFileWriteOk(false);
  setData(null);
}

async function restoreMounted(c) {
  const { hosted, isCancelled, fileHandleRef, setFileName, setBootstrapped } = c;
  let timedOut = false;
  const stale = () => timedOut || isCancelled();
  const progress = { step: 'start', handle: null };
  try {
    // The flag is set by the timer itself, before any step can resume: a read
    // that lands in the same tick as the limit is already stale.
    const hitLimit = () => {
      timedOut = true;
      return progress.step;
    };
    await withTimeout(restoreSteps({ ...c, isCancelled: stale }, progress), RESTORE_TIMEOUT_MS, hitLimit);
  } catch (e) {
    if (e instanceof TimeoutError) {
      timedOut = true;
      console.warn('Mounted file restore gave up waiting:', e.message);
      if (!isCancelled()) giveUpWaiting(c, progress);
    } else {
      console.error('Mounted file restore failed:', e);
      fileHandleRef.current = null;
      if (!isCancelled()) setFileName(null);
      try {
        if (!hosted) await clearMountedFileHandle();
      } catch {}
    }
  } finally {
    if (!isCancelled()) setBootstrapped(true);
  }
}

function useAutoSavePref() {
  const [autoSave, setAutoSave] = useState(() => {
    try {
      const v = localStorage.getItem('planr_autosave');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('planr_autosave', String(autoSave));
    } catch {}
  }, [autoSave]);
  return [autoSave, setAutoSave];
}

function useMountRestore(ctx) {
  useEffect(() => {
    let cancelled = false;
    restoreMounted({ ...ctx, isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, []);
}

// Save to localStorage on every change (fast, in-memory) — separate from file save
function useLocalCache({
  data,
  hosted,
  setSaved,
  setLastSavedAt,
  fileHandleRef,
  fileDataRef,
  scnRef,
  lastWrittenDataRef,
  recordHistoryForLocalSave,
}) {
  useEffect(() => {
    if (!data) return;
    // A hosted instance is one of several: its document is the file, and the
    // shared snapshot key would just be whichever tab typed last. Nothing is
    // cached, so nothing is claimed saved either — the file write says that.
    if (hosted) return;
    // Bail early if `data` is the exact same reference we last wrote — saves
    // a JSON.stringify on the main thread for a project that may be ~100KB.
    // Reference equality is enough because every mutating helper produces a
    // fresh top-level object.
    if (data === lastWrittenDataRef.current) return;
    let idleId = null;
    const t = setTimeout(() => {
      idleId = scheduleIdleWrite(() => {
        // Never the scenario on screen: what is cached is what a file would
        // hold, so a reload opens on the plan with its scenarios intact.
        localStorage.setItem(SK, JSON.stringify(fileDataRef.current));
        lastWrittenDataRef.current = data;
        // localStorage save is always successful → data is "saved" (just maybe not to file yet)
        setSaved(true);
        setLastSavedAt(new Date());
        // Every history-recording path used to hang off a file handle, so with
        // nothing mounted the log stayed empty for ever — which silently took
        // the diff/review window and backdating with it: you could switch
        // backdating on, record a sprint's worth of catching up, and nothing
        // was written anywhere. This is the only persist that happens without
        // a file, so it is where the log has to be written.
        if (!fileHandleRef.current && !scnRef.current) recordHistoryForLocalSave();
      }, 1200);
    }, 800);
    return () => {
      clearTimeout(t);
      if (idleId != null) cancelIdleWrite(idleId);
    };
  }, [data]);
}

// The file a plan is mounted on, and the state that says how it stands: name,
// write permission, whether the disk matches memory. The effects here run in
// the order the `App` body used to run them; the baseline effect that has to
// follow them stays in `App`, and `useFileSync` comes after it.
export function useFileSession(args) {
  const { data, hosted, mount, onFileChange, setData, setSel, setSaved, resetHistory, fileDataRef, scnRef, recordHistoryForLocalSave } =
    args;
  const fileHandleRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [autoSave, setAutoSave] = useAutoSavePref();
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [fileWriteOk, setFileWriteOk] = useState(true);
  const [fileSynced, setFileSynced] = useState(true); // whether the file on disk matches current data
  const lastOwnWriteRef = useRef(0); // timestamp of our last file write (to ignore in poll)
  const lastWrittenDataRef = useRef(null);
  const lastChangeTimeRef = useRef(Date.now());
  // What the file on disk says, as far as Planr knows: what it last wrote or
  // read. A changed modification time with this same text is a sync service
  // touching the file, not somebody changing it.
  const diskTextRef = useRef(null);
  // Rounds in a row a save found the file busy, and the timer for the next.
  const busyRoundsRef = useRef(0);
  const saveRetryTimerRef = useRef(null);
  const handleCtx = { fileHandleRef, setFileName, hosted, onFileChange };
  const rememberHandle = handle => rememberHandleIn(handleCtx, handle);
  const forgetHandle = () => forgetHandleIn(handleCtx);

  useMountRestore({
    mount,
    hosted,
    fileHandleRef,
    diskTextRef,
    setFileName,
    setFileWriteOk,
    setBootstrapped,
    setData,
    resetHistory,
    setSel,
  });
  useLocalCache({
    data,
    hosted,
    setSaved,
    setLastSavedAt,
    fileHandleRef,
    fileDataRef,
    scnRef,
    lastWrittenDataRef,
    recordHistoryForLocalSave,
  });
  // Mark file-out-of-sync whenever data changes
  useEffect(() => {
    if (data) setFileSynced(false);
  }, [data]);
  useEffect(() => {
    if (data) lastChangeTimeRef.current = Date.now();
  }, [data]);

  return {
    fileHandleRef,
    fileName,
    setFileName,
    autoSave,
    setAutoSave,
    lastSavedAt,
    setLastSavedAt,
    bootstrapped,
    fileWriteOk,
    setFileWriteOk,
    fileSynced,
    setFileSynced,
    lastOwnWriteRef,
    lastChangeTimeRef,
    diskTextRef,
    busyRoundsRef,
    saveRetryTimerRef,
    rememberHandle,
    forgetHandle,
    ensureHandlePermission,
  };
}
