import { useState, useMemo, useRef, useEffect } from 'react';
import { SK } from './constants.js';
import { iso, normalizeVacation } from './utils/date.js';
import { useT } from './i18n.jsx';
import { exportJSON, exportNetworkPNG, exportGanttPNG, exportSprintMarkdown, exportMermaid, exportReport } from './utils/exports.js';
import { DEFAULT_CUSTOM_FIELDS } from './utils/customFields.js';
import { buildMarkdownText as _buildMd } from './utils/markdown.js';
import { buildHMap, computeNRW } from './utils/holidays.js';
import { schedule, treeStats, enrichParentSchedules, nextChildId, deriveParentStatuses, leafNodes, isLeafNode, pt, computeConfidence } from './utils/scheduler.js';
import { instantiateTemplatePhases, parsePhaseToken, parseTemplatePhaseLine, phaseTeamIds } from './utils/phases.js';
import { cpm, goalCpm } from './utils/cpm.js';
import { clearMountedFileHandle, loadMountedFileHandle, persistMountedFileHandle, queryHandlePermission, requestHandlePermission } from './utils/fileHandleStore.js';
import { Tour } from './components/shared/Tour.jsx';
import { TreeView } from './components/views/TreeView.jsx';
import { QuickEdit } from './components/views/QuickEdit.jsx';
import { GanttView } from './components/views/GanttView.jsx';
import { NetGraph } from './components/views/NetGraph.jsx';
import { ResView } from './components/views/ResView.jsx';
import { HolView } from './components/views/HolView.jsx';
import { SumView } from './components/views/SumView.jsx';
import { PlanReview } from './components/views/PlanReview.jsx';
import { Onboard } from './components/views/Onboard.jsx';
import { NodeModal } from './components/modals/NodeModal.jsx';
import { AddModal } from './components/modals/AddModal.jsx';
import { SettingsModal } from './components/modals/SettingsModal.jsx';
import { NewProjModal } from './components/modals/NewProjModal.jsx';
import { EstimationWizard } from './components/modals/EstimationWizard.jsx';
import { JiraExportModal } from './components/modals/JiraExportModal.jsx';
import { SearchSelect } from './components/shared/SearchSelect.jsx';
import { LazyInput } from './components/shared/LazyInput.jsx';
import { HoverTipProvider } from './components/shared/HoverTip.jsx';

