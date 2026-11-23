import { isMarkdownName } from '../utils/fileKind.js';
import { normalizeLoadedData } from '../utils/loadedData.js';
import { parseMdToProject } from '../utils/markdownParse.js';
import { requestHandlePermission } from '../utils/fileHandleStore.js';
import { FILE_READ_TIMEOUT_MS, TimeoutError, withTimeout } from '../utils/withTimeout.js';
import { isValidProjectData } from './shell.js';
import { bindActions } from './actions/bindActions.js';

function loadFile(c, e) {
  const { setData, resetHistory, setSel, setSaved, setFileName, setFileWriteOk, setAutoSave, forgetHandle } = c;
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async ev => {
    try {
      const text = ev.target.result;
      const isMd = isMarkdownName(f.name);
      const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
      if (!d.tree || !Array.isArray(d.tree) || d.tree.length === 0)
        throw new Error(isMd ? 'No work items found in this Markdown file.' : 'Invalid project file.');
      // Set data first, then clean up handle in background
      setData(d);
      resetHistory(); // different document — the old undo stack doesn't apply
      setSel(null);
      setSaved(true);
      setFileName(f.name);
      setFileWriteOk(false);
      setAutoSave(true);
      forgetHandle().catch(() => {});
    } catch (e) {
      alert(e.message || 'Invalid project file.');
    }
  };
  r.readAsText(f);
  e.target.value = '';
}

async function newProject(c) {
  const { forgetHandle, setFileWriteOk, setAutoSave, setSaved, setLastSavedAt, setData, resetHistory, setSel, setModal, setTab } = c;
  await forgetHandle();
  setFileWriteOk(false);
  setAutoSave(true);
  setSaved(true);
  setLastSavedAt(null);
  setData(null);
  resetHistory();
  setSel(null);
  setModal(null);
  setTab('summary');
}

// Restore mounted file after page reload (when bootstrap left us with a handle but no read permission)
async function restoreMountedFile(c) {
  const {
    fileHandleRef,
    diskTextRef,
    ensureHandlePermission,
    setData,
    resetHistory,
    setSel,
    setSaved,
    setLastSavedAt,
    setFileWriteOk,
    setAutoSave,
  } = c;
  const handle = fileHandleRef.current;
  if (!handle) return;
  try {
    const granted = await requestHandlePermission(handle, 'readwrite');
    if (granted !== 'granted') {
      const readOnly = await requestHandlePermission(handle, 'read');
      if (readOnly !== 'granted') return;
    }
    // Bounded: a file that waits for a download must not freeze the button.
    // Nothing is set before the read is back, so a late answer changes nothing.
    const { d, text } = await withTimeout(readHandle(handle), FILE_READ_TIMEOUT_MS, 'read the file');
    setData(d);
    resetHistory(); // different document — the old undo stack doesn't apply
    diskTextRef.current = text; // the baseline for the first poll
    setSel(null);
    setSaved(true);
    setLastSavedAt(new Date());
    const canWrite = await ensureHandlePermission(handle, false);
    setFileWriteOk(canWrite);
    setAutoSave(true);
    return true;
  } catch (e) {
    // Stay on the restore screen: the user can try again or discard the mount.
    // A slow file is worth another try; a broken one is not, so the screen
    // names the cause.
    console.warn('Could not read the mounted file:', e.message || e);
    return e instanceof TimeoutError ? { error: 'timeout' } : { error: 'read', detail: String(e.message || e) };
  }
}

async function readHandle(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const d = normalizeLoadedData(isMarkdownName(handle.name) ? parseMdToProject(text) : JSON.parse(text));
  if (!isValidProjectData(d)) throw new Error('Invalid project file in mounted location.');
  return { d, text };
}

// Putting a different document on screen: from a file input, as a blank
// project, or from the file a host mounted. Each one ends in `resetHistory`.
export function fileLoaders(ctx) {
  return bindActions(ctx, { loadFile, newProject, restoreMountedFile });
}
