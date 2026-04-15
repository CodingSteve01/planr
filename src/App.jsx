import { useState, useMemo, useRef, useEffect } from 'react';
import { SK } from './constants.js';
import { iso } from './utils/date.js';
import { buildHMap } from './utils/holidays.js';
import { schedule, treeStats, enrichParentSchedules, nextChildId, deriveParentStatuses, leafNodes } from './utils/scheduler.js';
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
    let permission = await queryHandlePermission(handle, 'readwrite');
    if (permission === 'granted') return true;
    if (!interactive) return false;
    permission = await requestHandlePermission(handle, 'readwrite');
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
        if (readPermission !== 'granted') return;

        const file = await handle.getFile();
        const restored = JSON.parse(await file.text());
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

  // Auto-save to localStorage + optionally to file
  const [fileWriteOk, setFileWriteOk] = useState(true);
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(async () => {
      localStorage.setItem(SK, JSON.stringify(data));
      if (autoSave && fileHandleRef.current) {
        const canWrite = await ensureHandlePermission(fileHandleRef.current, false);
        if (!canWrite) { setFileWriteOk(false); }
        else {
          try {
            const content = isMdFile ? buildMarkdownText() : JSON.stringify(data, null, 2);
            const wr = await fileHandleRef.current.createWritable();
            await wr.write(content);
            await wr.close();
            setFileWriteOk(true);
          } catch (e) { console.error('Auto-save failed:', e); setFileWriteOk(false); }
        }
      }
      setSaved(true);
      setLastSavedAt(new Date());
    }, 800);
    return () => clearTimeout(t);
  }, [data, autoSave]);

  // Detect external file changes (poll every 5s)
  const lastModRef = useRef(null);
  useEffect(() => {
    if (!fileHandleRef.current) return;
    const poll = setInterval(async () => {
      try {
        const file = await fileHandleRef.current.getFile();
        const mod = file.lastModified;
        if (lastModRef.current && mod > lastModRef.current && saved) {
          const d = JSON.parse(await file.text());
          if (d.tree && Array.isArray(d.tree)) { setData(d); setLastSavedAt(new Date(mod)); }
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

  // Save to file (File System Access API)
  async function saveToFile(saveAs) {
    if (!data) return;
    try {
      let handle = saveAs ? null : fileHandleRef.current;
      if (!handle) {
        if (!window.showSaveFilePicker) { exportJSON(); return; }
        const slug = (meta.name || 'project').toLowerCase().replace(/\s+/g, '-');
        handle = await window.showSaveFilePicker({
          suggestedName: `${slug}.planr.json`,
          types: [
            { description: 'Planr JSON', accept: { 'application/json': ['.json'] } },
            { description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
          ],
        });
      }
      const canWrite = await ensureHandlePermission(handle, true);
      if (!canWrite) return;
      const content = handle.name?.endsWith('.md') ? buildMarkdownText() : JSON.stringify(data, null, 2);
      const wr = await handle.createWritable();
      await wr.write(content);
      await wr.close();
      await rememberHandle(handle);
      setAutoSave(true);
      setFileWriteOk(true);
      setSaved(true);
      setLastSavedAt(new Date());
    } catch (e) { if (e.name !== 'AbortError') { console.error('Save failed:', e); await forgetHandle(); } }
  }
  function parseMdToProject(text) {
    const lines = text.split('\n');
    const tree = [], mems = [];
    let projName = 'Imported Project';
    const idStack = []; // stack of {id, depth}
    let inResources = false;
    lines.forEach(line => {
      const hm = line.match(/^#+\s+(.+)/);
      if (hm) {
        projName = hm[1];
        inResources = /resource|team|member/i.test(hm[1]);
        return;
      }
      // Resources section
      if (inResources) {
        const rm = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*—?\s*(.*)/);
        if (rm) { mems.push({ id: 'm' + Date.now() + mems.length, name: rm[1].trim(), team: '', role: rm[2]?.trim() || '', cap: 1, vac: 25, start: '' }); }
        return;
      }
      // Tree items
      const m = line.match(/^(\s*)[-*]\s+(.*)/);
      if (!m) return;
      const indent = m[1].length;
      const raw = m[2].trim();
      // Parse status
      const done = raw.startsWith('✅');
      const wip = raw.includes('🟡');
      let name = raw.replace(/^✅\s*/, '').replace(/🟡/g, '').trim();
      // Parse estimate: (NT) or (SZ NT)
      let best = 0, factor = 1.5;
      const estM = name.match(/\((\w+\s+)?(\d+)T\)/);
      if (estM) { best = parseInt(estM[2]); name = name.replace(estM[0], '').trim(); }
      // Parse progress: NN%
      let progress = null;
      const prgM = name.match(/(\d+)%/);
      if (prgM) { progress = parseInt(prgM[1]); name = name.replace(prgM[0], '').trim(); }
      // Parse type emojis
      let type = '';
      if (name.includes('⏰')) { type = 'deadline'; name = name.replace('⏰', '').trim(); }
      else if (name.includes('⚡')) { type = 'painpoint'; name = name.replace('⚡', '').trim(); }
      else if (name.includes('🎯')) { type = 'goal'; name = name.replace('🎯', '').trim(); }
      // Strip bold markers
      name = name.replace(/\*\*/g, '').trim();
      // Determine parent by indent level
      while (idStack.length && idStack[idStack.length - 1].indent >= indent) idStack.pop();
      const parentId = idStack.length ? idStack[idStack.length - 1].id : '';
      // Generate ID
      const siblings = tree.filter(r => { const pid = r.id.split('.').slice(0, -1).join('.'); return pid === parentId; });
      const num = siblings.length + 1;
      const id = parentId ? `${parentId}.${num}` : `P${tree.filter(r => !r.id.includes('.')).length + 1}`;
      idStack.push({ id, indent });
      const item = { id, name, status: done ? 'done' : wip ? 'wip' : 'open', team: '', best, factor, prio: 2, deps: [], note: '', assign: [] };
      if (progress != null) item.progress = progress;
      if (type) { item.type = type; item.severity = 'high'; }
      tree.push(item);
    });
    return { meta: { name: projName, version: '2' }, teams: [], members: mems, tree, vacations: [], holidays: [] };
  }

  async function loadFromFile() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Planr Project', accept: { 'application/json': ['.json', '.md'] } }] });
        const file = await handle.getFile();
        const text = await file.text();
        const isMd = handle.name.endsWith('.md');
        const d = isMd ? parseMdToProject(text) : JSON.parse(text);
        if (!d.tree || !Array.isArray(d.tree)) throw new Error('Invalid project file');
        // Establish write permission immediately (still in user gesture)
        let canWrite = false;
        try {
          const wr = await handle.createWritable();
          await wr.write(text); // write original content back
          await wr.close();
          canWrite = true;
        } catch { /* read-only is fine */ }
        // Now apply the loaded data
        await rememberHandle(handle);
        setFileWriteOk(canWrite);
        setAutoSave(true);
        setSaved(true);
        setLastSavedAt(new Date());
        setSel(null);
        setData(d); // this triggers re-render with new data
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

  // Auto-derive parent statuses from children
  useEffect(() => {
    if (!data || !tree.length) return;
    const updated = deriveParentStatuses(tree, stats);
    if (updated.some((r, i) => r.status !== tree[i].status)) { setData(d => ({ ...d, tree: updated })); }
  }, [stats]);

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
  function updateMember(m) { setD('members', members.map(x => x.id === m.id ? m : x)); }
  function addMember() { const id = 'm' + Date.now(); setD('members', [...members, { id, name: 'New person', team: teams[0]?.id || '', role: '', cap: 1.0, vac: 25, start: planStart }]); }
  function deleteMember(id) { setD('members', members.filter(m => m.id !== id)); }
  function onSeqUpdate(taskId, newSeq) { setD('tree', tree.map(r => r.id === taskId ? { ...r, seq: newSeq } : r)); }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'project').toLowerCase().replace(/\s+/g, '-')}-${iso(new Date())}.json`; a.click();
  }
  function exportPDF() { window.print(); }
  function exportSVG() {
    const svg = document.querySelector('.netgraph-wrap svg');
    if (!svg) return alert('Switch to the Network tab first.');
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Set viewBox to encompass the full graph content
    const g = clone.querySelector('g');
    if (g) {
      // Remove transform so we get the raw coordinates
      const transform = g.getAttribute('transform');
      g.removeAttribute('transform');
    }
    // Inject light mode styles so the SVG is readable on white background
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      svg { background: #f8f9fc; --bg: #f8f9fc; --bg2: #ffffff; --bg3: #f0f2f5; --bg4: #e5e8ee;
        --b: #e0e4ea; --b2: #ccd2dc; --b3: #b0b8c8; --tx: #1a1e2a; --tx2: #4a5268; --tx3: #7a839a;
        --ac: #2563eb; --ac2: #1d4ed8; --gr: #16a34a; --am: #d97706; --re: #dc2626;
        --r: 7px; --mono: 'JetBrains Mono', monospace; --font: 'Inter', sans-serif; }
      text { font-family: 'Inter', sans-serif; }
    `;
    clone.prepend(style);
    // Calculate bounds from all elements
    const rects = clone.querySelectorAll('rect, text, path, line, circle');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // Use the content group's children positions
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
    clone.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);
    clone.setAttribute('width', maxX - minX + pad * 2);
    clone.setAttribute('height', maxY - minY + pad * 2);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-network.svg`; a.click();
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
    const SZ = { 1: 'XS', 3: 'S', 7: 'M', 15: 'L', 30: 'XL', 45: 'XXL' };
    const sz = b => { const k = Object.keys(SZ).map(Number).sort((a, c) => Math.abs(a - b) - Math.abs(c - b)); return SZ[k[0]] || ''; };
    let md = `# ${meta.name || 'Project'}\n\n`;
    // Members
    if (members.length) { md += `## Resources\n`; members.forEach(m => { md += `- **${m.name}** — ${teamName(m.team)}${m.role ? ', ' + m.role : ''}${m.cap < 1 ? ` (${Math.round(m.cap * 100)}%)` : ''}${m.start ? ', ab ' + m.start : ''}\n`; }); md += '\n'; }
    // Tree
    md += `## Work Tree\n`;
    tree.forEach(r => {
      const d = r.id.split('.').length;
      const indent = '  '.repeat(d - 1);
      const done = r.status === 'done' ? '✅ ' : r.status === 'wip' ? '🟡 ' : '';
      const est = r.best > 0 ? ` (${sz(r.best)} ${r.best}T)` : '';
      const prog = r.progress > 0 && r.progress < 100 ? ` ${r.progress}%` : '';
      const team = r.team ? ` — ${teamName(r.team)}` : '';
      const assign = (r.assign || []).length ? ` [${r.assign.map(memberName).join(', ')}]` : '';
      const deps = (r.deps || []).length ? `\n${indent}  *Benötigt: ${r.deps.join(', ')}*` : '';
      const note = r.note ? `\n${indent}  *${r.note}*` : '';
      const type = r.type ? ` ${r.type === 'deadline' ? '⏰' : r.type === 'painpoint' ? '⚡' : '🎯'}` : '';
      const date = r.date ? ` (${r.date})` : '';
      const desc = r.description ? `\n${indent}  ${r.description}` : '';
      md += `${indent}- ${done}**${r.id}** ${r.name}${type}${date}${est}${prog}${team}${assign}${deps}${note}${desc}\n`;
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
        if (!d.tree || !Array.isArray(d.tree)) throw new Error('Invalid');
        await forgetHandle();
        setFileWriteOk(false);
        setAutoSave(false);
        setSaved(true);
        setSel(null);
        setData(d);
        setFileName(f.name);
      } catch {
        alert('Invalid project file.');
      }
    };
    r.readAsText(f); e.target.value = '';
  }
  function onBarClick(s) { const node = tree.find(r => r.id === s.id); if (node) { setMN({ ...node, ...s }); setModal('node'); } }
  async function newProject() { await forgetHandle(); setFileWriteOk(false); setAutoSave(true); setSaved(true); setLastSavedAt(null); setData(null); setSel(null); setModal(null); setTab('summary'); }

  if (!bootstrapped) return <div className="onboard">
    <div className="onboard-card fade" style={{ padding: 32, width: 360 }}>
      <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>Planr<span style={{ color: 'var(--ac)' }}>.</span></div>
      <div className="onboard-sub" style={{ marginBottom: 0 }}>Restoring project context...</div>
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
        <span className={`save-dot ${saved ? 'clean' : 'dirty'}`} title={saved ? 'All changes saved' : 'Unsaved changes'} />
      </span>
      {fileName && <span style={{ fontSize: 11, color: 'var(--tx2)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {fileName}
        {(!autoSave || !fileWriteOk) && <button className="btn btn-ghost btn-xs" onClick={() => saveToFile()} title="Save (Ctrl+S)" style={{ padding: '2px 5px', fontSize: 11 }}>💾</button>}
        <label title={autoSave ? 'Auto-save is on — click to disable' : 'Auto-save is off — click to enable'} className="toggle">
          <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} />
          <span className="slider" />
        </label>
        <span style={{ fontSize: 9, color: autoSave ? (fileWriteOk ? 'var(--ac)' : 'var(--am)') : 'var(--tx3)', cursor: autoSave && !fileWriteOk ? 'pointer' : 'default' }}
          onClick={async () => { if (autoSave && !fileWriteOk && fileHandleRef.current) { try { const wr = await fileHandleRef.current.createWritable(); await wr.write(JSON.stringify(data, null, 2)); await wr.close(); setFileWriteOk(true); setSaved(true); setLastSavedAt(new Date()); } catch { setFileWriteOk(false); } } }}>
          {autoSave ? (fileWriteOk ? 'auto' : '⚠ click to grant file access') : 'auto off'}
        </span>
      </span>}
      {lastSavedAt && <span style={{ fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
        {saved ? `saved ${lastSavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'saving...'}
      </span>}
      <div className="vsep" />
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{scheduled.length} scheduled · {leaves.filter(r => r.status === 'done').length}/{leaves.length} done</span>
      <div className="sp" />
      {tab === 'tree' && <>
        <input className="btn btn-sec" style={{ padding: '5px 10px', width: 160 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="btn btn-sec" style={{ padding: '5px 8px', width: 100 }} value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
        </select>
        <button className="btn btn-sec btn-sm" onClick={() => setModal('add')}>+ Add item</button>
      </>}
      <button className="btn btn-sec btn-sm" onClick={() => setModal('settings')}>⚙ Settings</button>
      <div className="vsep" />
      <button className="btn btn-sec btn-sm" onClick={loadFromFile}>Load</button>
      <button className="btn btn-sec btn-sm" onClick={() => saveToFile(true)} title="Save as (pick format: JSON or Markdown)">Save as</button>
      <select className="btn btn-sec btn-sm" style={{ padding: '4px 8px' }} value="" onChange={e => { const v = e.target.value; e.target.value = ''; if (v === 'csv') exportCSV(); if (v === 'svg') exportSVG(); if (v === 'print') exportPDF(); }}>
        <option value="">More ▾</option>
        <option value="csv">Export CSV</option>
        {tab === 'net' && <option value="svg">Export SVG</option>}
        <option value="print">Print</option>
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
              }} search={search} teamFilter={teamFilter} stats={stats} teams={teams} cpSet={cpSet}
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
            <div className="side-body">
              <p className="helper" style={{ marginBottom: 10 }}>Ctrl+Click to add/remove items. Changes apply to all selected.</p>
              <div className="field"><label>Set team for all</label>
                <select value="" onChange={e => { if (!e.target.value) return; const v = e.target.value; setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, team: v } : r)); e.target.value = ''; }}>
                  <option value="">Choose team...</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Assign person to all</label>
                <select value="" onChange={e => { if (!e.target.value) return; const v = e.target.value; setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, assign: [...new Set([...(r.assign || []), v])] } : r)); e.target.value = ''; }}>
                  <option value="">Choose person...</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
                </select>
              </div>
              <div className="field"><label>Set status for all</label>
                <select value="" onChange={e => { if (!e.target.value) return; const v = e.target.value; setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, status: v } : r)); e.target.value = ''; }}>
                  <option value="">Choose status...</option>
                  <option value="open">Open</option><option value="wip">In Progress</option><option value="done">Done</option>
                </select>
              </div>
              <div className="field"><label>Set priority for all</label>
                <select value="" onChange={e => { if (!e.target.value) return; const v = +e.target.value; setD('tree', tree.map(r => multiSel.has(r.id) ? { ...r, prio: v } : r)); e.target.value = ''; }}>
                  <option value="">Choose priority...</option>
                  <option value="1">1 Critical</option><option value="2">2 High</option><option value="3">3 Medium</option><option value="4">4 Low</option>
                </select>
              </div>
              <hr className="divider" />
              <button className="btn btn-sec btn-sm" style={{ width: '100%', marginBottom: 6 }} onClick={() => setMultiSel(new Set())}>Clear selection</button>
            </div>
          </> : <>
            <div className="side-hdr"><h3>{selected.id}</h3>
              <button className="btn btn-ghost btn-icon sm" title="Full edit" onClick={() => { setMN(selected); setModal('node'); }}>⊞</button>
              <button className="btn btn-ghost btn-icon sm" onClick={() => setSel(null)}>×</button>
            </div>
            <div className="side-body"><QuickEdit node={selected} tree={tree} members={members} teams={teams} cpSet={cpSet} stats={stats} onUpdate={n => { updateNode(n); setSel(n); }} onDelete={id => { deleteNode(id); setSel(null); }} onEstimate={n => { setMN(n); setModal('estimate'); }} /></div>
          </>}
        </div>}
      </>}
      {tab === 'gantt' && <div className="pane-full"><GanttView scheduled={scheduled} weeks={weeks} goals={goals} teams={teams} cpSet={cpSet} tree={tree} onBarClick={onBarClick} onSeqUpdate={onSeqUpdate} /></div>}
      {tab === 'net' && <div className="pane-full"><NetGraph tree={tree} scheduled={scheduled} teams={teams} cpSet={cpSet} stats={stats}
        onNodeClick={r => onBarClick(r)}
        onAddNode={() => setModal('add')}
        onAddDep={(fromId, toId) => { const node = tree.find(r => r.id === fromId); if (node) { const deps = [...new Set([...(node.deps || []), toId])]; updateNode({ ...node, deps }); } }}
        onDeleteNode={id => deleteNode(id)} /></div>}
      {tab === 'resources' && <div className="pane"><ResView members={members} teams={teams} vacations={vacations} onUpd={updateMember} onAdd={addMember} onDel={deleteMember} onVac={v => setD('vacations', v)}
        onTeamUpd={(i, k, v) => setD('teams', teams.map((t, j) => j === i ? { ...t, [k]: v } : t))}
        onTeamAdd={() => setD('teams', [...teams, { id: `T${teams.length + 1}`, name: 'New Team', color: '#3b82f6' }])}
        onTeamDel={i => setD('teams', teams.filter((_, j) => j !== i))} /></div>}
      {tab === 'holidays' && <div className="pane"><HolView holidays={data.holidays || []} planStart={planStart} planEnd={planEnd} onUpdate={v => setD('holidays', v)} /></div>}
    </div>
    {modal === 'node' && modalNode && <NodeModal node={tree.find(r => r.id === modalNode.id) || modalNode} tree={tree} members={members} teams={teams} scheduled={scheduled} cpSet={cpSet} stats={stats}
      onClose={() => { setModal(null); setMN(null); }} onUpdate={n => { updateNode(n); setSel(n); }} onDelete={deleteNode} onEstimate={n => { setMN(n); setModal('estimate'); }} />}
    {modal === 'add' && <AddModal tree={tree} teams={teams} selected={selected} onAdd={addNode} onClose={() => setModal(null)} />}
    {modal === 'settings' && <SettingsModal meta={meta} onSave={m => setD('meta', m)} onClose={() => setModal(null)} />}
    {modal === 'new' && <NewProjModal onClose={() => setModal(null)} onCreate={d => { setData(d); setSaved(false); setModal(null); setTab('tree'); setSel(d.tree?.[0] || null); }} />}
    {modal === 'estimate' && modalNode && <EstimationWizard node={tree.find(r => r.id === modalNode.id) || modalNode} tree={tree}
      onSave={est => { const node = tree.find(r => r.id === modalNode.id); if (node) updateNode({ ...node, ...est }); }}
      onClose={() => { setModal(null); setMN(null); }} />}
  </div>;
}
