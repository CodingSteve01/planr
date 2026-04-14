import { useState, useMemo, useRef, useEffect } from 'react';
import { SK } from './constants.js';
import { iso } from './utils/date.js';
import { buildHMap } from './utils/holidays.js';
import { schedule, treeStats, nextChildId } from './utils/scheduler.js';
import { cpm } from './utils/cpm.js';
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

export default function App() {
  const [data, setData] = useState(() => { try { const s = localStorage.getItem(SK); return s ? JSON.parse(s) : null; } catch { return null; } });
  const [tab, setTab] = useState('summary');
  const [selected, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalNode, setMN] = useState(null);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [saved, setSaved] = useState(true);
  const fRef = useRef(null);

  useEffect(() => { if (!data) return; const t = setTimeout(() => { localStorage.setItem(SK, JSON.stringify(data)); setSaved(true); }, 800); return () => clearTimeout(t); }, [data]);

  const { tree = [], members = [], teams = [], deadlines = [], vacations = [], meta = {} } = data || {};
  const hm = useMemo(() => buildHMap(data?.holidays || []), [data?.holidays]);
  const planStart = meta.planStart || iso(new Date());
  const planEnd = meta.planEnd || iso(new Date(new Date().getFullYear() + 2, 11, 31));
  const { results: scheduled, weeks } = useMemo(() => data ? schedule(tree, members, vacations, planStart, planEnd, hm) : { results: [], weeks: [] }, [tree, members, vacations, planStart, planEnd, hm]);
  const stats = useMemo(() => treeStats(tree), [tree]);
  const cpSet = useMemo(() => cpm(tree).critical, [tree]);

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
  function addMember() { const id = 'person' + (members.length + 1); setD('members', [...members, { id, name: id, team: teams[0]?.id || 'T1', role: '', cap: 1.0, vac: 25, start: planStart }]); }
  function deleteMember(id) { setD('members', members.filter(m => m.id !== id)); }
  function onSeqUpdate(taskId, newSeq) { setD('tree', tree.map(r => r.id === taskId ? { ...r, seq: newSeq } : r)); }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(meta.name || 'project').toLowerCase().replace(/\s+/g, '-')}-${iso(new Date())}.json`; a.click();
  }
  function exportPDF() { window.print(); }
  function loadFile(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { try { const d = JSON.parse(ev.target.result); if (!d.tree || !Array.isArray(d.tree)) throw 0; setData(d); setTab('summary'); setSel(null); } catch { alert('Invalid project file.'); } };
    r.readAsText(f); e.target.value = '';
  }
  function onBarClick(s) { const node = tree.find(r => r.id === s.id); if (node) { setMN({ ...node, ...s }); setModal('node'); } }
  function newProject() { setData(null); setSel(null); setModal(null); setTab('summary'); }

  if (!data) return <>
    <Onboard onCreate={() => setModal('new')} onLoad={() => fRef.current?.click()} fRef={fRef} />
    {modal === 'new' && <NewProjModal onClose={() => setModal(null)} onCreate={d => { setData(d); setSaved(false); setModal(null); setTab('tree'); }} />}
    <input ref={fRef} type="file" accept=".json" style={{ display: 'none' }} onChange={loadFile} />
  </>;

  const TABS = [
    { id: 'summary', label: 'Overview' }, { id: 'tree', label: 'Work Tree' }, { id: 'gantt', label: 'Schedule' },
    { id: 'net', label: 'Network' }, { id: 'deadlines', label: 'Deadlines' }, { id: 'resources', label: 'Resources' }, { id: 'holidays', label: 'Holidays' },
  ];

  return <div className="app">
    <div className="topbar">
      <span className="logo" title="New project" onClick={() => { if (!saved && !confirm('Unsaved changes will be lost. Start new project?')) return; newProject(); }}>Planr<span className="logo-dot">.</span></span>
      <div className="vsep" />
      <span style={{ fontSize: 12, color: 'var(--tx2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name || 'Untitled'}</span>
      <div className="vsep" />
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{scheduled.length} scheduled · {tree.filter(r => r.lvl === 3 && r.status === 'done').length}/{tree.filter(r => r.lvl === 3).length} done</span>
      <div className="sp" />
      {tab === 'tree' && <>
        <input className="btn btn-sec" style={{ padding: '5px 10px', width: 160 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="btn btn-sec" style={{ padding: '5px 8px', width: 100 }} value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}
        </select>
        <button className="btn btn-sec btn-sm" onClick={() => setModal('add')}>+ Add</button>
        {selected && <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete ${selected.id} and all children?`)) deleteNode(selected.id); }}>Delete</button>}
      </>}
      {tab === 'deadlines' && <button className="btn btn-sec btn-sm" onClick={() => setModal('deadlines')}>Edit</button>}
      <button className="btn btn-ghost btn-sm" onClick={() => setModal('settings')} title="Project settings">⚙</button>
      <div className="vsep" />
      <button className="btn btn-sec btn-sm" onClick={exportJSON}>JSON</button>
      <button className="btn btn-sec btn-sm" onClick={exportPDF}>PDF</button>
      <button className="btn btn-sec btn-sm" onClick={() => fRef.current?.click()}>Load</button>
      <button className="btn btn-pri btn-sm" onClick={() => { if (!saved && !confirm('Unsaved changes will be lost.')) return; newProject(); }}>New</button>
      <input ref={fRef} type="file" accept=".json" style={{ display: 'none' }} onChange={loadFile} />
    </div>
    <div className="tab-bar">
      {TABS.map(t => <div key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>)}
      <div style={{ flex: 1 }} />
      {!saved && <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: 'var(--tx3)', padding: '0 12px' }} className="saving">saving...</div>}
    </div>
    <div className="main">
      {tab === 'summary' && <div className="pane"><SumView tree={tree} scheduled={scheduled} deadlines={deadlines} members={members} teams={teams} cpSet={cpSet} /></div>}
      {tab === 'tree' && <>
        <div className="pane-full"><div style={{ flex: 1, overflow: 'auto' }}>
          {!tree.length
            ? <div className="empty" style={{ marginTop: 60 }}><div style={{ fontSize: 32, marginBottom: 12 }}>🌳</div><div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No items yet</div><button className="btn btn-pri" onClick={() => setModal('add')}>+ Add first item</button></div>
            : <TreeView tree={tree} selected={selected} onSelect={setSel} onDbl={n => { setMN(n); setModal('node'); }} search={search} teamFilter={teamFilter} stats={stats} teams={teams} cpSet={cpSet}
              onQuickAdd={parent => { const id = nextChildId(tree, parent.id); const lvl = parent.lvl + 1; addNode({ id, lvl, name: 'New ' + (lvl === 2 ? 'group' : 'task'), status: 'open', team: parent.team || teams[0]?.id || '', best: lvl === 3 ? 5 : 0, factor: 1.5, prio: 2, seq: 10, deps: [], note: '', assign: [] }); setSel({ id, lvl }); }}
              onDelete={deleteNode} />
          }
        </div></div>
        {selected && <div className="side fade">
          <div className="side-hdr"><h3>{selected.id}</h3>
            <button className="btn btn-ghost btn-icon sm" title="Full edit" onClick={() => { setMN(selected); setModal('node'); }}>⊞</button>
            <button className="btn btn-ghost btn-icon sm" onClick={() => setSel(null)}>×</button>
          </div>
          <div className="side-body"><QuickEdit node={selected} tree={tree} members={members} teams={teams} cpSet={cpSet} onUpdate={n => { updateNode(n); setSel(n); }} onDelete={id => { deleteNode(id); setSel(null); }} /></div>
        </div>}
      </>}
      {tab === 'gantt' && <div className="pane-full"><GanttView scheduled={scheduled} weeks={weeks} deadlines={deadlines} teams={teams} cpSet={cpSet} tree={tree} onBarClick={onBarClick} onSeqUpdate={onSeqUpdate} /></div>}
      {tab === 'net' && <div className="pane-full"><NetGraph tree={tree} scheduled={scheduled} teams={teams} cpSet={cpSet}
        onNodeClick={r => onBarClick(r)}
        onAddNode={() => setModal('add')}
        onAddDep={(fromId, toId) => { const node = tree.find(r => r.id === toId); if (node) { const deps = [...new Set([...(node.deps || []), fromId])]; updateNode({ ...node, deps }); } }}
        onDeleteNode={id => deleteNode(id)} /></div>}
      {tab === 'deadlines' && <div className="pane"><DLView deadlines={deadlines} scheduled={scheduled} onEdit={() => setModal('deadlines')} /></div>}
      {tab === 'resources' && <div className="pane"><ResView members={members} teams={teams} vacations={vacations} onUpd={updateMember} onAdd={addMember} onDel={deleteMember} onVac={v => setD('vacations', v)} /></div>}
      {tab === 'holidays' && <div className="pane"><HolView holidays={data.holidays || []} planStart={planStart} planEnd={planEnd} onUpdate={v => setD('holidays', v)} /></div>}
    </div>
    {modal === 'node' && modalNode && <NodeModal node={tree.find(r => r.id === modalNode.id) || modalNode} tree={tree} members={members} teams={teams} scheduled={scheduled} cpSet={cpSet}
      onClose={() => { setModal(null); setMN(null); }} onUpdate={n => { updateNode(n); setSel(n); }} onDelete={deleteNode} />}
    {modal === 'add' && <AddModal tree={tree} teams={teams} selected={selected} onAdd={addNode} onClose={() => setModal(null)} />}
    {modal === 'settings' && <SettingsModal meta={meta} teams={teams} onSave={(m, ts) => { setD('meta', m); setD('teams', ts); }} onClose={() => setModal(null)} />}
    {modal === 'deadlines' && <DLModal deadlines={deadlines} tree={tree} onSave={v => setD('deadlines', v)} onClose={() => setModal(null)} />}
    {modal === 'new' && <NewProjModal onClose={() => setModal(null)} onCreate={d => { setData(d); setSaved(false); setModal(null); setTab('tree'); }} />}
  </div>;
}