function loadLocalProject() {
  try {
    const s = localStorage.getItem(SK);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function isValidProjectData(value) {
  return value && Array.isArray(value.tree);
}

// Build unique short-name map for members (initials, with collision suffixes on ALL collisions)
export function buildMemberShortMap(members) {
  const map = {};
  if (!members?.length) return map;
  // Pass 1: compute base initials per member
  const bases = members.map(m => {
    const words = (m.name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : words.map(w => w[0]).join('').toUpperCase();
  });
  // Pass 2: count occurrences
  const counts = {};
  bases.forEach(b => { counts[b] = (counts[b] || 0) + 1; });
  // Pass 3: assign — append index suffix when there's any collision
  const seen = {};
  members.forEach((m, i) => {
    const base = bases[i];
    if (counts[base] === 1) {
      map[m.id] = base;
    } else {
      seen[base] = (seen[base] || 0) + 1;
      map[m.id] = base + seen[base];
    }
  });
  return map;
}

export default function App() {
  const { t: _t, lang: _lang } = useT();
  const [data, setData] = useState(() => loadLocalProject());
  const [tab, _setTab] = useState(() => { try { return localStorage.getItem('planr_tab') || 'summary'; } catch { return 'summary'; } });
  const setTab = t => { _setTab(t); try { localStorage.setItem('planr_tab', t); } catch {} };
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([tab]));
  useEffect(() => { setVisitedTabs(s => s.has(tab) ? s : new Set([...s, tab])); }, [tab]);
  // Store only the selected node's ID; derive the actual node from the tree.
  // This ensures `selected` always reflects the latest tree state — fixes a bug
  // where QuickEdit would overwrite changes (e.g. assign) made via NodeModal,
  // because the old code held a stale node object in state.
  const [sideTab, setSideTab] = useState('overview');
  const [selId, _setSelId] = useState(null);
  const setSel = n => _setSelId(n == null ? null : typeof n === 'string' ? n : n.id);
  const [multiSel, setMultiSel] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [modalNode, setMN] = useState(null);
  const [search, setSearch] = useState('');
  const [searchIdx, setSearchIdx] = useState(0); // current match index for prev/next cycling
  const [teamFilter, setTeamFilter] = useState('');
  const [rootFilter, setRootFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [saved, setSaved] = useState(true);
  const fRef = useRef(null);
  const searchRef = useRef(null);
  const fileHandleRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [autoSave, setAutoSave] = useState(() => { try { const v = localStorage.getItem('planr_autosave'); return v === null ? true : v === 'true'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('planr_autosave', String(autoSave)); } catch {} }, [autoSave]);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  // ── Tour state ──
  // tourStep === null → tour closed; 0..N → active step
  const TOUR_DONE_KEY = 'planr_tour_done';
  const NEW_SEEN_KEY = 'planr_new_seen_v1';
  const [tourStep, setTourStep] = useState(null);
  // Show new-feature popover once for existing users (has a project, hasn't seen v1 yet)
  const [showNewFeat, setShowNewFeat] = useState(() => {
    try {
      const seen = localStorage.getItem(NEW_SEEN_KEY);
      const hasProject = !!localStorage.getItem(SK);
      return !seen && hasProject;
    } catch { return false; }
  });
  const dismissNewFeat = () => {
    setShowNewFeat(false);
    try { localStorage.setItem(NEW_SEEN_KEY, '1'); } catch {}
  };
  const startTour = () => setTourStep(0);
  const closeTour = () => {
    setTourStep(null);
    try { localStorage.setItem(TOUR_DONE_KEY, '1'); } catch {}
  };

  async function rememberHandle(handle) {
    fileHandleRef.current = handle;
    setFileName(handle?.name || null);
    try {
      if (handle) await persistMountedFileHandle(handle);
      else await clearMountedFileHandle();
    } catch (e) {
      console.error('Could not persist mounted file handle:', e);
    }
  }

  async function forgetHandle() {
    fileHandleRef.current = null;
    setFileName(null);
    try {
      await clearMountedFileHandle();
    } catch (e) {
      console.error('Could not clear mounted file handle:', e);
    }
  }

  async function ensureHandlePermission(handle, interactive = false) {
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const handle = await loadMountedFileHandle();
        if (!handle) return;
        fileHandleRef.current = handle;
        if (!cancelled) setFileName(handle.name || null);

        const readPermission = await queryHandlePermission(handle, 'read');
        // Permission is "prompt" or "denied" → keep filename visible so user can re-grant
        if (readPermission !== 'granted') { if (!cancelled) setFileWriteOk(false); return; }

        const file = await handle.getFile();
        const text = await file.text();
        const restored = normalizeLoadedData(handle.name?.endsWith('.md') ? parseMdToProject(text) : JSON.parse(text));
        if (!isValidProjectData(restored)) throw new Error('Invalid mounted project file.');

        if (!cancelled) {
          setData(restored);
          setSel(null);
          // Check if we have write permission (non-interactive)
          const canWrite = await ensureHandlePermission(handle, false);
          if (!cancelled) setFileWriteOk(canWrite);
        }
      } catch (e) {
        console.error('Mounted file restore failed:', e);
        fileHandleRef.current = null;
        if (!cancelled) setFileName(null);
        try {
          await clearMountedFileHandle();
        } catch {}
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save to localStorage on every change (fast, in-memory) — separate from file save
  const [fileWriteOk, setFileWriteOk] = useState(true);
  const [fileSynced, setFileSynced] = useState(true); // whether the file on disk matches current data
  const lastOwnWriteRef = useRef(0); // timestamp of our last file write (to ignore in poll)
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      localStorage.setItem(SK, JSON.stringify(data));
      // localStorage save is always successful → data is "saved" (just maybe not to file yet)
      setSaved(true);
      setLastSavedAt(new Date());
    }, 300);
    return () => clearTimeout(t);
  }, [data]);
  // Mark file-out-of-sync whenever data changes
  useEffect(() => { if (data) setFileSynced(false); }, [data]);

  // Auto-save: debounced N seconds after the last change. Each new change
  // resets the timer, so rapid edits coalesce into a single write.
  // Manual force-save via the disk icon (saveToFile) bypasses this.
  const SAVE_DEBOUNCE_MS = 5000;
  const lastChangeTimeRef = useRef(Date.now());
  useEffect(() => { if (data) lastChangeTimeRef.current = Date.now(); }, [data]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!data || !autoSave || !fileHandleRef.current || fileSynced) return;
    const t = setTimeout(async () => {
      const handle = fileHandleRef.current;
      if (!handle) return;
      const canWrite = await ensureHandlePermission(handle, false);
      if (!canWrite) { setFileWriteOk(false); return; }
      setSaving(true);
      try {
        const content = handle.name?.endsWith('.md') ? buildMarkdownText() : JSON.stringify(data, null, 2);
        const wr = await handle.createWritable();
        await wr.write(content);
        await wr.close();
        setFileWriteOk(true);
        setFileSynced(true);
        lastOwnWriteRef.current = Date.now();
        setLastSavedAt(new Date());
      } catch (e) { console.error('Auto-save failed:', e); setFileWriteOk(false); }
      finally { setSaving(false); }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [data, autoSave, fileSynced]);

  // 1-second tick to drive the live countdown. Only ticks while there's something to wait for.
  const [, setSaveTick] = useState(0);
  useEffect(() => {
    if (fileSynced || !autoSave || !fileHandleRef.current) return;
    const i = setInterval(() => setSaveTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [fileSynced, autoSave]);
  const saveCountdown = (!fileSynced && autoSave && fileHandleRef.current)
    ? Math.max(0, Math.ceil((lastChangeTimeRef.current + SAVE_DEBOUNCE_MS - Date.now()) / 1000))
    : 0;

  // Detect external file changes (poll every 5s). NEVER auto-load — only notify.
  // Writing is one-way (app → file). When the file changes externally, show a prompt
  // so the user decides whether to reload. Auto-loading was destructive: external edits
  // (or file-system sync hiccups) silently overwrote in-memory state.
  const lastModRef = useRef(null);
  const [externalChangeAvailable, setExternalChangeAvailable] = useState(false);
  useEffect(() => {
    if (!fileHandleRef.current) return;
    const poll = setInterval(async () => {
      try {
        const file = await fileHandleRef.current.getFile();
        const mod = file.lastModified;
        // Skip if this is our own write (within 3s window)
        const isOwnWrite = (Date.now() - lastOwnWriteRef.current) < 3000;
        if (lastModRef.current && mod > lastModRef.current && !isOwnWrite) {
          setExternalChangeAvailable(true);
        }
        lastModRef.current = mod;
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [fileName]);
  async function reloadFromFile() {
    try {
      const file = await fileHandleRef.current.getFile();
      const text = await file.text();
      const isMd = file.name.endsWith('.md');
      const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
      if (d?.tree && Array.isArray(d.tree) && d.tree.length > 0) {
        setData(d);
        setLastSavedAt(new Date(file.lastModified));
        lastModRef.current = file.lastModified;
        setSaved(true);
        setFileSynced(true);
      }
    } catch (e) { console.error('Reload failed:', e); }
    setExternalChangeAvailable(false);
  }

  // Guard: warn on browser close/reload with unsaved changes
  useEffect(() => {
    const h = (e) => { if (!saved) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saved]);

  // Pick a fresh file handle via Save-As dialog, suggesting the previous filename.
  // Used as fallback when the existing handle's permission/write fails after a reload.
  async function pickSaveHandle(suggestedFromName) {
    if (!window.showSaveFilePicker) { exportJSON(); return null; }
    const fallbackSlug = (meta.name || 'project').toLowerCase().replace(/\s+/g, '-');
    const suggested = suggestedFromName || `${fallbackSlug}.planr.json`;
    const isMd = suggested.endsWith('.md');
    return await window.showSaveFilePicker({
      suggestedName: suggested,
      types: isMd
        ? [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }, { description: 'Planr JSON', accept: { 'application/json': ['.json'] } }]
        : [{ description: 'Planr JSON', accept: { 'application/json': ['.json'] } }, { description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
    });
  }

  // Write content to a handle (caller already has write permission)
  async function writeToHandle(handle, content) {
    const wr = await handle.createWritable();
    await wr.write(content);
    await wr.close();
  }

  // Save to file (File System Access API). On failure, fall back to Save-As with previous filename.
  async function saveToFile(saveAs) {
    if (!data) return;
    let handle = saveAs ? null : fileHandleRef.current;
    const previousFileName = fileName; // remember for fallback suggestion
    try {
      // Path A: no handle yet → open Save-As picker right away
      if (!handle) {
        handle = await pickSaveHandle(previousFileName);
        if (!handle) return; // exportJSON path or aborted
      } else {
        // Path B: have a handle → request permission interactively
        const canWrite = await ensureHandlePermission(handle, true);
        if (!canWrite) {
          // Permission denied/failed → offer Save-As fallback so the user can re-mount
          // (this is critical after page reload when permissions reset)
          const ok = confirm('File access was not granted by the browser. Click OK to choose where to save (suggesting the original location), or Cancel to skip.');
          if (!ok) { setFileWriteOk(false); return; }
          handle = await pickSaveHandle(previousFileName);
          if (!handle) { setFileWriteOk(false); return; }
        }
      }
      const content = handle.name?.endsWith('.md') ? buildMarkdownText() : JSON.stringify(data, null, 2);
      await writeToHandle(handle, content);
      lastOwnWriteRef.current = Date.now();
      await rememberHandle(handle);
      setAutoSave(true);
      setFileWriteOk(true);
      setFileSynced(true);
      setSaved(true);
      setLastSavedAt(new Date());
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled file picker
      console.error('Save failed:', e);
      // If write fails (handle invalid, file moved/deleted), offer Save-As fallback
      const isInvalidHandle = e.name === 'NotFoundError' || e.name === 'NotAllowedError' || e.name === 'InvalidStateError';
      if (isInvalidHandle) {
        const retry = confirm(`Save failed: ${e.message || e.name}\n\nThe file may have been moved or access was revoked. Click OK to choose where to save (suggesting the original location), or Cancel to skip.`);
        if (retry) {
          try {
            const handle2 = await pickSaveHandle(previousFileName);
            if (!handle2) return;
            const content = handle2.name?.endsWith('.md') ? buildMarkdownText() : JSON.stringify(data, null, 2);
            await writeToHandle(handle2, content);
            await rememberHandle(handle2);
            setAutoSave(true);
            setFileWriteOk(true);
            setFileSynced(true);
            setSaved(true);
            setLastSavedAt(new Date());
            return;
          } catch (e2) {
            if (e2.name !== 'AbortError') alert('Save still failed: ' + (e2.message || e2.name));
            return;
          }
        }
      }
      setFileWriteOk(false);
      alert('Could not save: ' + (e.message || e.name || 'unknown error'));
    }
  }
  function parseMdToProject(text) {
    const lines = text.split('\n');
    const tree = [], mems = [], teamSet = new Set();
    const explicitTeams = []; // teams from "## Teams" table (with color)
    const vacationsArr = [], holidaysArr = [];
    const taskTemplates = [];
    const parsedCustomFields = []; // custom field definitions from ## Custom Fields section
    let currentTpl = null; // template being parsed
    let projName = null;
    let planStart = '', planEnd = '', viewStartMd = '', workDays = '';
    const idStack = [];
    let section = null; // 'plan' | 'teams' | 'resources' | 'vacations' | 'holidays' | 'tree' | 'templates' | 'customfields' | null
    let lastItem = null;

    lines.forEach(line => {
      // Heading switches section
      const hm = line.match(/^#+\s+(.+)/);
      if (hm) {
        const h = hm[1].trim();
        if (!projName) projName = h;
        const lower = h.toLowerCase();
        if (lower === 'plan') section = 'plan';
        else if (lower === 'teams') section = 'teams';
        else if (lower === 'resources' || /resources?$/i.test(lower)) section = 'resources';
        else if (lower.startsWith('vacation')) section = 'vacations';
        else if (lower === 'holidays') section = 'holidays';
        else if (lower === 'custom fields') section = 'customfields';
        else if (lower === 'work tree') section = 'tree';
        else if (lower === 'task templates') { section = 'templates'; currentTpl = null; }
        else if (section === 'templates' && hm[0].startsWith('###')) {
          // ### Template Name — start a new template
          currentTpl = { id: 'tpl_' + Date.now() + taskTemplates.length, name: h, phases: [] };
          taskTemplates.push(currentTpl);
          return;
        }
        else section = null;
        lastItem = null;
        return;
      }

      // Skip table separator rows like "|---|---|"
      if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) return;

      // Plan section: table rows | Field | Value |
      if (section === 'plan') {
        const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
        if (m && !/^Field$/i.test(m[1])) {
          if (/^start/i.test(m[1])) planStart = m[2].trim();
          else if (/^end/i.test(m[1])) planEnd = m[2].trim();
          else if (/^view\s*start/i.test(m[1])) viewStartMd = m[2].trim();
          else if (/^work\s*days/i.test(m[1])) workDays = m[2].trim();
        }
        return;
      }

      // Teams section: table rows | Name | Color |
      if (section === 'teams') {
        const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*`?(#?[0-9a-fA-F]+)`?\s*\|\s*$/);
        if (m && !/^Name$/i.test(m[1])) {
          const name = m[1].trim();
          const color = m[2].startsWith('#') ? m[2] : '#' + m[2];
          explicitTeams.push({ name, color });
          teamSet.add(name);
        }
        return;
      }

      // Resources section: bulleted list
      if (section === 'resources') {
        // Format: - **Full Name** `SHORT` — Team, Role (cap%), 25d/y, ab YYYY-MM-DD
        const rm = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*(?:\s+`([^`]+)`)?\s*—?\s*(.*)/);
        if (rm) {
          const shortName = rm[2] || '';
          const meta = rm[3] || '';
          const parts = meta.split(',').map(s => s.trim());
          const teamPart = (parts[0] || '').replace(/\s*\(\d+%\)\s*/g, '').trim();
          const roleParts = parts.slice(1)
            .filter(p => !/^\(?\d+%\)?$/.test(p) && !/^ab\s/.test(p) && !/^bis\s/.test(p) && !/^\d+d\/y$/.test(p))
            .map(p => p.replace(/\s*\(\d+%\)\s*/g, '').trim())
            .filter(Boolean);
          const capM = meta.match(/\((\d+)%\)/);
          const vacM = meta.match(/(\d+)d\/y/);
          const startM = meta.match(/ab\s+(\d{4}-\d{2}-\d{2})/);
          const endM = meta.match(/bis\s+(\d{4}-\d{2}-\d{2})/);
          if (teamPart) teamSet.add(teamPart);
          const m = { id: 'm' + Date.now() + mems.length, name: rm[1].trim(), team: teamPart, role: roleParts.join(', '), cap: capM ? +capM[1] / 100 : 1, vac: vacM ? +vacM[1] : 25, start: startM?.[1] || '', end: endM?.[1] || '' };
          if (shortName) m._parsedShort = shortName;
          mems.push(m);
        }
        return;
      }

      // Vacations section: accepts both formats
      // Old (3-col): | Person | Week (Mon) | Note |
      // New (4-col): | Person | From | To | Note |
      if (section === 'vacations') {
        // Try 4-col first (new format)
        const m4 = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
        if (m4 && !/^Person$/i.test(m4[1]) && !/^---|^\s*$/.test(m4[1])) {
          vacationsArr.push({ person: m4[1].trim(), from: m4[2].trim(), to: m4[3].trim(), note: m4[4].trim() });
          return;
        }
        // Fall back to 3-col (old week format)
        const m3 = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
        if (m3 && !/^Person$/i.test(m3[1]) && !/^---|^\s*$/.test(m3[1])) {
          vacationsArr.push({ person: m3[1].trim(), week: m3[2].trim(), note: m3[3].trim() });
        }
        return;
      }

      // Holidays section: table | Date | Name | Source |
      if (section === 'holidays') {
        const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
        if (m && !/^Date$/i.test(m[1])) {
          holidaysArr.push({ date: m[1].trim(), name: m[2].trim(), auto: /auto/i.test(m[3]) });
        }
        return;
      }

      // Custom Fields section: table | ID | Name | Type | Template/Options |
      if (section === 'customfields') {
        const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
        if (m && !/^ID$/i.test(m[1])) {
          const cfId = m[1].trim(), cfName = m[2].trim(), cfType = m[3].trim(), cfExtra = m[4].trim();
          const cf = { id: cfId, name: cfName, type: cfType };
          if (cfType === 'uri') cf.uriTemplate = cfExtra;
          else if (cfType === 'select') cf.options = cfExtra ? cfExtra.split(',').map(s => s.trim()).filter(Boolean) : [];
          parsedCustomFields.push(cf);
        }
        return;
      }

      // Task Templates section: numbered phase lines "1. PhaseName — TeamName"
      if (section === 'templates') {
        if (currentTpl) {
          const pm = line.match(/^\s*\d+\.\s+(.+)/);
          if (pm) {
            currentTpl.phases.push(parseTemplatePhaseLine(pm[1]));
          }
        }
        return;
      }

      // Tree section (or default if no Work Tree heading was seen): bullet items
      const bullet = line.match(/^(\s*)[-*]\s+(.*)/);
      if (!bullet) {
        if (lastItem) {
          const trimmed = line.trim();
          if (!trimmed) return;
          const depM = trimmed.match(/^\*Benötigt:\s*(.+?)\*$/);
          if (depM) {
            const items = depM[1].split(',').map(s => s.trim());
            lastItem.deps = items.map(it => { const lm = it.match(/^([A-Za-z0-9.]+)\s*\((.+)\)$/); return lm ? lm[1] : it; });
            // capture labels
            const labels = {};
            items.forEach(it => { const lm = it.match(/^([A-Za-z0-9.]+)\s*\((.+)\)$/); if (lm) labels[lm[1]] = lm[2]; });
            if (Object.keys(labels).length) lastItem._depLabels = labels;
            return;
          }
          // Parse phases line: *Phasen: ✅RE, 🟡Development(Frontend), ○Test(QA)*
          const phaseM = trimmed.match(/^\*Phasen?:\s*(.+?)\*$/);
          if (phaseM) {
            const phaseItems = phaseM[1].split(',').map(s => s.trim());
            lastItem.phases = phaseItems.map(pi => parsePhaseToken(pi));
            return;
          }
          if (trimmed.startsWith('*') && trimmed.endsWith('*')) { lastItem.note = (lastItem.note ? lastItem.note + ' ' : '') + trimmed.slice(1, -1); return; }
          if (!lastItem.id.includes('.')) { lastItem.description = (lastItem.description || '') + (lastItem.description ? ' ' : '') + trimmed; }
          else { lastItem.note = (lastItem.note ? lastItem.note + ' ' : '') + trimmed; }
        }
        return;
      }
      const indent = bullet[1].length;
      let raw = bullet[2].trim();
      const done = raw.startsWith('✅');
      const wip = raw.includes('🟡');
      raw = raw.replace(/^✅\s*/, '').replace(/🟡\s*/g, '').trim();
      let id = '';
      const idM = raw.match(/^\*\*([A-Za-z0-9.]+)\*\*\s*/);
      if (idM) { id = idM[1]; raw = raw.slice(idM[0].length); }
      // Extract metadata tag block: {prio:N, seq:N, severity, conf:X, cv.fieldId:value}
      let prio = 2, seq = 0, severity = 'high', confidence = '';
      const customValues = {};
      const tagM = raw.match(/\s*\{([^}]+)\}\s*$/);
      if (tagM) {
        const tags = tagM[1].split(',').map(t => t.trim());
        tags.forEach(t => {
          const pm = t.match(/^prio:(\d+)$/i); if (pm) { prio = +pm[1]; return; }
          const sm = t.match(/^seq:(\d+)$/i); if (sm) { seq = +sm[1]; return; }
          const cm = t.match(/^conf:(committed|estimated|exploratory)$/i); if (cm) { confidence = cm[1].toLowerCase(); return; }
          const cvm = t.match(/^cv\.([^:]+):(.*)$/i); if (cvm) { customValues[cvm[1]] = cvm[2].trim(); return; }
          if (/^(critical|high|medium)$/i.test(t)) { severity = t.toLowerCase(); }
        });
        raw = raw.slice(0, raw.indexOf(tagM[0])).trim();
      }
      // Decide-by deadline + Pinned start + Parallel marker — extract FIRST so they're not swallowed by team/type regexes
      let decideBy = '';
      const decideByM = raw.match(/⏰decide:(\d{4}-\d{2}-\d{2})/);
      if (decideByM) { decideBy = decideByM[1]; raw = raw.replace(decideByM[0], '').trim(); }
      let pinnedStart = '';
      const pinM = raw.match(/📌(\d{4}-\d{2}-\d{2})/);
      if (pinM) { pinnedStart = pinM[1]; raw = raw.replace(pinM[0], '').trim(); }
      let parallel = false;
      if (raw.includes('≡')) { parallel = true; raw = raw.replace(/≡/g, '').trim(); }
      // Assigned: [Name1, Name2] at end — extract before team regex so it doesn't get eaten
      let assign = [];
      const assignM = raw.match(/\s*\[(.+?)\]\s*$/);
      if (assignM) { assign = assignM[1].split(',').map(s => s.trim()); raw = raw.slice(0, raw.lastIndexOf(assignM[0])).trim(); }
      // Team: — TeamName (now at the end since assignment + decideBy are removed)
      let team = '';
      const teamM = raw.match(/\s*—\s+([^—]+?)\s*$/);
      if (teamM) { team = teamM[1].trim(); raw = raw.slice(0, raw.lastIndexOf(teamM[0])); if (team) teamSet.add(team); }
      // Estimate: (SZ NTd) or (SZ NTd ×F)
      let best = 0, factor = 1.5;
      const estM = raw.match(/\((\w+\s+)?(\d+)T(?:\s*×([\d.]+))?\)/);
      if (estM) { best = parseInt(estM[2]); if (estM[3]) factor = parseFloat(estM[3]); raw = raw.replace(estM[0], '').trim(); }
      // Progress
      let progress = null;
      const prgM = raw.match(/(\d+)%/);
      if (prgM) { progress = parseInt(prgM[1]); raw = raw.replace(prgM[0], '').trim(); }
      // Type emoji (decideBy ⏰ has already been removed, so no false positive)
      let type = '';
      if (raw.includes('⏰')) { type = 'deadline'; raw = raw.replace('⏰', '').trim(); }
      else if (raw.includes('⚡')) { type = 'painpoint'; raw = raw.replace('⚡', '').trim(); }
      else if (raw.includes('🎯')) { type = 'goal'; raw = raw.replace('🎯', '').trim(); }
      // Date
      let date = '';
      const dateM = raw.match(/\((\d{4}-\d{2}-\d{2})\)/);
      if (dateM) { date = dateM[1]; raw = raw.replace(dateM[0], '').trim(); }
      const name = raw.replace(/\*\*/g, '').trim();
      if (!id) {
        while (idStack.length && idStack[idStack.length - 1].indent >= indent) idStack.pop();
        const parentId = idStack.length ? idStack[idStack.length - 1].id : '';
        const siblings = tree.filter(r => { const pid = r.id.split('.').slice(0, -1).join('.'); return pid === parentId; });
        id = parentId ? `${parentId}.${siblings.length + 1}` : `P${tree.filter(r => !r.id.includes('.')).length + 1}`;
      }
      idStack.push({ id, indent });
      const item = { id, name, status: done ? 'done' : wip ? 'wip' : 'open', team, best, factor, prio, deps: [], note: '', assign };
      if (seq) item.seq = seq;
      if (progress != null) item.progress = progress;
      if (type) { item.type = type; item.severity = severity; }
      if (date) item.date = date;
      if (decideBy) item.decideBy = decideBy;
      if (pinnedStart) item.pinnedStart = pinnedStart;
      if (parallel) item.parallel = true;
      if (confidence) item.confidence = confidence;
      if (Object.keys(customValues).length) item.customValues = customValues;
      tree.push(item);
      lastItem = item;
    });

    // Self-healing: clean team values that may carry noise from older corrupt exports
    // (e.g. "Backend [SL] ⏰decide:2026-09-30" → "Backend"). Same defensive cleanup for items.
    const sanitizeTeam = (t) => {
      if (!t) return t;
      let v = t;
      v = v.replace(/⏰decide:\d{4}-\d{2}-\d{2}/g, '');
      v = v.replace(/📌\d{4}-\d{2}-\d{2}/g, '');
      v = v.replace(/\[[^\]]*\]/g, ''); // strip any [assignees] residue
      v = v.replace(/\{[^}]*\}/g, ''); // strip any {tags} residue
      v = v.trim();
      return v;
    };
    tree.forEach(r => {
      if (r.team) {
        const cleaned = sanitizeTeam(r.team);
        if (cleaned !== r.team) {
          // If the original team string contained a decideBy/pinned, recover them
          const decM = r.team.match(/⏰decide:(\d{4}-\d{2}-\d{2})/);
          if (decM && !r.decideBy) r.decideBy = decM[1];
          const pinM2 = r.team.match(/📌(\d{4}-\d{2}-\d{2})/);
          if (pinM2 && !r.pinnedStart) r.pinnedStart = pinM2[1];
          r.team = cleaned;
        }
      }
    });
    // Re-collect team names after sanitization (so cleaned names are added to the team set)
    teamSet.clear();
    tree.forEach(r => {
      if (r.team) teamSet.add(r.team);
      if (r.phases) r.phases.forEach(p => phaseTeamIds(p).forEach(teamId => teamSet.add(teamId)));
    });
    mems.forEach(m => { if (m.team) { m.team = sanitizeTeam(m.team); teamSet.add(m.team); } });
    taskTemplates.forEach(tpl => tpl.phases.forEach(p => phaseTeamIds(p).forEach(teamId => teamSet.add(teamId))));

    // Build teams: prefer explicit team table, fall back to inferred
    const usedTeamNames = [...teamSet];
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const teamsArr = usedTeamNames.map((name, i) => {
      const exp = explicitTeams.find(t => t.name === name);
      return { id: `T${i + 1}`, name, color: exp?.color || palette[i % palette.length] };
    });
    const teamLookup = Object.fromEntries(teamsArr.map(t => [t.name, t.id]));
    tree.forEach(r => {
      if (r.team) r.team = teamLookup[r.team] || r.team;
      if (r.phases) {
        r.phases.forEach(p => {
          const teamsForPhase = phaseTeamIds(p).map(teamId => teamLookup[teamId] || teamId);
          p.teams = teamsForPhase;
          p.team = teamsForPhase[0] || '';
        });
      }
    });
    mems.forEach(m => { if (m.team) m.team = teamLookup[m.team] || m.team; });
    taskTemplates.forEach(tpl => tpl.phases.forEach(p => {
      const teamsForPhase = phaseTeamIds(p).map(teamId => teamLookup[teamId] || teamId);
      p.teams = teamsForPhase;
      p.team = teamsForPhase[0] || '';
    }));
    // Resolve assignee references — try short name from MD first, then full name match,
    // finally computed initials match (for back-compat with files written by older builds)
    const computedShorts = buildMemberShortMap(mems);
    const resolveMember = (token) => {
      // 1. Match by short name parsed from MD (`SL`)
      const byParsedShort = mems.find(m => m._parsedShort === token);
      if (byParsedShort) return byParsedShort.id;
      // 2. Match by full name (back-compat with old MDs)
      const byName = mems.find(m => m.name === token);
      if (byName) return byName.id;
      // 3. Match by computed initials (back-compat without explicit short)
      const byComputed = mems.find(m => computedShorts[m.id] === token);
      if (byComputed) return byComputed.id;
      return token; // unresolved — keep as-is
    };
    tree.forEach(r => {
      if (r.assign?.length) r.assign = r.assign.map(resolveMember);
      if (r.phases?.length) {
        r.phases.forEach(phase => {
          if (phase.assign?.length) phase.assign = phase.assign.map(resolveMember);
        });
      }
    });
    vacationsArr.forEach(v => { v.person = resolveMember(v.person); });
    // Normalize to {person, from, to, note} — converts legacy week format on load
    const normalizedVacations = vacationsArr.map(normalizeVacation);
    // Strip transient _parsedShort field from members
    mems.forEach(m => { delete m._parsedShort; });

    const metaObj = { name: projName || 'Imported Project', version: '2' };
    if (planStart) metaObj.planStart = planStart;
    if (planEnd) metaObj.planEnd = planEnd;
    if (viewStartMd) metaObj.viewStart = viewStartMd;
    if (workDays) metaObj.workDays = workDays.split(',').map(Number).filter(n => n >= 0 && n <= 6);
    return { meta: metaObj, teams: teamsArr, members: mems, tree, vacations: normalizedVacations, holidays: holidaysArr, ...(taskTemplates.length ? { taskTemplates } : {}), ...(parsedCustomFields.length ? { customFields: parsedCustomFields } : {}) };
  }

  async function loadFromFile() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({ types: [
          { description: 'Planr Project', accept: { 'application/json': ['.json'] } },
          { description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
        ] });
        const file = await handle.getFile();
        const text = await file.text();
        const isMd = handle.name.endsWith('.md');
        const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
        if (!d.tree || !Array.isArray(d.tree) || d.tree.length === 0) throw new Error(isMd ? 'No work items found in this Markdown file. Expected format: bullet list with **ID** Name entries under a "## Work Tree" heading.' : 'Invalid JSON project file — no tree items found.');
        // Apply data immediately — don't block on file write permission
        await rememberHandle(handle);
        setData(d);
        setSel(null);
        setSaved(true);
        setLastSavedAt(new Date());
        // Try to establish write permission (non-blocking for UI update)
        const canWrite = await ensureHandlePermission(handle, true);
        setFileWriteOk(canWrite);
        setAutoSave(true);
      } else { fRef.current?.click(); }
    } catch (e) { if (e.name !== 'AbortError') alert('Could not load file: ' + e.message); }
  }
  // Accept both .json and .md files

  // Global keyboard shortcuts: Ctrl/Cmd+S → save, Ctrl/Cmd+F → focus search
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveToFile(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only intercept when a searchable view is active
        if (tab === 'tree' || tab === 'gantt' || tab === 'net') {
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }
      // Cmd/Ctrl+Arrow Up/Down: cycle through search matches
      if ((e.ctrlKey || e.metaKey) && search && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setSearchIdx(i => e.key === 'ArrowDown' ? i + 1 : i - 1);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const { tree = [], members = [], teams = [], vacations = [], meta = {} } = data || {};
  // Derive selected node from tree — always fresh after any tree mutation.
  const selected = useMemo(() => selId ? tree.find(r => r.id === selId) || null : null, [tree, selId]);
  const rootItems = useMemo(() => tree.filter(r => !r.id.includes('.')), [tree]);
  const netRootOptions = useMemo(() => rootItems.map(r => ({ id: r.id, label: r.name || r.id })), [rootItems]);
  const netTree = useMemo(() => {
    let items = tree;
    if (rootFilter) items = items.filter(r => r.id === rootFilter || r.id.startsWith(rootFilter + '.'));
    if (teamFilter) {
      const visibleIds = new Set();
      items.forEach(r => {
        if ((r.team || '').includes(teamFilter)) {
          visibleIds.add(r.id);
          const parts = r.id.split('.');
          for (let i = 1; i < parts.length; i++) {
            const ancestor = parts.slice(0, i).join('.');
            visibleIds.add(ancestor);
          }
        }
      });
      items = items.filter(r => visibleIds.has(r.id));
    }
    if (personFilter) {
      const visibleIds = new Set();
      items.forEach(r => {
        if ((r.assign || []).includes(personFilter)) {
          visibleIds.add(r.id);
          const parts = r.id.split('.');
          for (let i = 1; i < parts.length; i++) {
            const ancestor = parts.slice(0, i).join('.');
            visibleIds.add(ancestor);
          }
        }
      });
      items = items.filter(r => visibleIds.has(r.id));
    }
    return items;
  }, [tree, rootFilter, teamFilter, personFilter]);
  useEffect(() => {
    if (rootFilter && !rootItems.some(r => r.id === rootFilter)) setRootFilter('');
  }, [rootItems, rootFilter]);
  useEffect(() => {
    if (teamFilter && !teams.some(t => t.id === teamFilter)) setTeamFilter('');
  }, [teams, teamFilter]);
  useEffect(() => {
    if (personFilter && !members.some(m => m.id === personFilter)) setPersonFilter('');
  }, [members, personFilter]);
  // Backward compat: migrate old deadlines[] into tree roots
  useEffect(() => {
    if (!data?.deadlines?.length) return;
    const dl = data.deadlines; const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
    const updated = [...tree];
    dl.forEach(g => {
      // Find matching root by name similarity
      const root = updated.find(r => !r.id.includes('.') && (r.name.includes(g.name) || g.name.includes(r.name.split(' ')[0])));
      if (root && !root.type) { root.type = g.type || 'goal'; root.severity = g.severity || 'high'; if (g.date) root.date = g.date; if (g.description) root.description = g.description; }
    });
    setData(d => { const { deadlines, ...rest } = d; return { ...rest, tree: updated }; });
  }, []);
  const goals = useMemo(() => tree.filter(r => !r.id.includes('.') && r.type), [tree]);
  const hm = useMemo(() => buildHMap(data?.holidays || []), [data?.holidays]);
  const planStart = meta.planStart || iso(new Date());
  // viewStart = rendering start. Can be earlier than planStart for pre-started tasks.
  // planStart = scheduling start. New/unstarted tasks begin here.
  const viewStart = meta.viewStart && meta.viewStart < planStart ? meta.viewStart : planStart;
  const planEnd = meta.planEnd || iso(new Date(new Date().getFullYear() + 2, 11, 31));
  const workDays = meta.workDays || [1, 2, 3, 4, 5]; // Mon–Fri default
  const { results: scheduled, weeks } = useMemo(() => data ? schedule(tree, members, vacations, viewStart, planEnd, hm, workDays, planStart) : { results: [], weeks: [] }, [tree, members, vacations, viewStart, planStart, planEnd, hm, workDays]);
  const stats = useMemo(() => { const s = treeStats(tree); enrichParentSchedules(s, tree, scheduled); return s; }, [tree, scheduled]);
  const cpSet = useMemo(() => cpm(tree).critical, [tree]);
  const goalPaths = useMemo(() => goalCpm(tree), [tree]);
  const leaves = useMemo(() => leafNodes(tree), [tree]);
  const { confidence, reasons: confReasons } = useMemo(() => computeConfidence(tree, members), [tree, members]);
  const shortNamesMap = useMemo(() => buildMemberShortMap(members), [members]);

  // One-shot migration: prior builds wrote auto holidays using a UTC-shifted iso(),
  // so NRW dates landed a day early in the file. Detect that and rewrite them
  // from a fresh computeNRW(). Runs idempotently — if everything already matches,
  // no state update fires.
  useEffect(() => {
    if (!data?.holidays?.length || !meta.planStart || !meta.planEnd) return;
    const ys = new Date(meta.planStart).getFullYear(), ye = new Date(meta.planEnd).getFullYear();
    const years = []; for (let y = ys; y <= ye; y++) years.push(y);
    const fresh = computeNRW(years);
    const freshByKey = new Map(fresh.map(h => [`${h.name}|${h.date.slice(0, 4)}`, h.date]));
    let changed = false;
    const migrated = data.holidays.map(h => {
      if (!h.auto) return h;
      const key = `${h.name}|${h.date.slice(0, 4)}`;
      const expected = freshByKey.get(key);
      if (expected && expected !== h.date) { changed = true; return { ...h, date: expected }; }
      return h;
    });
    if (changed) setData(d => ({ ...d, holidays: migrated }));
  }, [data?.holidays?.length, meta.planStart, meta.planEnd]);

  // Auto-fix tree: derive parent statuses + reconcile team with assigned person.
  // IMPORTANT: these two mutations are combined into ONE setData call so they
  // cannot overwrite each other. The old two-effect pattern caused Effect B to
  // overwrite Effect A's tree, triggering A again → potential render storm.
  useEffect(() => {
    if (!data || !tree.length) return;
    // Use a functional updater so we always operate on the LATEST tree from
    // state, not the closure-captured snapshot (which may be stale if another
    // effect already queued an update).
    setData(d => {
      let t = d.tree || [];
      let changed = false;
      // 1. Reconcile teams: person's team always wins
      if (members.length) {
        t = t.map(r => {
          if (!r.assign?.length) return r;
          const firstAssignee = members.find(m => m.id === r.assign[0]);
          if (!firstAssignee?.team) return r;
          if (r.team !== firstAssignee.team) { changed = true; return { ...r, team: firstAssignee.team }; }
          return r;
        });
      }
      // 2. Derive parent statuses — must run on the (possibly team-fixed) tree
      // Only treeStats is needed here (for _autoStatus); enrichParentSchedules
      // is display-only and already runs in the useMemo above.
      const st = treeStats(t);
      const t2 = deriveParentStatuses(t, st);
      if (t2.some((r, i) => r.status !== t[i].status)) { changed = true; t = t2; }
      if (!changed) return d; // no-op: same reference = React skips re-render
      return { ...d, tree: t };
    });
  }, [stats, members]);

  // Normalize a loaded data object: convert legacy week-based vacations to {from, to} on load.
  function normalizeLoadedData(d) {
    if (!d || !Array.isArray(d.vacations) || !d.vacations.length) return d;
    return { ...d, vacations: d.vacations.map(normalizeVacation) };
  }
  function setD(k, v) { setData(d => ({ ...d, [k]: v })); setSaved(false); }
  // Functional update so callbacks fired in rapid succession always see the LATEST tree state,
  // not a closure-captured snapshot. Prevents the second of two fast edits from overwriting the
  // first (e.g. deleting two dependency arrows in the Gantt within the same tick).
  function updateNode(u) {
    // Auto-extend viewStart if the user pins a task before the current visual horizon.
    if (u.pinnedStart) {
      const vs = meta.viewStart || meta.planStart;
      if (vs && u.pinnedStart < vs) {
        // Extend viewStart 2 weeks before the pin so the bar isn't flush at the left edge.
        const pinD = new Date(u.pinnedStart);
        const extended = new Date(pinD); extended.setDate(extended.getDate() - 14);
        const extStr = extended.toISOString().slice(0, 10);
        setData(d => ({
          ...d,
          meta: { ...d.meta, viewStart: extStr },
          tree: (d.tree || []).map(r => r.id === u.id ? u : r),
        }));
        setSaved(false);
        return;
      }
    }
    setData(d => ({ ...d, tree: (d.tree || []).map(r => r.id === u.id ? u : r) }));
    setSaved(false);
  }
  // Targeted dep mutations: read current tree state and touch ONLY the deps field.
  // Avoids the stale-closure overwrite pattern where `{...oldNode, deps: newDeps}` wipes
  // out unrelated field changes that happened after the callback was created.
  function removeDep(fromId, depId) {
    setData(d => ({
      ...d,
      tree: (d.tree || []).map(r => r.id === fromId
        ? { ...r, deps: (r.deps || []).filter(x => x !== depId) }
        : r)
    }));
    setSaved(false);
  }
  function addDep(fromId, depId) {
    if (fromId === depId) return;
    setData(d => ({
      ...d,
      tree: (d.tree || []).map(r => r.id === fromId
        ? { ...r, deps: [...new Set([...(r.deps || []), depId])] }
        : r)
    }));
    setSaved(false);
  }
  function deleteNode(id) { setD('tree', tree.filter(r => !r.id.startsWith(id))); setSel(null); }
  function addNode(node) {
    const pid = node.id.split('.').slice(0, -1).join('.');
    const nt = [...tree];
    if (!pid) { nt.push(node); }
    else { let ins = -1; for (let i = nt.length - 1; i >= 0; i--) { if (nt[i].id === pid || nt[i].id.startsWith(pid + '.')) { ins = i + 1; break; } } ins >= 0 ? nt.splice(ins, 0, node) : nt.push(node); }
    setD('tree', nt);
  }

  // Compute an ID map for moving/duplicating a subtree rooted at `nodeId` under `newParentId`.
  // Returns: { [oldId]: newId } for the node and every descendant.
  function computeIdMap(tree, nodeId, newParentId) {
    const subtreeIds = [nodeId, ...tree.filter(r => r.id.startsWith(nodeId + '.')).map(r => r.id)];
    const newBase = nextChildId(tree, newParentId);
    const map = { [nodeId]: newBase };
    subtreeIds.slice(1).forEach(old => { map[old] = newBase + old.slice(nodeId.length); });
    return map;
  }

  // Duplicate a node + its entire subtree. Deps pointing INSIDE the subtree are remapped;
  // deps pointing OUTSIDE are preserved. Returns the new root node id.
  function duplicateNode(nodeId) {
    const node = tree.find(r => r.id === nodeId); if (!node) return null;
    const parentOfNode = nodeId.split('.').slice(0, -1).join('.'); // stays under same parent
    const idMap = computeIdMap(tree, nodeId, parentOfNode);
    const copies = [nodeId, ...tree.filter(r => r.id.startsWith(nodeId + '.')).map(r => r.id)].map(oldId => {
      const orig = tree.find(r => r.id === oldId);
      const copy = { ...orig, id: idMap[oldId] };
      // Remap deps that point within the subtree, keep deps pointing outside
      copy.deps = (orig.deps || []).map(d => idMap[d] || d);
      // Preserve _depLabels but remap keys
      if (orig._depLabels) {
        copy._depLabels = {};
        Object.entries(orig._depLabels).forEach(([k, v]) => { copy._depLabels[idMap[k] || k] = v; });
      }
      // Reset progress/status for fresh copy (user decides)
      delete copy.pinnedStart;
      if (copy.phases) {
        copy.phases = copy.phases.map(p => ({
          ...p,
          id: 'ph' + Date.now() + Math.random().toString(36).slice(2, 6),
          status: 'open',
          assign: [],
        }));
      }
      return copy;
    });
    setD('tree', [...tree, ...copies]);
    return idMap[nodeId];
  }

  // Move a node (and its subtree) under a new parent ('' for top-level).
  // Updates IDs, dep references everywhere, and re-sorts so siblings are grouped.
  function moveNode(nodeId, newParentId) {
    if (nodeId === newParentId) return;
    // Prevent moving into own descendant (would create a cycle)
    if (newParentId && (newParentId === nodeId || newParentId.startsWith(nodeId + '.'))) {
      alert('Cannot move an item under itself or one of its descendants.');
      return;
    }
    const currentParent = nodeId.split('.').slice(0, -1).join('.');
    if (currentParent === newParentId) return; // no-op
    const idMap = computeIdMap(tree, nodeId, newParentId);
    // Rename moved items AND update dep references in all other items
    const renamed = tree.map(r => {
      if (idMap[r.id] != null) {
        // Moved item — rename + remap any internal-subtree deps
        const newR = { ...r, id: idMap[r.id], deps: (r.deps || []).map(d => idMap[d] || d) };
        if (r._depLabels) {
          newR._depLabels = {};
          Object.entries(r._depLabels).forEach(([k, v]) => { newR._depLabels[idMap[k] || k] = v; });
        }
        return newR;
      }
      // Other item — only update deps that pointed to moved items
      const newDeps = (r.deps || []).map(d => idMap[d] || d);
      if (newDeps.some((d, i) => d !== (r.deps || [])[i])) {
        const newR = { ...r, deps: newDeps };
        if (r._depLabels) {
          newR._depLabels = {};
          Object.entries(r._depLabels).forEach(([k, v]) => { newR._depLabels[idMap[k] || k] = v; });
        }
        return newR;
      }
      return r;
    });
    // Re-sort so parent-then-children order is preserved globally
    renamed.sort((a, b) => {
      const ap = a.id.split('.'), bp = b.id.split('.');
      for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
        if (ap[i] !== bp[i]) {
          // Sort by numeric suffix when both are numeric, else lexicographic
          const an = parseInt(ap[i].replace(/\D/g, '')) || 0, bn = parseInt(bp[i].replace(/\D/g, '')) || 0;
          return an !== bn ? an - bn : ap[i].localeCompare(bp[i]);
        }
      }
      return ap.length - bp.length;
    });
    setD('tree', renamed);
    return idMap[nodeId];
  }
  // Reorder a node within its sibling list by renumbering trailing IDs (and all
  // descendants, plus dep references everywhere). Direction: 'up'|'down'|'first'|'last'.
  // For root items (no dot), only siblings sharing the same alphabetic prefix swap —
  // mixing P-roots with D-roots would change category semantics.
  function reorderSibling(nodeId, direction) {
    const parts = nodeId.split('.');
    const parentId = parts.slice(0, -1).join('.');
    const node = tree.find(r => r.id === nodeId); if (!node) return;

    // Build sibling list. For children: same parent. For roots: same alphabetic prefix.
    const isRoot = !parentId;
    const myPrefix = isRoot ? (nodeId.match(/^[A-Za-z]+/)?.[0] || '') : '';
    const siblings = tree.filter(r => {
      if (isRoot) {
        if (r.id.includes('.')) return false;
        return (r.id.match(/^[A-Za-z]+/)?.[0] || '') === myPrefix;
      }
      const rp = r.id.split('.').slice(0, -1).join('.');
      return rp === parentId;
    }).sort((a, b) => {
      const an = parseInt(a.id.split('.').pop().replace(/\D/g, '')) || 0;
      const bn = parseInt(b.id.split('.').pop().replace(/\D/g, '')) || 0;
      return an - bn;
    });

    const myIdx = siblings.findIndex(s => s.id === nodeId);
    if (myIdx < 0) return;
    let newIdx = myIdx;
    if (direction === 'up') newIdx = myIdx - 1;
    else if (direction === 'down') newIdx = myIdx + 1;
    else if (direction === 'first') newIdx = 0;
    else if (direction === 'last') newIdx = siblings.length - 1;
    newIdx = Math.max(0, Math.min(siblings.length - 1, newIdx));
    if (newIdx === myIdx) return;

    // Reorder siblings array
    const reordered = [...siblings];
    const [moved] = reordered.splice(myIdx, 1);
    reordered.splice(newIdx, 0, moved);

    // Build idMap: old → new for every sibling whose position changed,
    // plus for every descendant of those siblings.
    const idMap = {};
    reordered.forEach((s, i) => {
      const newSuffix = i + 1;
      const newId = isRoot ? `${myPrefix}${newSuffix}` : `${parentId}.${newSuffix}`;
      if (newId === s.id) return;
      idMap[s.id] = newId;
      const descPrefix = s.id + '.';
      tree.forEach(r => {
        if (r.id.startsWith(descPrefix)) idMap[r.id] = newId + '.' + r.id.slice(descPrefix.length);
      });
    });
    if (!Object.keys(idMap).length) return;

    // Apply renaming + dep remapping (mirrors moveNode's logic).
    const renamed = tree.map(r => {
      const newId = idMap[r.id] || r.id;
      const newDeps = (r.deps || []).map(d => idMap[d] || d);
      const depsChanged = newDeps.some((d, i) => d !== (r.deps || [])[i]);
      if (newId === r.id && !depsChanged) return r;
      const newR = { ...r, id: newId, deps: newDeps };
      if (r._depLabels) {
        newR._depLabels = {};
        Object.entries(r._depLabels).forEach(([k, v]) => { newR._depLabels[idMap[k] || k] = v; });
      }
      return newR;
    });
    // Re-sort so parent-then-children order is preserved globally
    renamed.sort((a, b) => {
      const ap = a.id.split('.'), bp = b.id.split('.');
      for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
        if (ap[i] !== bp[i]) {
          const an = parseInt(ap[i].replace(/\D/g, '')) || 0, bn = parseInt(bp[i].replace(/\D/g, '')) || 0;
          return an !== bn ? an - bn : ap[i].localeCompare(bp[i]);
        }
      }
      return ap.length - bp.length;
    });
    setD('tree', renamed);
    // Keep the moved node selected under its new ID
    if (selId === nodeId && idMap[nodeId]) setSel(idMap[nodeId]);
  }

  // Reorder a task within its "queue" — the set of tasks that share the same
  // assignee (or team when unassigned). Renumbers the `seq` field for every
  // task in the queue (steps of 10 with gaps) so the scheduler's tiebreak
  // (prio, seq, id) honors the new order. `target` can be:
  //   'first' | 'last' | 'earlier' | 'later'   — relative moves
  //   number                                   — absolute queue index
  //   { direction, steps }                     — relative with step count
  // Build the "queue key" for a task: tasks with the same key run through the same
  // scheduler pF counter. For single-member teams, team-only and direct-assign must
  // produce the SAME key so reordering works identically for both.
  function queueKeyOf(r) {
    if ((r.assign || []).length) return [...r.assign].sort().join(',');
    const tm = pt(r.team);
    const tM = members.filter(m => pt(m.team) === tm);
    if (tM.length === 1) return tM[0].id; // same queue as directly-assigned
    return `team:${r.team || ''}`;
  }
  function reorderInQueue(taskId, target, stepsArg) {
    const task = tree.find(r => r.id === taskId);
    if (!task || !isLeafNode(tree, task.id)) return;
    const myKey = queueKeyOf(task);
    const psDate = new Date(meta.planStart || Date.now());
    // Sort must match the scheduler's actual processing order (future-pinned last,
    // then prio → seq → id) so that "move later" in the UI = "runs later" in the plan.
    const queueTasks = tree.filter(r => {
      if (!isLeafNode(tree, r.id)) return false;
      if (!r.best) return false;
      return queueKeyOf(r) === myKey;
    }).sort((a, b) => {
      const aF = a.pinnedStart && new Date(a.pinnedStart) > psDate ? 1 : 0;
      const bF = b.pinnedStart && new Date(b.pinnedStart) > psDate ? 1 : 0;
      if (aF !== bF) return aF - bF;
      return (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id);
    });
    if (queueTasks.length < 2) return;
    const idx = queueTasks.findIndex(t => t.id === taskId);
    if (idx < 0) return;
    const steps = Math.max(1, stepsArg || 1);
    let newIdx = idx;
    if (target === 'first') newIdx = 0;
    else if (target === 'last') newIdx = queueTasks.length - 1;
    else if (target === 'earlier') newIdx = idx - steps;
    else if (target === 'later') newIdx = idx + steps;
    else if (typeof target === 'number') newIdx = target;
    newIdx = Math.max(0, Math.min(queueTasks.length - 1, newIdx));
    if (newIdx === idx) return;
    const reordered = [...queueTasks];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    // Renumber seq with gaps (10, 20, 30…). Seq is a SOFT tiebreaker — it adjusts
    // the scheduler's processing order within the same priority level. For HARD ordering
    // (e.g. "A must run after B"), the user should create a dependency link instead.
    const updates = new Map(reordered.map((t, i) => [t.id, (i + 1) * 10]));
    setData(d => ({
      ...d,
      tree: (d.tree || []).map(r => updates.has(r.id) ? { ...r, seq: updates.get(r.id) } : r)
    }));
    setSaved(false);
  }

  function updateMember(m) { setD('members', members.map(x => x.id === m.id ? m : x)); }
  function addMember() { const id = 'm' + Date.now(); setD('members', [...members, { id, name: 'New person', team: teams[0]?.id || '', role: '', cap: 1.0, vac: 25, start: planStart }]); }
  function cloneMember(src) { const id = 'm' + Date.now(); setD('members', [...members, { ...src, id, team: '', cap: 0.5 }]); }
  function deleteMember(id) { setD('members', members.filter(m => m.id !== id)); }
  // Gantt drag callback. Accepts either a number (legacy seq update) or an object patch (e.g. {pinnedStart}).
  function onSeqUpdate(taskId, patch) {
    const update = typeof patch === 'object' && patch !== null ? patch : { seq: patch };
    setD('tree', tree.map(r => r.id === taskId ? { ...r, ...update } : r));
  }
  // Extend the plan start date backward so partially-done tasks that began before the
  // current horizon fit naturally. Scheduler re-computes with the wider window; existing
  // positions shift right by the added weeks.
  // Extend the VISUAL start (viewStart) without touching the scheduling start (planStart).
  // Pre-planStart weeks exist for display only — the scheduler still begins at planStart.
  function extendViewStart(newStart) {
    if (!newStart || newStart >= (meta.viewStart || meta.planStart || '9999')) return;
    setData(d => ({ ...d, meta: { ...d.meta, viewStart: newStart } }));
    setSaved(false);
  }

  // Export context — shared data bag for all export functions in utils/exports.js
  const _exportCtx = () => ({ data, tree, members, teams, scheduled, weeks, cpSet, goalPaths, stats, confidence, meta, lang: _lang });
  const isMdFile = fileName?.endsWith('.md');
  function buildMarkdownText() { return _buildMd({ tree, members, teams, vacations, data, meta }); }
  function serializeForSave() {
    return isMdFile ? buildMarkdownText() : JSON.stringify(data, null, 2);
  }
  function loadFile(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async ev => {
      try {
        const text = ev.target.result;
        const isMd = f.name.endsWith('.md');
        const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
        if (!d.tree || !Array.isArray(d.tree) || d.tree.length === 0) throw new Error(isMd ? 'No work items found in this Markdown file.' : 'Invalid project file.');
        // Set data first, then clean up handle in background
        setData(d);
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
    r.readAsText(f); e.target.value = '';
  }
  function onBarClick(s) { const node = tree.find(r => r.id === s.id); if (node) { setMN({ ...node, ...s }); setModal('node'); } }
  async function newProject() { await forgetHandle(); setFileWriteOk(false); setAutoSave(true); setSaved(true); setLastSavedAt(null); setData(null); setSel(null); setModal(null); setTab('summary'); }

  // Restore mounted file after page reload (when bootstrap left us with a handle but no read permission)
  async function restoreMountedFile() {
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

  if (!bootstrapped) return <div className="onboard">
    <div className="onboard-card fade" style={{ padding: 32, width: 360 }}>
      <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>Planr<span style={{ color: 'var(--ac)' }}>.</span></div>
      <div className="onboard-sub" style={{ marginBottom: 0 }}>Restoring project context...</div>
    </div>
  </div>;

  if (!data && fileName && fileHandleRef.current) return <div className="onboard">
    <div className="onboard-card fade" style={{ padding: 32, width: 420, textAlign: 'center' }}>
      <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>Planr<span style={{ color: 'var(--ac)' }}>.</span></div>
      <div className="onboard-sub" style={{ marginBottom: 22 }}>Restore mounted project</div>
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 12, marginBottom: 18, fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {fileName}</div>
      <p className="helper" style={{ marginBottom: 18, fontSize: 12 }}>Browser security requires you to grant file access again after a page reload.</p>
      <div className="ob-actions">
        <button className="ob-btn ob-pri" onClick={restoreMountedFile}>Reactivate file access</button>
        <button className="ob-btn ob-sec" onClick={async () => { await forgetHandle(); }}>Discard mount</button>
      </div>
    </div>
  </div>;

  if (!data) return <>
    <Onboard onCreate={() => setModal('new')} onLoad={loadFromFile} fRef={fRef}
      onLoadDemo={() => {
        import('./utils/demoProject.js').then(m => {
          const demo = m.buildDemoProject(_t);
          setData(demo); setSaved(false); setTab('summary'); setSel(demo.tree?.[0] || null);
        });
      }} />
    {modal === 'new' && <NewProjModal onClose={() => setModal(null)} onCreate={d => {
      setData(d); setSaved(false); setModal(null); setTab('tree'); setSel(d.tree?.[0] || null);
      // Auto-start tour for first-time users (tour not yet dismissed)
      try { if (!localStorage.getItem(TOUR_DONE_KEY)) setTourStep(0); } catch {}
    }} />}
    <input ref={fRef} type="file" accept=".json,.md" style={{ display: 'none' }} onChange={loadFile} />
  </>;

  // removed: topDownReady guide bubble (was blocking tree view)

  // "New!" badge: shown on tabs until the user dismisses the new-feature popover
  const showNewBadge = showNewFeat;
  const TABS = [
    { id: 'summary', label: _t('tab.summary'), isNew: showNewBadge },
    { id: 'plan', label: _t('tab.plan'), isNew: showNewBadge },
    { id: 'tree', label: _t('tab.tree') },
    { id: 'gantt', label: _t('tab.gantt'), isNew: showNewBadge },
    { id: 'net', label: _t('tab.net') },
    { id: 'resources', label: _t('tab.resources') },
    { id: 'holidays', label: _t('tab.holidays') },
  ];

  // ── Tour steps (resolved at render time so they pick up the active language) ──
  const TOUR_STEPS = [0, 1, 2, 3].map(i => ({
    icon: _t(`tour.s${i}.icon`),
    title: _t(`tour.s${i}.title`),
    body: _t(`tour.s${i}.body`),
  }));

  // ── New-feature list (shown once to existing users) ──
  const NEW_FEATURES = [
    _t('new.roadmap'),
    _t('new.dayZoom'),
    _t('new.confidence'),
    _t('new.dragLink'),
    _t('new.planReview'),
    // TODO: add Network Graph improvements once documented
  ];

  return <>
    <HoverTipProvider />
    <div className="app">
    <div className="topbar">
      <span className="logo" data-htip="New project" onClick={() => { if (!saved && !confirm('Unsaved changes will be lost. Start new project?')) return; newProject(); }}>Planr<span className="logo-dot">.</span></span>
      <div className="vsep" />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--tx2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name || 'Untitled'}</span>
        <span className={`save-dot ${fileName && !fileSynced ? 'dirty' : saved ? 'clean' : 'dirty'}`} data-htip={!saved ? 'Unsaved changes' : (fileName && !fileSynced ? 'Saved locally — file on disk pending auto-save' : 'All changes saved')} />
      </span>
      {fileName && <span style={{ fontSize: 11, color: 'var(--tx2)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {fileName}
        {(!saved || !fileWriteOk || !fileSynced) && <button className="btn btn-ghost btn-xs" onClick={() => saveToFile()} data-htip={`Save now (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+S) — bypass the ${SAVE_DEBOUNCE_MS / 1000}s auto-save debounce`} style={{ padding: '2px 5px', fontSize: 11 }}>💾</button>}
      </span>}
      <label data-htip={autoSave ? `Auto-save is ON — writes to disk ${SAVE_DEBOUNCE_MS / 1000}s after the last change. Click 💾 to save now.` : 'Auto-save is OFF — your changes only land in localStorage. Click 💾 (or Ctrl+S) to write to the file.'} className="toggle">
        <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} />
        <span className="slider" />
      </label>
      {(() => {
        // One status pill that summarises everything: file mounted? auto on? changes pending? countdown?
        let text, color, tip, clickable = false;
        if (!fileName) {
          text = 'no file mounted'; color = 'var(--tx3)';
          tip = 'Changes are kept in localStorage only. Use "Save as" to mount a file.';
        } else if (!fileWriteOk) {
          text = '⚠ click to re-mount'; color = 'var(--am)'; clickable = true;
          tip = 'File permission was lost (typically after a page reload). Click to re-pick the file with a Save-As dialog — it will suggest the original filename.';
        } else if (!autoSave) {
          text = lastSavedAt ? `auto-save off · last saved ${lastSavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'auto-save off';
          color = 'var(--tx3)';
          tip = 'Auto-save is off. Use 💾 or Ctrl/Cmd+S to write to the file.';
        } else if (saving) {
          text = 'saving…'; color = 'var(--ac)';
          tip = 'Writing changes to the file now.';
        } else if (fileSynced) {
          text = lastSavedAt ? `all saved · ${lastSavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'all saved';
          color = 'var(--gr)';
          tip = 'No unsaved changes. The file on disk matches what you see.';
        } else {
          text = saveCountdown > 0 ? `unsaved · saving in ${saveCountdown}s` : 'saving…';
          color = 'var(--am)';
          tip = `Changes are safe in localStorage and will be written to the file ${SAVE_DEBOUNCE_MS / 1000}s after your last edit. Press Ctrl/Cmd+S or click 💾 to save now.`;
        }
        return <span style={{ fontSize: 10, color, cursor: clickable ? 'pointer' : 'default', userSelect: 'none', fontFamily: 'var(--mono)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          data-htip={tip}
          onClick={() => { if (clickable) saveToFile(true); }}>
          {text}
          {externalChangeAvailable && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            <span style={{ color: 'var(--am)' }}>· file changed</span>
            <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); reloadFromFile(); }} style={{ padding: '1px 5px', fontSize: 9, color: 'var(--am)' }} data-htip="Reload project from the file on disk (overwrites current in-memory state)">reload</button>
            <span style={{ cursor: 'pointer', fontSize: 9, color: 'var(--tx3)' }} onClick={e => { e.stopPropagation(); setExternalChangeAvailable(false); }} data-htip="Dismiss — ignore this external change">×</span>
          </span>}
        </span>;
      })()}
      <div className="vsep" />
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{scheduled.length} scheduled · {leaves.filter(r => r.status === 'done').length}/{leaves.length} done</span>
      <div className="sp" />
      <button className="btn btn-sec btn-sm" onClick={() => setModal('settings')}>⚙ Settings</button>
      <button className="btn btn-sec btn-sm" data-htip={_t('tour.helpTitle')}
        onClick={startTour}>{_t('tour.help')}</button>
      <div className="vsep" />
      <button className="btn btn-sec btn-sm" onClick={loadFromFile}>Load</button>
      <button className="btn btn-sec btn-sm" onClick={() => saveToFile(true)} data-htip="Save as (pick format: JSON or Markdown)">Save as</button>
      <select className="btn btn-sec btn-sm" style={{ padding: '4px 8px' }} value="" onChange={e => { const v = e.target.value; e.target.value = ''; const ctx = { ..._exportCtx(), selectedIds: multiSel.size > 0 ? multiSel : null }; if (v === 'jira') { setModal('jira'); } else if (v === 'report') exportReport(ctx); else if (v === 'sprint') exportSprintMarkdown(ctx); else if (v === 'png-net') exportNetworkPNG(ctx); else if (v === 'png-gantt') exportGanttPNG(ctx); else if (v === 'mermaid') exportMermaid(ctx); else if (v === 'json') exportJSON(ctx); }}>
        <option value="">Export ▾</option>
        <option value="jira">Jira…</option>
        <option value="report">Summary (PDF)</option>
        <option value="sprint">Sprint TODO (Markdown)</option>
        {tab === 'net' && <option value="png-net">Netzwerk (PNG)</option>}
        {tab === 'gantt' && <option value="png-gantt">Gantt (PNG)</option>}
        <option value="mermaid">Mermaid (Confluence)</option>
        <option value="json">Backup (JSON)</option>
      </select>
      <button className="btn btn-pri btn-sm" onClick={() => { if (!saved && !confirm('Unsaved changes will be lost.')) return; newProject(); }}>New</button>
      <input ref={fRef} type="file" accept=".json,.md" style={{ display: 'none' }} onChange={loadFile} />
    </div>
    <div className="tab-bar">
      {TABS.map(t => (
        <div key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
          {t.label}
          {t.isNew && <span className="badge-new">{_t('tour.newBadge')}</span>}
        </div>
      ))}
      <div style={{ flex: 1 }} />
    </div>
    {(tab === 'tree' || tab === 'gantt' || tab === 'net' || tab === 'plan') && <div className="subtoolbar">
      {/* Root + Team + Person filters: shared across Tree, Gantt, Network, Plan */}
      <div style={{ width: 200 }}><SearchSelect value={rootFilter} options={netRootOptions} onSelect={v => { setRootFilter(v); setSearchIdx(0); }} placeholder={_t('tv.allRoots')} allowEmpty emptyLabel={_t('tv.allRoots')} showIds /></div>
      <div style={{ width: 150 }}><SearchSelect value={teamFilter} options={teams.map(t => ({ id: t.id, label: t.name || t.id }))} onSelect={v => { setTeamFilter(v); setSearchIdx(0); }} placeholder={_t('tv.allTeams')} allowEmpty emptyLabel={_t('tv.allTeams')} /></div>
      <div style={{ width: 150 }}><SearchSelect value={personFilter} options={members.map(m => ({ id: m.id, label: m.name || m.id }))} onSelect={v => { setPersonFilter(v); setSearchIdx(0); }} placeholder={_t('tv.allPeople')} allowEmpty emptyLabel={_t('tv.allPeople')} /></div>
      {tab === 'tree' && <button className="btn btn-sec btn-sm" onClick={() => setModal('add')}>+ Add item</button>}
      <div style={{ flex: 1 }} />
      {tab !== 'plan' && <input ref={searchRef} className="btn btn-sec" style={{ padding: '5px 10px', width: 220 }}
        placeholder={`Search… (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+F)`}
        value={search} onChange={e => { setSearch(e.target.value); setSearchIdx(0); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setSearch(''); e.target.blur(); return; }
          if (e.key === 'Enter') { e.preventDefault(); setSearchIdx(i => e.shiftKey ? i - 1 : i + 1); }
          if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') { e.preventDefault(); setSearchIdx(i => i + 1); }
          if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') { e.preventDefault(); setSearchIdx(i => i - 1); }
        }} />}
      {tab !== 'plan' && search && <>
        <button className="btn btn-ghost btn-xs" onClick={() => setSearchIdx(i => i - 1)} data-htip={`Previous match (Shift+Enter / ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+↑)`} style={{ padding: '2px 5px', fontSize: 13 }}>▲</button>
        <button className="btn btn-ghost btn-xs" onClick={() => setSearchIdx(i => i + 1)} data-htip={`Next match (Enter / ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+↓)`} style={{ padding: '2px 5px', fontSize: 13 }}>▼</button>
        <button className="btn btn-ghost btn-xs" onClick={() => { setSearch(''); setSearchIdx(0); }} data-htip="Clear search (Esc)" style={{ padding: '2px 7px', fontSize: 11 }}>×</button>
      </>}
    </div>}
    <div className="main">
      {visitedTabs.has('summary') && <div className="pane" style={{ display: tab === 'summary' ? undefined : 'none' }}><SumView tree={tree} scheduled={scheduled} goals={goals} members={members} teams={teams} cpSet={cpSet} goalPaths={goalPaths} stats={stats} confidence={confidence}
        onNavigate={(id, target) => { const node = tree.find(r => r.id === id); if (node) setSel(node); setTab(target || 'tree'); }}
        onOpenItem={id => { const node = tree.find(r => r.id === id); if (node) { setMN(node); setModal('node'); } }}
        onExportTodo={horizonDays => exportSprintMarkdown({ ..._exportCtx(), horizonDays })} /></div>}
      {visitedTabs.has('plan') && <div className="pane" style={{ display: tab === 'plan' ? undefined : 'none' }}><PlanReview tree={tree} scheduled={scheduled} members={members} teams={teams} confidence={confidence} confReasons={confReasons} cpSet={cpSet} stats={stats} rootFilter={rootFilter} teamFilter={teamFilter} personFilter={personFilter}
        onOpenItem={id => { const node = tree.find(r => r.id === id); if (node) { setMN(node); setModal('node'); } }}
        onUpdate={updateNode} /></div>}
      {visitedTabs.has('tree') && <div className="pane-full" style={{ display: tab === 'tree' ? 'flex' : 'none', flexDirection: 'row' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {!tree.length
            ? <div className="empty" style={{ marginTop: 60 }}><div style={{ fontSize: 32, marginBottom: 12 }}>🌳</div><div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No items yet</div><button className="btn btn-pri" onClick={() => setModal('add')}>+ Add first item</button></div>
            : <TreeView tree={tree} selected={selected} multiSel={multiSel} onSelect={(node, e, visibleIds) => {
                if (e?.shiftKey && selected && visibleIds) {
                  // Shift-click: range select from last selected to this
                  const ai = visibleIds.indexOf(selected.id), bi = visibleIds.indexOf(node.id);
                  if (ai >= 0 && bi >= 0) {
                    const range = visibleIds.slice(Math.min(ai, bi), Math.max(ai, bi) + 1);
                    setMultiSel(new Set(range));
                  }
                } else if (e?.ctrlKey || e?.metaKey) {
                  setMultiSel(s => { const n = new Set(s); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; });
                  if (!selected) setSel(node);
                } else { setSel(node); setMultiSel(new Set()); }
              }} search={search} teamFilter={teamFilter} rootFilter={rootFilter} personFilter={personFilter} stats={stats} teams={teams} members={members} scheduled={scheduled} cpSet={cpSet}
              customFields={data.customFields || DEFAULT_CUSTOM_FIELDS}
              onQuickAdd={parent => { const id = nextChildId(tree, parent.id); const node = { id, name: 'New child item', status: 'open', team: parent.team || '', best: 0, factor: 1.5, prio: 2, seq: 10, deps: [], note: '', assign: [] }; addNode(node); setSel(node); setMultiSel(new Set()); }}
              onDelete={deleteNode} onReorder={reorderSibling} />
          }
        </div>
        {selected && <div className="side fade">
          {multiSel.size > 0 ? <>
            <div className="side-hdr"><h3>{multiSel.size} items selected</h3>
              <button className="btn btn-ghost btn-icon sm" onClick={() => { setSel(null); setMultiSel(new Set()); }}>×</button>
            </div>
            {(() => {
              const selItems = tree.filter(r => multiSel.has(r.id));
              const commonOf = (key, getter = r => r[key]) => { const vals = selItems.map(getter); const first = vals[0]; return vals.every(v => v === first) ? first : null; };
              const commonAssign = (() => { const first = selItems[0]?.assign?.[0]; if (!first) return null; return selItems.every(r => (r.assign || []).length === 1 && r.assign[0] === first) ? first : null; })();
              const commonTeam = commonOf('team');
              const commonStatus = commonOf('status');
              const commonPrio = commonOf('prio');
              const commonBest = commonOf('best');
              const commonFactor = commonOf('factor');
              const commonNote = commonOf('note');
              const allLeaf = selItems.every(r => isLeafNode(tree, r.id));
              const anyNonRoot = selItems.some(r => r.id.includes('.'));
              const batchTabs = [
                { id: 'overview', label: _t('qe.tab.overview') },
                ...(anyNonRoot ? [{ id: 'workflow', label: _t('qe.tab.workflow') }] : []),
                ...(allLeaf ? [{ id: 'effort', label: _t('qe.tab.effort') }] : []),
              ];
              const bTab = batchTabs.find(bt => bt.id === sideTab) ? sideTab : 'overview';

              return <div className="side-body">
                <p className="helper" style={{ marginBottom: 10 }}>Ctrl+Click to add/remove items. Common values shown — changes apply to all selected.</p>

                <div className="qe-tabs">
                  {batchTabs.map(bt => <button key={bt.id} className={`qe-tab${bTab === bt.id ? ' active' : ''}`} onClick={() => setSideTab(bt.id)}>{bt.label}</button>)}
                </div>

                {bTab === 'overview' && <>
                  {allLeaf && <div className="field"><label>Status{commonStatus == null ? ' (mixed)' : ''}</label>
                    <SearchSelect value={commonStatus || ''} options={[{ id: 'open', label: _t('open') }, { id: 'wip', label: _t('wip') }, { id: 'done', label: _t('done') }]} onSelect={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, status: v } : r))} placeholder="Choose status..." />
                  </div>}
                  <div className="field"><label>{_t('qe.notes')}{commonNote == null ? ' (mixed)' : ''}</label>
                    <LazyInput value={commonNote ?? ''} onCommit={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, note: v } : r))} placeholder="(empty)" />
                  </div>

                  {/* ── Phases batch (in overview because phases define status) ── */}
                  {anyNonRoot && <>
                    {(data.taskTemplates || []).length > 0 && <div className="field"><label>{_t('ph.applyTemplate')}</label>
                      <SearchSelect options={(data.taskTemplates || []).map(tp => ({ id: tp.id, label: tp.name }))}
                        onSelect={tplId => {
                          const tpl = (data.taskTemplates || []).find(tp => tp.id === tplId);
                          if (!tpl) return;
                          setD('tree', tree.map(r => {
                            if (!multiSel.has(r.id)) return r;
                            const phases = instantiateTemplatePhases(tpl.phases);
                            return { ...r, phases, templateId: tplId, status: 'open', progress: 0 };
                          }));
                        }} placeholder={_t('ph.applyTemplate')} />
                    </div>}

                    {(() => {
                      const withPhases = selItems.filter(r => r.phases?.length);
                      if (!withPhases.length) return null;
                      const refPhases = withPhases[0].phases;
                      const allSameStructure = withPhases.length === selItems.length && withPhases.every(r => r.phases.length === refPhases.length && r.phases.every((p, i) => p.name === refPhases[i].name));
                      if (!allSameStructure) return null;
                      return <div className="field"><label>{_t('ph.phases')}</label>
                        {refPhases.map((ph, i) => {
                          const statuses = withPhases.map(r => r.phases[i].status);
                          const common = statuses.every(s => s === statuses[0]) ? statuses[0] : null;
                          const dot = common === 'done' ? '✓' : common === 'wip' ? '◐' : common === 'open' ? '○' : '?';
                          const dotColor = common === 'done' ? 'var(--gn)' : common === 'wip' ? 'var(--ac)' : 'var(--tx3)';
                          return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ cursor: 'pointer', fontSize: 13, color: dotColor, width: 18, textAlign: 'center', flexShrink: 0, userSelect: 'none' }}
                              onClick={() => {
                                const next = common === 'open' ? 'wip' : common === 'wip' ? 'done' : 'open';
                                setD('tree', tree.map(r => {
                                  if (!multiSel.has(r.id) || !r.phases?.[i]) return r;
                                  const newPhases = r.phases.map((p, j) => j === i ? { ...p, status: next } : p);
                                  const done = newPhases.filter(p => p.status === 'done').length;
                                  const wip2 = newPhases.filter(p => p.status === 'wip').length;
                                  const st = done === newPhases.length ? 'done' : (done > 0 || wip2 > 0) ? 'wip' : 'open';
                                  const prog = Math.round(done / newPhases.length * 100);
                                  return { ...r, phases: newPhases, status: st, progress: prog };
                                }));
                              }}>{dot}</span>
                            <span style={{ fontSize: 11, color: common === 'done' ? 'var(--tx3)' : 'var(--tx)', textDecoration: common === 'done' ? 'line-through' : 'none' }}>{ph.name}</span>
                            {common == null && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>(mixed)</span>}
                          </div>;
                        })}
                      </div>;
                    })()}
                  </>}
                </>}

                {bTab === 'workflow' && <>
                  <div className="field"><label>{_t('qe.team')}{commonTeam == null ? ' (mixed)' : ''}</label>
                    <SearchSelect value={commonTeam || ''} options={teams.map(t => ({ id: t.id, label: t.name }))} onSelect={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, team: v } : r))} placeholder="Choose team..." allowEmpty />
                  </div>
                  <div className="field"><label>{_t('qe.assignee')}</label>
                    {(() => {
                      const commonAssigns = selItems[0]?.assign?.filter(a => selItems.every(r => (r.assign || []).includes(a))) || [];
                      return <>
                        {commonAssigns.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                          {commonAssigns.map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" data-htip="Remove from all selected" onClick={() => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, assign: (r.assign || []).filter(x => x !== a) } : r))}>×</span></span>; })}
                        </div>}
                        <SearchSelect options={members.filter(m => !commonAssigns.includes(m.id)).map(m => ({ id: m.id, label: m.name || m.id }))} onSelect={v => { const m = members.find(x => x.id === v); setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, assign: [...new Set([...(r.assign || []), v])], team: m?.team || r.team } : r)); }} placeholder={_t('qe.assignPerson')} />
                      </>;
                    })()}
                  </div>
                </>}

                {bTab === 'effort' && <>
                  {allLeaf && <div className="frow">
                    <div className="field"><label>{_t('qe.bestDays')}{commonBest == null ? ' (mixed)' : ''}</label>
                      <LazyInput type="number" min="0" value={commonBest ?? ''} onCommit={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, best: +v } : r))} />
                    </div>
                    <div className="field"><label>{_t('qe.factor')}{commonFactor == null ? ' (mixed)' : ''}</label>
                      <LazyInput type="number" step="0.1" min="1" value={commonFactor ?? ''} onCommit={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, factor: +v } : r))} />
                    </div>
                  </div>}
                  <div className="field"><label>{_t('qe.priority')}{commonPrio == null ? ' (mixed)' : ''}</label>
                    <SearchSelect value={commonPrio ? String(commonPrio) : ''} options={[{ id: '1', label: `1 ${_t('critical')}` }, { id: '2', label: `2 ${_t('high')}` }, { id: '3', label: `3 ${_t('medium')}` }, { id: '4', label: `4 ${_t('low')}` }]} onSelect={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, prio: +v } : r))} placeholder="Choose priority..." />
                  </div>
                  <div className="field"><label>{_t('qe.confidence')}</label>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[['', _t('auto')], ['committed', '●'], ['estimated', '◐'], ['exploratory', '○']].map(([v, l]) =>
                        <button key={v} className="btn btn-sec btn-xs" style={{ flex: 1, fontSize: 10 }}
                          onClick={() => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, confidence: v } : r))}>{l}</button>)}
                    </div>
                  </div>
                </>}

                <hr className="divider" />
                <button className="btn btn-sec btn-sm" style={{ width: '100%', marginBottom: 6 }} onClick={() => setMultiSel(new Set())}>Clear selection</button>
              </div>;
            })()}
          </> : <>
            <div className="side-hdr"><h3>{selected.id}</h3>
              <button className="btn btn-ghost btn-icon sm" data-htip="Full edit" onClick={() => { setMN(selected); setModal('node'); }}>⊞</button>
              <button className="btn btn-ghost btn-icon sm" onClick={() => setSel(null)}>×</button>
            </div>
            <div className="side-body"><QuickEdit node={selected} tree={tree} members={members} teams={teams} taskTemplates={data.taskTemplates || []} sizes={data.sizes || []} customFields={data.customFields || DEFAULT_CUSTOM_FIELDS} scheduled={scheduled} cpSet={cpSet} stats={stats} confidence={confidence} confReasons={confReasons} onUpdate={updateNode} onDelete={id => { deleteNode(id); setSel(null); }} onEstimate={n => { setMN(n); setModal('estimate'); }} tab={sideTab} onTabChange={setSideTab}
              onDuplicate={id => { const newId = duplicateNode(id); if (newId) setTimeout(() => { const n = tree.find(r => r.id === newId); if (n) setSel(n); }, 50); }}
              onReorderInQueue={reorderInQueue} /></div>
          </>}
        </div>}
      </div>}
      {visitedTabs.has('gantt') && <div className="pane-full" style={{ display: tab === 'gantt' ? 'flex' : 'none' }}><GanttView scheduled={scheduled} weeks={weeks} goals={goals} teams={teams} members={members} vacations={vacations} cpSet={cpSet} tree={tree} search={search} searchIdx={searchIdx} workDays={workDays} planStart={planStart} confidence={confidence} confReasons={confReasons} rootFilter={rootFilter} teamFilter={teamFilter} personFilter={personFilter} onBarClick={onBarClick} onSeqUpdate={onSeqUpdate} onExtendViewStart={extendViewStart} onTaskUpdate={updateNode} onRemoveDep={removeDep} onAddDep={addDep} onReorderInQueue={reorderInQueue} /></div>}
      {visitedTabs.has('net') && <div className="pane-full" style={{ display: tab === 'net' ? 'flex' : 'none' }}><NetGraph tree={netTree} scheduled={scheduled} teams={teams} members={members} cpSet={cpSet} stats={stats} search={search} searchIdx={searchIdx} isFiltered={!!rootFilter || !!teamFilter || !!personFilter}
        onNodeClick={r => onBarClick(r)}
        onAddNode={() => setModal('add')}
        onAddDep={(fromId, toId) => { const node = tree.find(r => r.id === fromId); if (node) { const deps = [...new Set([...(node.deps || []), toId])]; updateNode({ ...node, deps }); } }}
        onDeleteNode={id => deleteNode(id)} /></div>}
      {visitedTabs.has('resources') && <div className="pane" style={{ display: tab === 'resources' ? undefined : 'none' }}><ResView members={members} teams={teams} vacations={vacations} onUpd={updateMember} onAdd={addMember} onClone={cloneMember} onDel={deleteMember} onVac={v => setD('vacations', v)}
        onTeamUpd={(i, k, v) => setD('teams', teams.map((t, j) => j === i ? { ...t, [k]: v } : t))}
        onTeamAdd={() => setD('teams', [...teams, { id: `T${teams.length + 1}`, name: 'New Team', color: '#3b82f6' }])}
        onTeamDel={i => setD('teams', teams.filter((_, j) => j !== i))} /></div>}
      {visitedTabs.has('holidays') && <div className="pane" style={{ display: tab === 'holidays' ? undefined : 'none' }}><HolView holidays={data.holidays || []} planStart={planStart} planEnd={planEnd} onUpdate={v => setD('holidays', v)} /></div>}
    </div>
    {modal === 'node' && modalNode && <NodeModal node={tree.find(r => r.id === modalNode.id) || modalNode} tree={tree} members={members} teams={teams} taskTemplates={data.taskTemplates || []} sizes={data.sizes || []} customFields={data.customFields || DEFAULT_CUSTOM_FIELDS} scheduled={scheduled} cpSet={cpSet} stats={stats} confidence={confidence} confReasons={confReasons}
      onClose={() => { setModal(null); setMN(null); }} onUpdate={updateNode} onDelete={deleteNode} onEstimate={n => { setMN(n); setModal('estimate'); }}
      onDuplicate={id => { const newId = duplicateNode(id); if (newId) { setModal(null); setMN(null); setTimeout(() => { const n = tree.find(r => r.id === newId) || { id: newId }; setSel(n); }, 50); } }}
      onMove={(id, newParentId) => { const newId = moveNode(id, newParentId); if (newId) { setMN({ id: newId }); setTimeout(() => { const n = { ...modalNode, id: newId }; setSel(n); }, 50); } }}
      onReorderInQueue={reorderInQueue} />}
    {modal === 'add' && <AddModal tree={tree} teams={teams} taskTemplates={data.taskTemplates || []} sizes={data.sizes || []} selected={selected} onAdd={addNode} onClose={() => setModal(null)} />}
    {modal === 'settings' && <SettingsModal meta={meta} taskTemplates={data.taskTemplates || []} risks={data.risks || []} sizes={data.sizes || []} customFields={data.customFields || DEFAULT_CUSTOM_FIELDS} teams={teams} onSave={m => setD('meta', m)} onSaveTemplates={tpls => setD('taskTemplates', tpls)} onSaveRisks={r => setD('risks', r)} onSaveSizes={s => setD('sizes', s)} onSaveCustomFields={cf => setD('customFields', cf)} onClose={() => setModal(null)} />}
    {modal === 'new' && <NewProjModal onClose={() => setModal(null)} onCreate={d => { setData(d); setSaved(false); setModal(null); setTab('tree'); setSel(d.tree?.[0] || null); }} />}
    {modal === 'estimate' && modalNode && <EstimationWizard node={tree.find(r => r.id === modalNode.id) || modalNode} tree={tree} teams={teams} taskTemplates={data.taskTemplates || []} risks={data.risks || []} sizes={data.sizes || []}
      onSave={est => { const node = tree.find(r => r.id === modalNode.id); if (node) updateNode({ ...node, ...est }); }}
      onClose={() => { setModal(null); setMN(null); }} />}
    {modal === 'jira' && <JiraExportModal tree={tree} scheduled={scheduled} members={members} teams={teams} meta={meta} onClose={() => setModal(null)} />}

    {/* ── Onboarding tour ── */}
    {tourStep !== null && (
      <Tour
        steps={TOUR_STEPS}
        step={tourStep}
        onNext={() => setTourStep(s => Math.min(s + 1, TOUR_STEPS.length - 1))}
        onPrev={() => setTourStep(s => Math.max(s - 1, 0))}
        onSkip={closeTour}
      />
    )}

    {/* ── New-feature popover (one-time, existing users) ── */}
    {showNewFeat && tourStep === null && (
      <div className="new-feat-backdrop fade" onClick={dismissNewFeat}>
        <div className="new-feat-card fade" onClick={e => e.stopPropagation()}>
          <div className="new-feat-title">
            <span style={{ fontSize: 16 }}>🎉</span>
            {_t('new.title')}
          </div>
          <ul className="new-feat-list">
            {NEW_FEATURES.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
          <div className="new-feat-foot" style={{ gap: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--tx3)' }}
              onClick={() => { dismissNewFeat(); startTour(); }}>
              {_t('tour.restartTour')} →
            </button>
            <button className="btn btn-pri btn-sm" onClick={dismissNewFeat}>
              {_t('new.dismiss')}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
  </>;
}
