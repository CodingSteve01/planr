import { useState, useRef, useEffect } from 'react';
import { runAutoSave, pollDisk, reloadFromFile, saveToFile, loadFromFile } from './fileActions.js';

export const SAVE_DEBOUNCE_MS = 5000;

// Auto-save: debounced N seconds after the last change. Each new change
// resets the timer, so rapid edits coalesce into a single write.
// Manual force-save via the disk icon (saveToFile) bypasses this.
function useAutoSave(ctx, { data, autoSave, fileSynced, saveRetry }) {
  useEffect(() => () => clearTimeout(ctx.saveRetryTimerRef.current), []);
  useEffect(() => {
    if (!data || !autoSave || !ctx.fileHandleRef.current || fileSynced) return;
    const t = setTimeout(() => runAutoSave(ctx), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [data, autoSave, fileSynced, saveRetry]);
}

// 1-second tick to drive the live countdown. Only ticks while there's something to wait for.
function useSaveCountdown({ fileSynced, autoSave, fileHandleRef, lastChangeTimeRef }) {
  const [, setSaveTick] = useState(0);
  useEffect(() => {
    if (fileSynced || !autoSave || !fileHandleRef.current) return;
    const i = setInterval(() => setSaveTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [fileSynced, autoSave]);
  return !fileSynced && autoSave && fileHandleRef.current
    ? Math.max(0, Math.ceil((lastChangeTimeRef.current + SAVE_DEBOUNCE_MS - Date.now()) / 1000))
    : 0;
}

// Detect external file changes (poll every 5s). NEVER auto-load — only notify.
// Writing is one-way (app → file). When the file changes externally, show a prompt
// so the user decides whether to reload. Auto-loading was destructive: external edits
// (or file-system sync hiccups) silently overwrote in-memory state.
function useExternalChangePoll(ctx, fileName) {
  useEffect(() => {
    if (!ctx.fileHandleRef.current) return;
    const poll = setInterval(() => pollDisk(ctx), 5000);
    return () => clearInterval(poll);
  }, [fileName]);
}

// Guard: warn on browser close/reload with unsaved changes
function useUnsavedGuard(saved) {
  useEffect(() => {
    const h = e => {
      if (!saved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saved]);
}

// Writing the plan to its file and reading it back. Called after the baseline
// effect in `App`, in the place where these effects used to sit.
export function useFileSync(args) {
  const { data, session, saved } = args;
  const { fileName, autoSave, fileSynced, fileHandleRef, lastChangeTimeRef } = session;
  const [saving, setSaving] = useState(false);
  // Bumped to run the autosave again after a write that failed on a busy file.
  const [saveRetry, setSaveRetry] = useState(0);
  const lastModRef = useRef(null);
  const [externalChangeAvailable, setExternalChangeAvailable] = useState(false);
  const ctx = { ...args, ...session, lastModRef, setSaving, setSaveRetry, setExternalChangeAvailable };

  useAutoSave(ctx, { data, autoSave, fileSynced, saveRetry });
  const saveCountdown = useSaveCountdown({ fileSynced, autoSave, fileHandleRef, lastChangeTimeRef });
  useExternalChangePoll(ctx, fileName);
  useUnsavedGuard(saved);

  return {
    saving,
    saveCountdown,
    externalChangeAvailable,
    setExternalChangeAvailable,
    reloadFromFile: () => reloadFromFile(ctx),
    saveToFile: saveAs => saveToFile(ctx, saveAs),
    loadFromFile: () => loadFromFile(ctx),
  };
}
