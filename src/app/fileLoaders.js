import { normalizeLoadedData } from '../utils/loadedData.js';
import { parseMdToProject } from '../utils/markdownParse.js';
import { requestHandlePermission } from '../utils/fileHandleStore.js';
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
      const isMd = f.name.endsWith('.md');
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
    ensureHandlePermission,
    forgetHandle,
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
    const file = await handle.getFile();
    const text = await file.text();
    const d = normalizeLoadedData(handle.name?.endsWith('.md') ? parseMdToProject(text) : JSON.parse(text));
    if (!isValidProjectData(d)) throw new Error('Invalid project file in mounted location.');
    setData(d);
    resetHistory(); // different document — the old undo stack doesn't apply
    setSel(null);
    setSaved(true);
    setLastSavedAt(new Date());
    const canWrite = await ensureHandlePermission(handle, false);
    setFileWriteOk(canWrite);
    setAutoSave(true);
  } catch (e) {
    alert('Could not restore mounted file: ' + (e.message || e));
    await forgetHandle();
  }
}

// Putting a different document on screen: from a file input, as a blank
// project, or from the file a host mounted. Each one ends in `resetHistory`.
export function fileLoaders(ctx) {
  return bindActions(ctx, { loadFile, newProject, restoreMountedFile });
}
