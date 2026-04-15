import { useState, useMemo, useRef, useEffect } from 'react';
import { SK } from './constants.js';
import { iso } from './utils/date.js';
import { buildHMap } from './utils/holidays.js';
import { schedule, treeStats, enrichParentSchedules, nextChildId, deriveParentStatuses, leafNodes, isLeafNode } from './utils/scheduler.js';
import { cpm, goalCpm } from './utils/cpm.js';
import { clearMountedFileHandle, loadMountedFileHandle, persistMountedFileHandle, queryHandlePermission, requestHandlePermission } from './utils/fileHandleStore.js';
import { TreeView } from './components/views/TreeView.jsx';
import { QuickEdit } from './components/views/QuickEdit.jsx';
import { GanttView } from './components/views/GanttView.jsx';
import { NetGraph } from './components/views/NetGraph.jsx';
import { ResView } from './components/views/ResView.jsx';
import { HolView } from './components/views/HolView.jsx';
import { DLView } from './components/views/DLView.jsx';
import { SumView } from './components/views/SumView.jsx';
import { Onboard } from './components/views/Onboard.jsx';
import { NodeModal } from './components/modals/NodeModal.jsx';
import { AddModal } from './components/modals/AddModal.jsx';
import { SettingsModal } from './components/modals/SettingsModal.jsx';
import { DLModal } from './components/modals/DLModal.jsx';
import { NewProjModal } from './components/modals/NewProjModal.jsx';
import { EstimationWizard } from './components/modals/EstimationWizard.jsx';
import { SearchSelect } from './components/shared/SearchSelect.jsx';
import { LazyInput } from './components/shared/LazyInput.jsx';

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
  const [data, setData] = useState(() => loadLocalProject());
  const [tab, _setTab] = useState(() => { try { return localStorage.getItem('planr_tab') || 'summary'; } catch { return 'summary'; } });
  const setTab = t => { _setTab(t); try { localStorage.setItem('planr_tab', t); } catch {} };
  const [selected, setSel] = useState(null);
  const [multiSel, setMultiSel] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [modalNode, setMN] = useState(null);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [saved, setSaved] = useState(true);
  const fRef = useRef(null);
  const fileHandleRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [autoSave, setAutoSave] = useState(() => { try { const v = localStorage.getItem('planr_autosave'); return v === null ? true : v === 'true'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('planr_autosave', String(autoSave)); } catch {} }, [autoSave]);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);

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
        const restored = handle.name?.endsWith('.md') ? parseMdToProject(text) : JSON.parse(text);
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

  // File save: queued every 60s if there are unsaved changes (and auto-save is on)
  // Manual force-save via disk icon (saveToFile) bypasses this and saves immediately
  const FILE_SAVE_INTERVAL_MS = 60000;
  useEffect(() => {
    if (!data || !autoSave || !fileHandleRef.current) return;
    const interval = setInterval(async () => {
      if (fileSynced) return; // file already up-to-date
      const handle = fileHandleRef.current;
      if (!handle) return;
      const canWrite = await ensureHandlePermission(handle, false);
      if (!canWrite) { setFileWriteOk(false); return; }
      try {
        const content = handle.name?.endsWith('.md') ? buildMarkdownText() : JSON.stringify(data, null, 2);
        const wr = await handle.createWritable();
        await wr.write(content);
        await wr.close();
        setFileWriteOk(true);
        setFileSynced(true);
        lastOwnWriteRef.current = Date.now();
        setLastSavedAt(new Date());
      } catch (e) { console.error('Queued auto-save failed:', e); setFileWriteOk(false); }
    }, FILE_SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [data, autoSave, fileSynced]);

  // Detect external file changes (poll every 5s)
  const lastModRef = useRef(null);
  useEffect(() => {
    if (!fileHandleRef.current) return;
    const poll = setInterval(async () => {
      try {
        const file = await fileHandleRef.current.getFile();
        const mod = file.lastModified;
        // Skip if this is our own write (within 3s window) or if user has unsaved edits
        const isOwnWrite = (Date.now() - lastOwnWriteRef.current) < 3000;
        if (lastModRef.current && mod > lastModRef.current && saved && !isOwnWrite) {
          const text = await file.text();
          const isMd = file.name.endsWith('.md');
          const d = isMd ? parseMdToProject(text) : JSON.parse(text);
          if (d?.tree && Array.isArray(d.tree) && d.tree.length > 0) {
            setData(d);
            setLastSavedAt(new Date(mod));
          }
        }
        lastModRef.current = mod;
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [fileName, saved]);

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
    let projName = null;
    let planStart = '', planEnd = '';
    const idStack = [];
    let section = null; // 'plan' | 'teams' | 'resources' | 'vacations' | 'holidays' | 'tree' | null
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
        else if (lower === 'work tree') section = 'tree';
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
            .filter(p => !/^\(?\d+%\)?$/.test(p) && !/^ab\s/.test(p) && !/^\d+d\/y$/.test(p))
            .map(p => p.replace(/\s*\(\d+%\)\s*/g, '').trim())
            .filter(Boolean);
          const capM = meta.match(/\((\d+)%\)/);
          const vacM = meta.match(/(\d+)d\/y/);
          const startM = meta.match(/ab\s+(\d{4}-\d{2}-\d{2})/);
          if (teamPart) teamSet.add(teamPart);
          const m = { id: 'm' + Date.now() + mems.length, name: rm[1].trim(), team: teamPart, role: roleParts.join(', '), cap: capM ? +capM[1] / 100 : 1, vac: vacM ? +vacM[1] : 25, start: startM?.[1] || '' };
          if (shortName) m._parsedShort = shortName;
          mems.push(m);
        }
        return;
      }

      // Vacation Weeks section: table | Person | Week | Note |
      if (section === 'vacations') {
        const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
        if (m && !/^Person$/i.test(m[1])) {
          vacationsArr.push({ person: m[1].trim(), week: m[2].trim(), note: m[3].trim() });
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
      // Extract metadata tag block: {prio:N, seq:N, severity}
      let prio = 2, seq = 0, severity = 'high';
      const tagM = raw.match(/\s*\{([^}]+)\}\s*$/);
      if (tagM) {
        const tags = tagM[1].split(',').map(t => t.trim());
        tags.forEach(t => {
          const pm = t.match(/^prio:(\d+)$/i); if (pm) { prio = +pm[1]; return; }
          const sm = t.match(/^seq:(\d+)$/i); if (sm) { seq = +sm[1]; return; }
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
    tree.forEach(r => { if (r.team) teamSet.add(r.team); });
    mems.forEach(m => { if (m.team) { m.team = sanitizeTeam(m.team); teamSet.add(m.team); } });

    // Build teams: prefer explicit team table, fall back to inferred
    const usedTeamNames = [...teamSet];
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const teamsArr = usedTeamNames.map((name, i) => {
      const exp = explicitTeams.find(t => t.name === name);
      return { id: `T${i + 1}`, name, color: exp?.color || palette[i % palette.length] };
    });
    const teamLookup = Object.fromEntries(teamsArr.map(t => [t.name, t.id]));
    tree.forEach(r => { if (r.team) r.team = teamLookup[r.team] || r.team; });
    mems.forEach(m => { if (m.team) m.team = teamLookup[m.team] || m.team; });
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
    tree.forEach(r => { if (r.assign?.length) r.assign = r.assign.map(resolveMember); });
    vacationsArr.forEach(v => { v.person = resolveMember(v.person); });
    // Strip transient _parsedShort field from members
    mems.forEach(m => { delete m._parsedShort; });

    const metaObj = { name: projName || 'Imported Project', version: '2' };
    if (planStart) metaObj.planStart = planStart;
    if (planEnd) metaObj.planEnd = planEnd;
    return { meta: metaObj, teams: teamsArr, members: mems, tree, vacations: vacationsArr, holidays: holidaysArr };
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
        const d = isMd ? parseMdToProject(text) : JSON.parse(text);
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

  // Ctrl+S → save to file
  useEffect(() => { const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveToFile(); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); });

  const { tree = [], members = [], teams = [], vacations = [], meta = {} } = data || {};
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
  const planEnd = meta.planEnd || iso(new Date(new Date().getFullYear() + 2, 11, 31));
  const { results: scheduled, weeks } = useMemo(() => data ? schedule(tree, members, vacations, planStart, planEnd, hm) : { results: [], weeks: [] }, [tree, members, vacations, planStart, planEnd, hm]);
  const stats = useMemo(() => { const s = treeStats(tree); enrichParentSchedules(s, tree, scheduled); return s; }, [tree, scheduled]);
  const cpSet = useMemo(() => cpm(tree).critical, [tree]);
  const goalPaths = useMemo(() => goalCpm(tree), [tree]);
  const leaves = useMemo(() => leafNodes(tree), [tree]);
  const shortNamesMap = useMemo(() => buildMemberShortMap(members), [members]);

  // Auto-derive parent statuses from children
  useEffect(() => {
    if (!data || !tree.length) return;
    const updated = deriveParentStatuses(tree, stats);
    if (updated.some((r, i) => r.status !== tree[i].status)) { setData(d => ({ ...d, tree: updated })); }
  }, [stats]);

  // Auto-reconcile team with assigned person — person's team always wins.
  // Catches: stale data after team rename, MD imports with mismatching team,
  // member changing team after assignment.
  useEffect(() => {
    if (!data || !tree.length || !members.length) return;
    let changed = false;
    const updated = tree.map(r => {
      if (!r.assign?.length) return r;
      const firstAssignee = members.find(m => m.id === r.assign[0]);
      if (!firstAssignee?.team) return r;
      if (r.team !== firstAssignee.team) { changed = true; return { ...r, team: firstAssignee.team }; }
      return r;
    });
    if (changed) setData(d => ({ ...d, tree: updated }));
  }, [tree, members]);

  function setD(k, v) { setData(d => ({ ...d, [k]: v })); setSaved(false); }
  function updateNode(u) { setD('tree', tree.map(r => r.id === u.id ? u : r)); }
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
  function updateMember(m) { setD('members', members.map(x => x.id === m.id ? m : x)); }
  function addMember() { const id = 'm' + Date.now(); setD('members', [...members, { id, name: 'New person', team: teams[0]?.id || '', role: '', cap: 1.0, vac: 25, start: planStart }]); }
  function cloneMember(src) { const id = 'm' + Date.now(); setD('members', [...members, { ...src, id, team: '', cap: 0.5 }]); }
  function deleteMember(id) { setD('members', members.filter(m => m.id !== id)); }
  // Gantt drag callback. Accepts either a number (legacy seq update) or an object patch (e.g. {pinnedStart}).
  function onSeqUpdate(taskId, patch) {
    const update = typeof patch === 'object' && patch !== null ? patch : { seq: patch };
    setD('tree', tree.map(r => r.id === taskId ? { ...r, ...update } : r));
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'project').toLowerCase().replace(/\s+/g, '-')}-${iso(new Date())}.json`; a.click();
  }
  function exportPDF() { window.print(); }
  // Build a clean light-mode SVG of the network graph (used for both SVG and PNG export)
  function buildNetworkSvg() {
    const svg = document.querySelector('.netgraph-wrap svg');
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const g = clone.querySelector('g');
    if (g) g.removeAttribute('transform');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      svg { background: #f8f9fc; --bg: #f8f9fc; --bg2: #ffffff; --bg3: #f0f2f5; --bg4: #e5e8ee;
        --b: #e0e4ea; --b2: #ccd2dc; --b3: #b0b8c8; --tx: #1a1e2a; --tx2: #4a5268; --tx3: #7a839a;
        --ac: #2563eb; --ac2: #1d4ed8; --gr: #16a34a; --am: #d97706; --re: #dc2626;
        --r: 7px; --mono: 'JetBrains Mono', monospace; --font: 'Inter', sans-serif; }
      text { font-family: 'Inter', sans-serif; }
    `;
    clone.prepend(style);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const allNodes = clone.querySelectorAll('g > g');
    allNodes.forEach(n => {
      const t = n.getAttribute('transform');
      if (t) {
        const m = t.match(/translate\(([^,]+),([^)]+)\)/);
        if (m) { const x = +m[1], y = +m[2]; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + 250); maxY = Math.max(maxY, y + 60); }
      }
    });
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 1200; maxY = 800; }
    const pad = 40;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    clone.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${w} ${h}`);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    return { svg: clone, width: w, height: h };
  }

  function exportSVG() {
    const r = buildNetworkSvg();
    if (!r) return alert('Switch to the Network tab first.');
    const blob = new Blob([new XMLSerializer().serializeToString(r.svg)], { type: 'image/svg+xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-network.svg`; a.click();
  }

  // Convert SVG to PNG via Canvas (2× scale for crisp Retina/Whiteboard rendering)
  async function svgToPng(svgEl, width, height, scale = 2) {
    const xml = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8f9fc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas to blob failed')), 'image/png');
      };
      img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  async function exportNetworkPNG() {
    const r = buildNetworkSvg();
    if (!r) return alert('Switch to the Network tab first.');
    try {
      const blob = await svgToPng(r.svg, r.width, r.height, 2);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-network.png`; a.click();
    } catch (e) { alert('PNG export failed: ' + (e.message || e)); }
  }

  // Build a printable SVG of the Gantt — scheduled bars per team/person, with date axis
  function buildGanttSvg() {
    if (!scheduled?.length || !weeks?.length) return null;
    const WPX = 22; // wider than view for readability in export
    const RH = 24, GH = 28, HH = 50;
    const LW = 280; // left label width
    // Group by team (sorted by team color/name), tasks sorted by start
    const NO_TEAM = '__no_team__';
    const usedT = [...new Set(scheduled.map(s => s.team || NO_TEAM))];
    const tOrd = [...new Set([...teams.map(t => t.id), ...usedT])].filter(t => usedT.includes(t));
    const grp = {};
    tOrd.forEach(t => { grp[t] = scheduled.filter(s => (s.team || NO_TEAM) === t).sort((a, b) => (a.startWi || 0) - (b.startWi || 0)); });
    const rows = [];
    tOrd.forEach(t => { const tasks = grp[t] || []; if (!tasks.length) return; rows.push({ type: 'team', team: t }); tasks.forEach(s => rows.push({ type: 'task', s })); });
    const tw = weeks.length * WPX;
    const totalH = HH + rows.reduce((sum, r) => sum + (r.type === 'team' ? GH : RH), 0) + 20;
    const totalW = LW + tw + 20;
    // Months for header
    const months = []; let cm = null, cc = 0, cs = 0;
    weeks.forEach((w, i) => { const ym = `${w.mon.getFullYear()}-${w.mon.getMonth()}`; if (ym !== cm) { if (cm) months.push({ ym: cm, count: cc, start: cs }); cm = ym; cc = 1; cs = i; } else cc++; });
    if (cm) months.push({ ym: cm, count: cc, start: cs });
    const MDE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const teamColor = tid => tid === NO_TEAM ? '#64748b' : (teams.find(x => x.id === tid)?.color || '#3b82f6');
    const teamName = tid => tid === NO_TEAM ? 'No team' : (teams.find(x => x.id === tid)?.name || tid);

    // Build SVG
    const xmlns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(xmlns, 'svg');
    svg.setAttribute('xmlns', xmlns);
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', totalH);
    svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
    svg.setAttribute('font-family', 'Inter, sans-serif');
    // Background
    const bg = document.createElementNS(xmlns, 'rect');
    bg.setAttribute('width', totalW); bg.setAttribute('height', totalH); bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
    // Title
    const title = document.createElementNS(xmlns, 'text');
    title.setAttribute('x', 10); title.setAttribute('y', 18); title.setAttribute('font-size', 14); title.setAttribute('font-weight', '700'); title.setAttribute('fill', '#1a1e2a');
    title.textContent = (meta.name || 'Project') + ' — Schedule';
    svg.appendChild(title);
    const sub = document.createElementNS(xmlns, 'text');
    sub.setAttribute('x', 10); sub.setAttribute('y', 34); sub.setAttribute('font-size', 10); sub.setAttribute('fill', '#7a839a');
    sub.textContent = `${weeks.length} weeks · ${scheduled.length} scheduled tasks · generated ${new Date().toLocaleDateString('de-DE')}`;
    svg.appendChild(sub);
    // Month header
    let mx = LW;
    months.forEach((m, i) => {
      const [y, mo] = m.ym.split('-');
      const w = WPX * m.count;
      const r = document.createElementNS(xmlns, 'rect');
      r.setAttribute('x', mx); r.setAttribute('y', HH - 24); r.setAttribute('width', w); r.setAttribute('height', 12);
      r.setAttribute('fill', mo === '0' ? '#dbeafe' : '#f0f2f5'); r.setAttribute('stroke', '#ccd2dc');
      svg.appendChild(r);
      const t = document.createElementNS(xmlns, 'text');
      t.setAttribute('x', mx + 4); t.setAttribute('y', HH - 14); t.setAttribute('font-size', 9); t.setAttribute('fill', mo === '0' ? '#1d4ed8' : '#4a5268'); t.setAttribute('font-weight', '600');
      t.textContent = (mo === '0' ? y + ' ' : '') + MDE[+mo];
      svg.appendChild(t);
      mx += w;
    });
    // Week numbers
    weeks.forEach((w, i) => {
      const x = LW + i * WPX;
      const isYB = i > 0 && weeks[i - 1].mon.getFullYear() !== w.mon.getFullYear();
      const r = document.createElementNS(xmlns, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', HH - 12); r.setAttribute('width', WPX); r.setAttribute('height', 12);
      r.setAttribute('fill', w.hasH ? '#fee2e2' : '#ffffff'); r.setAttribute('stroke', '#e0e4ea');
      svg.appendChild(r);
      if (isYB) { const ln = document.createElementNS(xmlns, 'line'); ln.setAttribute('x1', x); ln.setAttribute('x2', x); ln.setAttribute('y1', HH - 24); ln.setAttribute('y2', totalH); ln.setAttribute('stroke', '#1d4ed8'); ln.setAttribute('stroke-width', '1.5'); svg.appendChild(ln); }
      const t = document.createElementNS(xmlns, 'text');
      t.setAttribute('x', x + WPX / 2); t.setAttribute('y', HH - 3); t.setAttribute('font-size', 7); t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', w.hasH ? '#dc2626' : '#7a839a'); t.setAttribute('font-family', 'monospace');
      t.textContent = w.kw;
      svg.appendChild(t);
    });
    // Today line
    const now = new Date();
    const todayWi = weeks.findIndex((w, i) => { const next = weeks[i + 1]; return w.mon <= now && (!next || next.mon > now); });
    if (todayWi >= 0) {
      const tx = LW + todayWi * WPX;
      const ln = document.createElementNS(xmlns, 'line');
      ln.setAttribute('x1', tx); ln.setAttribute('x2', tx); ln.setAttribute('y1', HH); ln.setAttribute('y2', totalH); ln.setAttribute('stroke', '#16a34a'); ln.setAttribute('stroke-width', '2'); ln.setAttribute('opacity', '0.6');
      svg.appendChild(ln);
    }
    // Rows
    let y = HH;
    rows.forEach(row => {
      if (row.type === 'team') {
        const col = teamColor(row.team);
        const r = document.createElementNS(xmlns, 'rect');
        r.setAttribute('x', 0); r.setAttribute('y', y); r.setAttribute('width', totalW); r.setAttribute('height', GH);
        r.setAttribute('fill', '#f0f2f5');
        svg.appendChild(r);
        const cb = document.createElementNS(xmlns, 'rect');
        cb.setAttribute('x', 0); cb.setAttribute('y', y); cb.setAttribute('width', 4); cb.setAttribute('height', GH);
        cb.setAttribute('fill', col);
        svg.appendChild(cb);
        const t = document.createElementNS(xmlns, 'text');
        t.setAttribute('x', 12); t.setAttribute('y', y + GH / 2 + 4); t.setAttribute('font-size', 11); t.setAttribute('font-weight', '700'); t.setAttribute('fill', col); t.setAttribute('text-transform', 'uppercase');
        t.textContent = teamName(row.team);
        svg.appendChild(t);
        y += GH;
        return;
      }
      const s = row.s;
      // Row background line
      const ln = document.createElementNS(xmlns, 'line');
      ln.setAttribute('x1', 0); ln.setAttribute('x2', totalW); ln.setAttribute('y1', y + RH); ln.setAttribute('y2', y + RH); ln.setAttribute('stroke', '#f0f2f5');
      svg.appendChild(ln);
      // Left label: id + name + person
      const lid = document.createElementNS(xmlns, 'text');
      lid.setAttribute('x', 6); lid.setAttribute('y', y + RH / 2 + 4); lid.setAttribute('font-size', 9); lid.setAttribute('fill', '#7a839a'); lid.setAttribute('font-family', 'monospace');
      lid.textContent = s.id;
      svg.appendChild(lid);
      const lname = document.createElementNS(xmlns, 'text');
      lname.setAttribute('x', 70); lname.setAttribute('y', y + RH / 2 + 4); lname.setAttribute('font-size', 10); lname.setAttribute('fill', '#1a1e2a');
      lname.textContent = s.name.length > 28 ? s.name.slice(0, 28) + '…' : s.name;
      svg.appendChild(lname);
      const lper = document.createElementNS(xmlns, 'text');
      lper.setAttribute('x', LW - 6); lper.setAttribute('y', y + RH / 2 + 4); lper.setAttribute('font-size', 9); lper.setAttribute('fill', '#4a5268'); lper.setAttribute('text-anchor', 'end'); lper.setAttribute('font-family', 'monospace');
      lper.textContent = s.person;
      svg.appendChild(lper);
      // Bar
      if (s.status !== 'done' && s.startWi >= 0) {
        const bx = LW + s.startWi * WPX + 1;
        const bw = (s.endWi - s.startWi + 1) * WPX - 2;
        const tc = teamColor(s.team || NO_TEAM);
        const bar = document.createElementNS(xmlns, 'rect');
        bar.setAttribute('x', bx); bar.setAttribute('y', y + 5); bar.setAttribute('width', Math.max(bw, 4)); bar.setAttribute('height', RH - 10);
        bar.setAttribute('fill', tc + '55'); bar.setAttribute('stroke', tc); bar.setAttribute('stroke-width', '1'); bar.setAttribute('rx', 3);
        svg.appendChild(bar);
        if (bw > 30) {
          const lbl = document.createElementNS(xmlns, 'text');
          lbl.setAttribute('x', bx + 5); lbl.setAttribute('y', y + RH / 2 + 3); lbl.setAttribute('font-size', 9); lbl.setAttribute('fill', '#1a1e2a'); lbl.setAttribute('font-weight', '600');
          lbl.textContent = s.name.length > Math.floor(bw / 7) ? s.name.slice(0, Math.floor(bw / 7) - 1) + '…' : s.name;
          svg.appendChild(lbl);
        }
      }
      y += RH;
    });
    return { svg, width: totalW, height: totalH };
  }

  function exportGanttSVG() {
    const r = buildGanttSvg();
    if (!r) return alert('No scheduled items — switch to Schedule tab and ensure tasks have estimates.');
    const blob = new Blob([new XMLSerializer().serializeToString(r.svg)], { type: 'image/svg+xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-gantt.svg`; a.click();
  }

  async function exportGanttPNG() {
    const r = buildGanttSvg();
    if (!r) return alert('No scheduled items — switch to Schedule tab and ensure tasks have estimates.');
    try {
      const blob = await svgToPng(r.svg, r.width, r.height, 2);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-gantt.png`; a.click();
    } catch (e) { alert('PNG export failed: ' + (e.message || e)); }
  }

  // Mermaid flowchart for Confluence pages (Mermaid macro). Captures hierarchy + dependencies.
  // Sprint plan as Markdown — grouped by person, ordered by start date.
  // Asks the user for a horizon (default: 30 days from today).
  function exportSprintMarkdown() {
    if (!scheduled.length) return alert('No scheduled tasks. Add estimates first.');
    const horizonStr = prompt('Sprint horizon in days from today?', String(30));
    if (horizonStr === null) return; // cancelled
    const horizon = Math.max(1, parseInt(horizonStr) || 30);
    const now = new Date();
    const sprintEnd = new Date(); sprintEnd.setDate(sprintEnd.getDate() + horizon);
    const upcoming = scheduled
      .filter(s => s.status !== 'done' && s.startD && s.startD <= sprintEnd)
      .sort((a, b) => (a.startD - b.startD) || (a.prio || 4) - (b.prio || 4));
    if (!upcoming.length) return alert(`No tasks scheduled within ${horizon} days.`);
    const teamName = id => teams.find(t => t.id === id)?.name || id;
    // Group by person (or team-unassigned bucket)
    const groups = new Map();
    upcoming.forEach(s => {
      const key = s.personId || `team:${s.team || 'none'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key, isPerson: !!s.personId,
          label: s.personId ? s.person : `${teamName(s.team) || 'No team'} (unassigned)`,
          items: [],
        });
      }
      groups.get(key).items.push(s);
    });
    const sorted = [...groups.values()].sort((a, b) => a.isPerson === b.isPerson ? a.label.localeCompare(b.label) : a.isPerson ? -1 : 1);
    let md = `# ${meta.name || 'Project'} — Sprint Plan\n\n`;
    md += `_Horizon: ${horizon} days (from ${iso(now)} to ${iso(sprintEnd)})_\n`;
    md += `_${upcoming.length} tasks across ${sorted.length} ${sorted.length === 1 ? 'lane' : 'lanes'}_\n\n`;
    sorted.forEach(g => {
      md += `## ${g.label}\n\n`;
      md += `| Start | Task | Team | Effort | Status |\n`;
      md += `|---|---|---|---|---|\n`;
      g.items.forEach(s => {
        const node = tree.find(r => r.id === s.id);
        const stat = s.status === 'wip' ? '🟡 In progress' : 'Open';
        const note = node?.decideBy ? ` ⏰ decide by ${node.decideBy}` : '';
        md += `| ${iso(s.startD)} | ${s.id} ${s.name.replace(/\|/g, '\\|')}${note} | ${teamName(s.team)} | ${s.effort?.toFixed(1)}d | ${stat} |\n`;
      });
      md += '\n';
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-sprint-${horizon}d.md`; a.click();
  }

  function exportMermaid() {
    if (!tree.length) return alert('No items to export.');
    const safeId = id => id.replace(/[^A-Za-z0-9_]/g, '_');
    const safeLabel = s => (s || '').replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 60);
    let out = '```mermaid\nflowchart TD\n';
    // Node definitions
    tree.forEach(r => {
      const sid = safeId(r.id);
      const lbl = `${r.id}: ${safeLabel(r.name)}`;
      const isRoot = !r.id.includes('.');
      // Shape: roots are stadium-shaped, others are rectangles. Done items use rounded.
      const shape = isRoot ? `(["${lbl}"])` : r.status === 'done' ? `("${lbl}")` : `["${lbl}"]`;
      out += `  ${sid}${shape}\n`;
    });
    out += '\n';
    // Hierarchy (parent → child) as solid lines
    tree.forEach(r => {
      if (!r.id.includes('.')) return;
      const pid = r.id.split('.').slice(0, -1).join('.');
      out += `  ${safeId(pid)} --> ${safeId(r.id)}\n`;
    });
    out += '\n';
    // Dependencies as dotted lines
    tree.forEach(r => {
      (r.deps || []).forEach(d => { out += `  ${safeId(d)} -.->|dep| ${safeId(r.id)}\n`; });
    });
    // Class definitions for done/wip/critical
    out += '\n';
    out += '  classDef done fill:#dcfce7,stroke:#16a34a,color:#15803d\n';
    out += '  classDef wip fill:#fef3c7,stroke:#d97706,color:#a16207\n';
    out += '  classDef root fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a,font-weight:bold\n';
    tree.filter(r => r.status === 'done').forEach(r => { out += `  class ${safeId(r.id)} done\n`; });
    tree.filter(r => r.status === 'wip').forEach(r => { out += `  class ${safeId(r.id)} wip\n`; });
    tree.filter(r => !r.id.includes('.')).forEach(r => { out += `  class ${safeId(r.id)} root\n`; });
    out += '```\n';
    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-mermaid.md`; a.click();
  }
  function exportCSV() {
    const hdr = ['ID', 'Level', 'Name', 'Status', 'Team', 'Best (days)', 'Factor', 'Priority', 'Dependencies', 'Notes'];
    const rows = tree.map(r => [r.id, r.lvl, `"${(r.name || '').replace(/"/g, '""')}"`, r.status, r.team || '', r.best || '', r.factor || '', r.prio || '', (r.deps || []).join('; '), `"${(r.note || '').replace(/"/g, '""')}"`]);
    const csv = [hdr.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-${iso(new Date())}.csv`; a.click();
  }
  const isMdFile = fileName?.endsWith('.md');
  function buildMarkdownText() {
    const teamName = id => teams.find(t => t.id === id)?.name || id;
    const memberName = id => members.find(m => m.id === id)?.name || id;
    // Build short-name (initials) map for members. Unique by construction:
    // if a base collides, ALL occurrences get a numeric suffix (so no one gets the bare base).
    const shortMap = buildMemberShortMap(members);
    const memberShort = id => shortMap[id] || memberName(id);
    const SZ = { 1: 'XS', 3: 'S', 7: 'M', 15: 'L', 30: 'XL', 45: 'XXL' };
    const sz = b => { const k = Object.keys(SZ).map(Number).sort((a, c) => Math.abs(a - b) - Math.abs(c - b)); return SZ[k[0]] || ''; };
    const esc = s => (s || '').toString().replace(/\|/g, '\\|').replace(/\n/g, ' ');
    let md = `# ${meta.name || 'Project'}\n\n`;

    // Plan section (planStart, planEnd)
    if (meta.planStart || meta.planEnd) {
      md += `## Plan\n\n| Field | Value |\n|---|---|\n`;
      if (meta.planStart) md += `| Start | ${meta.planStart} |\n`;
      if (meta.planEnd) md += `| End | ${meta.planEnd} |\n`;
      md += '\n';
    }

    // Teams section (name, color)
    if (teams.length) {
      md += `## Teams\n\n| Name | Color |\n|---|---|\n`;
      teams.forEach(t => { md += `| ${esc(t.name)} | \`${t.color || '#3b82f6'}\` |\n`; });
      md += '\n';
    }

    // Resources: keep existing format, with vacation days added
    if (members.length) {
      md += `## Resources\n`;
      members.forEach(m => {
        const cap = m.cap < 1 ? ` (${Math.round(m.cap * 100)}%)` : '';
        const vac = (m.vac && m.vac !== 25) ? `, ${m.vac}d/y` : '';
        md += `- **${m.name}** \`${shortMap[m.id]}\` — ${teamName(m.team)}${m.role ? ', ' + m.role : ''}${cap}${vac}${m.start ? ', ab ' + m.start : ''}\n`;
      });
      md += '\n';
    }

    // Vacation Weeks
    if ((vacations || []).length) {
      md += `## Vacation Weeks\n\n| Person | Week (Mon) | Note |\n|---|---|---|\n`;
      vacations.forEach(v => { md += `| ${esc(memberName(v.person))} | ${v.week || ''} | ${esc(v.note)} |\n`; });
      md += '\n';
    }

    // Holidays
    if ((data?.holidays || []).length) {
      md += `## Holidays\n\n| Date | Name | Source |\n|---|---|---|\n`;
      data.holidays.forEach(h => { md += `| ${h.date} | ${esc(h.name)} | ${h.auto ? 'auto' : 'custom'} |\n`; });
      md += '\n';
    }

    // Work Tree (extended inline metadata: factor, prio, severity, seq, dep labels)
    md += `## Work Tree\n`;
    tree.forEach(r => {
      const d = r.id.split('.').length;
      const indent = '  '.repeat(d - 1);
      const done = r.status === 'done' ? '✅ ' : r.status === 'wip' ? '🟡 ' : '';
      // estimate: (SZ NTd) or (SZ NTd ×F) when factor is non-default
      const factorPart = (r.factor && r.factor !== 1.5) ? ` ×${r.factor}` : '';
      const est = r.best > 0 ? ` (${sz(r.best)} ${r.best}T${factorPart})` : '';
      const prog = r.progress > 0 && r.progress < 100 ? ` ${r.progress}%` : '';
      const team = r.team ? ` — ${teamName(r.team)}` : '';
      const assign = (r.assign || []).length ? ` [${r.assign.map(memberShort).join(', ')}]` : '';
      // Tags: prio (only if not 2), seq (only if non-zero), severity (root only)
      const tags = [];
      if (r.prio && r.prio !== 2) tags.push(`prio:${r.prio}`);
      if (r.seq) tags.push(`seq:${r.seq}`);
      if (!r.id.includes('.') && r.severity && r.severity !== 'high') tags.push(r.severity);
      const tagStr = tags.length ? ` {${tags.join(', ')}}` : '';
      // Deps: include labels when present
      const depItems = (r.deps || []).map(d => {
        const lbl = (r._depLabels || {})[d];
        return lbl ? `${d} (${lbl})` : d;
      });
      const deps = depItems.length ? `\n${indent}  *Benötigt: ${depItems.join(', ')}*` : '';
      const note = r.note ? `\n${indent}  *${r.note}*` : '';
      const type = r.type ? ` ${r.type === 'deadline' ? '⏰' : r.type === 'painpoint' ? '⚡' : '🎯'}` : '';
      const date = r.date ? ` (${r.date})` : '';
      const decideBy = r.decideBy ? ` ⏰decide:${r.decideBy}` : '';
      const pinned = r.pinnedStart ? ` 📌${r.pinnedStart}` : '';
      const parallel = r.parallel ? ` ≡` : '';
      const desc = r.description ? `\n${indent}  ${r.description}` : '';
      md += `${indent}- ${done}**${r.id}** ${r.name}${type}${date}${est}${prog}${team}${assign}${tagStr}${decideBy}${pinned}${parallel}${deps}${note}${desc}\n`;
    });
    return md;
  }
  function exportMarkdown() {
    const md = buildMarkdownText();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-${iso(new Date())}.md`; a.click();
  }
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
        const d = isMd ? parseMdToProject(text) : JSON.parse(text);
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
      const d = handle.name?.endsWith('.md') ? parseMdToProject(text) : JSON.parse(text);
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
    <Onboard onCreate={() => setModal('new')} onLoad={loadFromFile} fRef={fRef} />
    {modal === 'new' && <NewProjModal onClose={() => setModal(null)} onCreate={d => { setData(d); setSaved(false); setModal(null); setTab('tree'); setSel(d.tree?.[0] || null); }} />}
    <input ref={fRef} type="file" accept=".json" style={{ display: 'none' }} onChange={loadFile} />
  </>;

  // removed: topDownReady guide bubble (was blocking tree view)

  const TABS = [
    { id: 'summary', label: 'Overview' }, { id: 'tree', label: 'Work Tree' }, { id: 'gantt', label: 'Schedule' },
    { id: 'net', label: 'Network' }, { id: 'resources', label: 'Resources' }, { id: 'holidays', label: 'Holidays' },
  ];

  return <div className="app">
    <div className="topbar">
      <span className="logo" title="New project" onClick={() => { if (!saved && !confirm('Unsaved changes will be lost. Start new project?')) return; newProject(); }}>Planr<span className="logo-dot">.</span></span>
      <div className="vsep" />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--tx2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name || 'Untitled'}</span>
        <span className={`save-dot ${fileName && !fileSynced ? 'dirty' : saved ? 'clean' : 'dirty'}`} title={!saved ? 'Unsaved changes' : (fileName && !fileSynced ? 'Saved locally — file on disk pending auto-save' : 'All changes saved')} />
      </span>
      {fileName && <span style={{ fontSize: 11, color: 'var(--tx2)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {fileName}
        {(!saved || !fileWriteOk) && <button className="btn btn-ghost btn-xs" onClick={() => saveToFile()} title="Save now (Ctrl+S) — auto-save runs every 60s, click to force-save immediately" style={{ padding: '2px 5px', fontSize: 11 }}>💾</button>}
      </span>}
      <label title={autoSave ? 'Auto-save is on — saves to file every 60s when there are changes. Click 💾 to force-save now.' : 'Auto-save is off — click 💾 to save manually.'} className="toggle">
        <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} />
        <span className="slider" />
      </label>
      <span style={{ fontSize: 9, color: !fileName ? 'var(--tx3)' : autoSave ? (fileWriteOk ? 'var(--ac)' : 'var(--am)') : 'var(--tx3)', cursor: fileName && !fileWriteOk ? 'pointer' : 'default', userSelect: 'none' }}
        onClick={() => { if (fileName && !fileWriteOk) saveToFile(); }}>
        {!fileName ? (autoSave ? 'auto (no file)' : 'off') : autoSave ? (fileWriteOk ? 'auto' : '⚠ click to grant') : 'auto off'}
      </span>
      {lastSavedAt && <span style={{ fontSize: 9, color: fileName && !fileSynced ? 'var(--am)' : 'var(--tx3)', fontFamily: 'var(--mono)' }} title={fileName && !fileSynced ? 'Changes are saved locally but the file on disk is not yet updated. Auto-save retries every 60s, or click 💾 to force-save now.' : ''}>
        {!fileName ? `local ${lastSavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
          : fileSynced ? `saved ${lastSavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
          : `local · file pending`}
      </span>}
      <div className="vsep" />
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{scheduled.length} scheduled · {leaves.filter(r => r.status === 'done').length}/{leaves.length} done</span>
      <div className="sp" />
      {tab === 'tree' && <>
        <input className="btn btn-sec" style={{ padding: '5px 10px', width: 160 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ width: 130 }}><SearchSelect value={teamFilter} options={teams.map(t => ({ id: t.id, label: t.name || t.id }))} onSelect={v => setTeamFilter(v)} placeholder="All teams" allowEmpty emptyLabel="All teams" /></div>
        <button className="btn btn-sec btn-sm" onClick={() => setModal('add')}>+ Add item</button>
      </>}
      <button className="btn btn-sec btn-sm" onClick={() => setModal('settings')}>⚙ Settings</button>
      <div className="vsep" />
      <button className="btn btn-sec btn-sm" onClick={loadFromFile}>Load</button>
      <button className="btn btn-sec btn-sm" onClick={() => saveToFile(true)} title="Save as (pick format: JSON or Markdown)">Save as</button>
      <select className="btn btn-sec btn-sm" style={{ padding: '4px 8px' }} value="" onChange={e => { const v = e.target.value; e.target.value = ''; if (v === 'csv') exportCSV(); else if (v === 'sprint') exportSprintMarkdown(); else if (v === 'svg-net') exportSVG(); else if (v === 'png-net') exportNetworkPNG(); else if (v === 'svg-gantt') exportGanttSVG(); else if (v === 'png-gantt') exportGanttPNG(); else if (v === 'mermaid') exportMermaid(); else if (v === 'print') exportPDF(); }}>
        <option value="">Export ▾</option>
        <option value="sprint">Sprint plan as Markdown</option>
        <option value="csv">Tasks as CSV</option>
        {tab === 'net' && <option value="svg-net">Network as SVG</option>}
        {tab === 'net' && <option value="png-net">Network as PNG (for Whiteboard)</option>}
        {tab === 'gantt' && <option value="svg-gantt">Gantt as SVG</option>}
        {tab === 'gantt' && <option value="png-gantt">Gantt as PNG (for Whiteboard)</option>}
        <option value="mermaid">Mermaid (for Confluence page)</option>
        <option value="print">Print / PDF</option>
      </select>
      <button className="btn btn-pri btn-sm" onClick={() => { if (!saved && !confirm('Unsaved changes will be lost.')) return; newProject(); }}>New</button>
      <input ref={fRef} type="file" accept=".json,.md" style={{ display: 'none' }} onChange={loadFile} />
    </div>
    <div className="tab-bar">
      {TABS.map(t => <div key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>)}
      <div style={{ flex: 1 }} />
    </div>
    <div className="main">
      {tab === 'summary' && <div className="pane"><SumView tree={tree} scheduled={scheduled} goals={goals} members={members} teams={teams} cpSet={cpSet} goalPaths={goalPaths} stats={stats}
        onNavigate={(id, target) => { const node = tree.find(r => r.id === id); if (node) setSel(node); setTab(target || 'tree'); }} /></div>}
      {tab === 'tree' && <>
        <div className="pane-full">
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
              }} search={search} teamFilter={teamFilter} stats={stats} teams={teams} members={members} cpSet={cpSet}
              onQuickAdd={parent => { const id = nextChildId(tree, parent.id); const node = { id, name: 'New child item', status: 'open', team: parent.team || '', best: 0, factor: 1.5, prio: 2, seq: 10, deps: [], note: '', assign: [] }; addNode(node); setSel(node); setMultiSel(new Set()); }}
              onDelete={deleteNode} />
          }
          </div>
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
              return <div className="side-body">
                <p className="helper" style={{ marginBottom: 10 }}>Ctrl+Click to add/remove items. Common values shown — changes apply to all selected.</p>
                <div className="field"><label>Team{commonTeam == null ? ' (mixed)' : ''}</label>
                  <SearchSelect value={commonTeam || ''} options={teams.map(t => ({ id: t.id, label: t.name }))} onSelect={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, team: v } : r))} placeholder="Choose team..." allowEmpty />
                </div>
                <div className="field"><label>Assigned to (common across all selected)</label>
                  {(() => {
                    // Find members assigned to ALL selected items (intersection)
                    const commonAssigns = selItems[0]?.assign?.filter(a => selItems.every(r => (r.assign || []).includes(a))) || [];
                    return <>
                      {commonAssigns.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {commonAssigns.map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" title="Remove from all selected" onClick={() => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, assign: (r.assign || []).filter(x => x !== a) } : r))}>×</span></span>; })}
                      </div>}
                      <SearchSelect options={members.filter(m => !commonAssigns.includes(m.id)).map(m => ({ id: m.id, label: m.name || m.id }))} onSelect={v => { const m = members.find(x => x.id === v); setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, assign: [...new Set([...(r.assign || []), v])], team: m?.team || r.team } : r)); }} placeholder="Add person to all..." />
                    </>;
                  })()}
                </div>
                {allLeaf && <div className="field"><label>Status{commonStatus == null ? ' (mixed)' : ''}</label>
                  <SearchSelect value={commonStatus || ''} options={[{ id: 'open', label: 'Open' }, { id: 'wip', label: 'In Progress' }, { id: 'done', label: 'Done' }]} onSelect={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, status: v } : r))} placeholder="Choose status..." />
                </div>}
                {allLeaf && <div className="frow">
                  <div className="field"><label>Best (days){commonBest == null ? ' (mixed)' : ''}</label>
                    <LazyInput type="number" min="0" value={commonBest ?? ''} onCommit={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, best: +v } : r))} />
                  </div>
                  <div className="field"><label>Factor{commonFactor == null ? ' (mixed)' : ''}</label>
                    <LazyInput type="number" step="0.1" min="1" value={commonFactor ?? ''} onCommit={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, factor: +v } : r))} />
                  </div>
                </div>}
                <div className="field"><label>Priority{commonPrio == null ? ' (mixed)' : ''}</label>
                  <SearchSelect value={commonPrio ? String(commonPrio) : ''} options={[{ id: '1', label: '1 Critical' }, { id: '2', label: '2 High' }, { id: '3', label: '3 Medium' }, { id: '4', label: '4 Low' }]} onSelect={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, prio: +v } : r))} placeholder="Choose priority..." />
                </div>
                <div className="field"><label>Note{commonNote == null ? ' (mixed — overwrites all!)' : ''}</label>
                  <LazyInput value={commonNote ?? ''} onCommit={v => setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, note: v } : r))} placeholder="(empty)" />
                </div>
                <hr className="divider" />
                <button className="btn btn-sec btn-sm" style={{ width: '100%', marginBottom: 6 }} onClick={() => setMultiSel(new Set())}>Clear selection</button>
              </div>;
            })()}
          </> : <>
            <div className="side-hdr"><h3>{selected.id}</h3>
              <button className="btn btn-ghost btn-icon sm" title="Full edit" onClick={() => { setMN(selected); setModal('node'); }}>⊞</button>
              <button className="btn btn-ghost btn-icon sm" onClick={() => setSel(null)}>×</button>
            </div>
            <div className="side-body"><QuickEdit node={selected} tree={tree} members={members} teams={teams} scheduled={scheduled} cpSet={cpSet} stats={stats} onUpdate={n => { updateNode(n); setSel(n); }} onDelete={id => { deleteNode(id); setSel(null); }} onEstimate={n => { setMN(n); setModal('estimate'); }}
              onDuplicate={id => { const newId = duplicateNode(id); if (newId) setTimeout(() => { const n = tree.find(r => r.id === newId); if (n) setSel(n); }, 50); }} /></div>
          </>}
        </div>}
      </>}
      {tab === 'gantt' && <div className="pane-full"><GanttView scheduled={scheduled} weeks={weeks} goals={goals} teams={teams} cpSet={cpSet} tree={tree} onBarClick={onBarClick} onSeqUpdate={onSeqUpdate} onTaskUpdate={updateNode} /></div>}
      {tab === 'net' && <div className="pane-full"><NetGraph tree={tree} scheduled={scheduled} teams={teams} cpSet={cpSet} stats={stats}
        onNodeClick={r => onBarClick(r)}
        onAddNode={() => setModal('add')}
        onAddDep={(fromId, toId) => { const node = tree.find(r => r.id === fromId); if (node) { const deps = [...new Set([...(node.deps || []), toId])]; updateNode({ ...node, deps }); } }}
        onDeleteNode={id => deleteNode(id)} /></div>}
      {tab === 'resources' && <div className="pane"><ResView members={members} teams={teams} vacations={vacations} onUpd={updateMember} onAdd={addMember} onClone={cloneMember} onDel={deleteMember} onVac={v => setD('vacations', v)}
        onTeamUpd={(i, k, v) => setD('teams', teams.map((t, j) => j === i ? { ...t, [k]: v } : t))}
        onTeamAdd={() => setD('teams', [...teams, { id: `T${teams.length + 1}`, name: 'New Team', color: '#3b82f6' }])}
        onTeamDel={i => setD('teams', teams.filter((_, j) => j !== i))} /></div>}
      {tab === 'holidays' && <div className="pane"><HolView holidays={data.holidays || []} planStart={planStart} planEnd={planEnd} onUpdate={v => setD('holidays', v)} /></div>}
    </div>
    {modal === 'node' && modalNode && <NodeModal node={tree.find(r => r.id === modalNode.id) || modalNode} tree={tree} members={members} teams={teams} scheduled={scheduled} cpSet={cpSet} stats={stats}
      onClose={() => { setModal(null); setMN(null); }} onUpdate={n => { updateNode(n); setSel(n); }} onDelete={deleteNode} onEstimate={n => { setMN(n); setModal('estimate'); }}
      onDuplicate={id => { const newId = duplicateNode(id); if (newId) { setModal(null); setMN(null); setTimeout(() => { const n = tree.find(r => r.id === newId) || { id: newId }; setSel(n); }, 50); } }}
      onMove={(id, newParentId) => { const newId = moveNode(id, newParentId); if (newId) { setMN({ id: newId }); setTimeout(() => { const n = { ...modalNode, id: newId }; setSel(n); }, 50); } }} />}
    {modal === 'add' && <AddModal tree={tree} teams={teams} selected={selected} onAdd={addNode} onClose={() => setModal(null)} />}
    {modal === 'settings' && <SettingsModal meta={meta} onSave={m => setD('meta', m)} onClose={() => setModal(null)} />}
    {modal === 'new' && <NewProjModal onClose={() => setModal(null)} onCreate={d => { setData(d); setSaved(false); setModal(null); setTab('tree'); setSel(d.tree?.[0] || null); }} />}
    {modal === 'estimate' && modalNode && <EstimationWizard node={tree.find(r => r.id === modalNode.id) || modalNode} tree={tree}
      onSave={est => { const node = tree.find(r => r.id === modalNode.id); if (node) updateNode({ ...node, ...est }); }}
      onClose={() => { setModal(null); setMN(null); }} />}
  </div>;
}
