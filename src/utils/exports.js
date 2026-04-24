// All export functions extracted from App.jsx to keep it under 600 LOC.
// Each function takes a context object with the data it needs.
import { iso } from './date.js';
import { generateReport } from './report.js';
import { formatPhaseToken } from './phases.js';
// @turbodocx browser build is a classic UMD: `var HTMLToDOCX=function(){…}()`
// — relies on the `var` hoisting onto `window` when executed as a <script>.
// Vite's ESM pipeline breaks that because esm.js drags node-only deps (Buffer
// classes extending undefined globals). Load the browser file via <script>
// injection using Vite's `?url` asset import so it runs at global scope.
import turboBrowserUrl from '@turbodocx/html-to-docx/dist/html-to-docx.browser.js?url';

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}
function slug(name) { return (name || 'planr').toLowerCase().replace(/\s+/g, '-'); }

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _turboDocxPromise = null;
async function loadTurboDocx() {
  // turbodocx's image pipeline uses Node's Buffer internally. In the browser
  // build it's not polyfilled — so we inject one before the script runs.
  if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
    const bufMod = await import('buffer');
    window.Buffer = bufMod.Buffer || bufMod.default?.Buffer;
  }
  if (typeof window !== 'undefined' && typeof window.HTMLToDOCX === 'function') {
    return window.HTMLToDOCX;
  }
  if (_turboDocxPromise) return _turboDocxPromise;
  _turboDocxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = turboBrowserUrl;
    s.async = true;
    s.onload = () => {
      if (typeof window.HTMLToDOCX === 'function') resolve(window.HTMLToDOCX);
      else reject(new Error('turbodocx browser build did not expose HTMLToDOCX'));
    };
    s.onerror = () => reject(new Error('Failed to load turbodocx browser build'));
    document.head.appendChild(s);
  }).catch(e => { _turboDocxPromise = null; throw e; });
  return _turboDocxPromise;
}

export function exportJSON({ data, meta }) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${slug(meta.name)}-${iso(new Date())}.json`);
}

export function exportPDF() { window.print(); }

// ── SVG/PNG helpers ──────────────────────────────────────────────────────────
export function buildNetworkSvg({ meta }) {
  const svg = document.querySelector('.netgraph-wrap svg');
  if (!svg) return null;
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const g = clone.querySelector('g');
  if (g) g.removeAttribute('transform');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `svg{background:#f8f9fc;--bg:#f8f9fc;--bg2:#fff;--bg3:#f0f2f5;--bg4:#e5e8ee;--b:#e0e4ea;--b2:#ccd2dc;--b3:#b0b8c8;--tx:#1a1e2a;--tx2:#4a5268;--tx3:#7a839a;--ac:#2563eb;--ac2:#1d4ed8;--gr:#16a34a;--am:#d97706;--re:#dc2626;--r:7px;--mono:'JetBrains Mono',monospace;--font:'Inter',sans-serif}text{font-family:'Inter',sans-serif}`;
  clone.prepend(style);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  clone.querySelectorAll('g > g').forEach(n => {
    const t = n.getAttribute('transform');
    if (t) { const m = t.match(/translate\(([^,]+),([^)]+)\)/); if (m) { const x = +m[1], y = +m[2]; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + 250); maxY = Math.max(maxY, y + 60); } }
  });
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 1200; maxY = 800; }
  const pad = 40, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
  clone.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${w} ${h}`);
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  return { svg: clone, width: w, height: h };
}

async function svgToPng(svgEl, width, height, scale = 2, bg = '#f8f9fc') {
  const xml = typeof svgEl === 'string' ? svgEl : new XMLSerializer().serializeToString(svgEl);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale; canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas to blob failed')), 'image/png');
    };
    img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export async function svgToDataUrl(svgEl, width, height, scale = 3, bg = '#ffffff') {
  const xml = typeof svgEl === 'string' ? svgEl : new XMLSerializer().serializeToString(svgEl);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      try { resolve(canvas.toDataURL('image/png')); } catch (e) { reject(e); }
    };
    img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function exportNetworkSVG(ctx) {
  const r = buildNetworkSvg(ctx);
  if (!r) return alert('Switch to the Network tab first.');
  download(new Blob([new XMLSerializer().serializeToString(r.svg)], { type: 'image/svg+xml' }), `${slug(ctx.meta.name)}-network.svg`);
}

export async function exportNetworkPNG(ctx) {
  const r = buildNetworkSvg(ctx);
  if (!r) return alert('Switch to the Network tab first.');
  try {
    const blob = await svgToPng(r.svg, r.width, r.height, 2);
    download(blob, `${slug(ctx.meta.name)}-network.png`);
  } catch (e) { alert('PNG export failed: ' + (e.message || e)); }
}

// ── Gantt SVG ────────────────────────────────────────────────────────────────
export function buildGanttSvg({ scheduled, weeks, teams, meta }) {
  if (!scheduled?.length || !weeks?.length) return null;
  const WPX = 22, RH = 24, GH = 28, HH = 50, LW = 280;
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
  const months = []; let cm = null, cc = 0, cs = 0;
  weeks.forEach((w, i) => { const ym = `${w.mon.getFullYear()}-${w.mon.getMonth()}`; if (ym !== cm) { if (cm) months.push({ ym: cm, count: cc, start: cs }); cm = ym; cc = 1; cs = i; } else cc++; });
  if (cm) months.push({ ym: cm, count: cc, start: cs });
  const MDE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const teamColor = tid => tid === NO_TEAM ? '#64748b' : (teams.find(x => x.id === tid)?.color || '#3b82f6');
  const teamName = tid => tid === NO_TEAM ? 'No team' : (teams.find(x => x.id === tid)?.name || tid);
  const xmlns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(xmlns, 'svg');
  svg.setAttribute('xmlns', xmlns); svg.setAttribute('width', totalW); svg.setAttribute('height', totalH);
  svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`); svg.setAttribute('font-family', 'Inter, sans-serif');
  const bg = document.createElementNS(xmlns, 'rect');
  bg.setAttribute('width', totalW); bg.setAttribute('height', totalH); bg.setAttribute('fill', '#ffffff'); svg.appendChild(bg);
  const title = document.createElementNS(xmlns, 'text');
  title.setAttribute('x', 10); title.setAttribute('y', 18); title.setAttribute('font-size', 14); title.setAttribute('font-weight', '700'); title.setAttribute('fill', '#1a1e2a');
  title.textContent = (meta.name || 'Project') + ' — Schedule'; svg.appendChild(title);
  const sub = document.createElementNS(xmlns, 'text');
  sub.setAttribute('x', 10); sub.setAttribute('y', 34); sub.setAttribute('font-size', 10); sub.setAttribute('fill', '#7a839a');
  sub.textContent = `${weeks.length} weeks · ${scheduled.length} tasks · ${new Date().toLocaleDateString('de-DE')}`; svg.appendChild(sub);
  let mx = LW;
  months.forEach(m => {
    const [y, mo] = m.ym.split('-'); const w = WPX * m.count;
    const r = document.createElementNS(xmlns, 'rect');
    r.setAttribute('x', mx); r.setAttribute('y', HH - 24); r.setAttribute('width', w); r.setAttribute('height', 12);
    r.setAttribute('fill', mo === '0' ? '#dbeafe' : '#f0f2f5'); r.setAttribute('stroke', '#ccd2dc'); svg.appendChild(r);
    const t = document.createElementNS(xmlns, 'text');
    t.setAttribute('x', mx + 4); t.setAttribute('y', HH - 14); t.setAttribute('font-size', 9); t.setAttribute('fill', mo === '0' ? '#1d4ed8' : '#4a5268'); t.setAttribute('font-weight', '600');
    t.textContent = (mo === '0' ? y + ' ' : '') + MDE[+mo]; svg.appendChild(t); mx += w;
  });
  weeks.forEach((w, i) => {
    const x = LW + i * WPX;
    const r = document.createElementNS(xmlns, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', HH - 12); r.setAttribute('width', WPX); r.setAttribute('height', 12);
    r.setAttribute('fill', w.hasH ? '#fee2e2' : '#ffffff'); r.setAttribute('stroke', '#e0e4ea'); svg.appendChild(r);
    if (i > 0 && weeks[i - 1].mon.getFullYear() !== w.mon.getFullYear()) {
      const ln = document.createElementNS(xmlns, 'line'); ln.setAttribute('x1', x); ln.setAttribute('x2', x); ln.setAttribute('y1', HH - 24); ln.setAttribute('y2', totalH); ln.setAttribute('stroke', '#1d4ed8'); ln.setAttribute('stroke-width', '1.5'); svg.appendChild(ln);
    }
    const t = document.createElementNS(xmlns, 'text');
    t.setAttribute('x', x + WPX / 2); t.setAttribute('y', HH - 3); t.setAttribute('font-size', 7); t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', w.hasH ? '#dc2626' : '#7a839a'); t.setAttribute('font-family', 'monospace');
    t.textContent = w.kw; svg.appendChild(t);
  });
  const now = new Date();
  const todayWi = weeks.findIndex((w, i) => { const next = weeks[i + 1]; return w.mon <= now && (!next || next.mon > now); });
  if (todayWi >= 0) {
    const ln = document.createElementNS(xmlns, 'line');
    ln.setAttribute('x1', LW + todayWi * WPX); ln.setAttribute('x2', LW + todayWi * WPX); ln.setAttribute('y1', HH); ln.setAttribute('y2', totalH);
    ln.setAttribute('stroke', '#16a34a'); ln.setAttribute('stroke-width', '2'); ln.setAttribute('opacity', '0.6'); svg.appendChild(ln);
  }
  let y = HH;
  rows.forEach(row => {
    if (row.type === 'team') {
      const col = teamColor(row.team);
      const r = document.createElementNS(xmlns, 'rect'); r.setAttribute('x', 0); r.setAttribute('y', y); r.setAttribute('width', totalW); r.setAttribute('height', GH); r.setAttribute('fill', '#f0f2f5'); svg.appendChild(r);
      const cb = document.createElementNS(xmlns, 'rect'); cb.setAttribute('x', 0); cb.setAttribute('y', y); cb.setAttribute('width', 4); cb.setAttribute('height', GH); cb.setAttribute('fill', col); svg.appendChild(cb);
      const t = document.createElementNS(xmlns, 'text'); t.setAttribute('x', 12); t.setAttribute('y', y + GH / 2 + 4); t.setAttribute('font-size', 11); t.setAttribute('font-weight', '700'); t.setAttribute('fill', col);
      t.textContent = teamName(row.team); svg.appendChild(t); y += GH; return;
    }
    const s = row.s;
    const ln = document.createElementNS(xmlns, 'line'); ln.setAttribute('x1', 0); ln.setAttribute('x2', totalW); ln.setAttribute('y1', y + RH); ln.setAttribute('y2', y + RH); ln.setAttribute('stroke', '#f0f2f5'); svg.appendChild(ln);
    const lid = document.createElementNS(xmlns, 'text'); lid.setAttribute('x', 6); lid.setAttribute('y', y + RH / 2 + 4); lid.setAttribute('font-size', 9); lid.setAttribute('fill', '#7a839a'); lid.setAttribute('font-family', 'monospace'); lid.textContent = s.id; svg.appendChild(lid);
    const lname = document.createElementNS(xmlns, 'text'); lname.setAttribute('x', 70); lname.setAttribute('y', y + RH / 2 + 4); lname.setAttribute('font-size', 10); lname.setAttribute('fill', '#1a1e2a');
    lname.textContent = s.name.length > 28 ? s.name.slice(0, 28) + '…' : s.name; svg.appendChild(lname);
    const lper = document.createElementNS(xmlns, 'text'); lper.setAttribute('x', LW - 6); lper.setAttribute('y', y + RH / 2 + 4); lper.setAttribute('font-size', 9); lper.setAttribute('fill', '#4a5268'); lper.setAttribute('text-anchor', 'end'); lper.setAttribute('font-family', 'monospace');
    lper.textContent = s.person; svg.appendChild(lper);
    if (s.status !== 'done' && s.startWi >= 0) {
      const bx = LW + s.startWi * WPX + 1, bw = (s.endWi - s.startWi + 1) * WPX - 2, tc = teamColor(s.team || NO_TEAM);
      const bar = document.createElementNS(xmlns, 'rect'); bar.setAttribute('x', bx); bar.setAttribute('y', y + 5); bar.setAttribute('width', Math.max(bw, 4)); bar.setAttribute('height', RH - 10);
      bar.setAttribute('fill', tc + '55'); bar.setAttribute('stroke', tc); bar.setAttribute('stroke-width', '1'); bar.setAttribute('rx', 3); svg.appendChild(bar);
      if (bw > 30) { const lbl = document.createElementNS(xmlns, 'text'); lbl.setAttribute('x', bx + 5); lbl.setAttribute('y', y + RH / 2 + 3); lbl.setAttribute('font-size', 9); lbl.setAttribute('fill', '#1a1e2a'); lbl.setAttribute('font-weight', '600'); lbl.textContent = s.name.length > Math.floor(bw / 7) ? s.name.slice(0, Math.floor(bw / 7) - 1) + '…' : s.name; svg.appendChild(lbl); }
    }
    y += RH;
  });
  return { svg, width: totalW, height: totalH };
}

export function exportGanttSVG(ctx) {
  const r = buildGanttSvg(ctx);
  if (!r) return alert('No scheduled items.');
  download(new Blob([new XMLSerializer().serializeToString(r.svg)], { type: 'image/svg+xml' }), `${slug(ctx.meta.name)}-gantt.svg`);
}

export async function exportGanttPNG(ctx) {
  const r = buildGanttSvg(ctx);
  if (!r) return alert('No scheduled items.');
  try { const blob = await svgToPng(r.svg, r.width, r.height, 2); download(blob, `${slug(ctx.meta.name)}-gantt.png`); }
  catch (e) { alert('PNG export failed: ' + (e.message || e)); }
}

// ── Sprint Markdown ──────────────────────────────────────────────────────────
export function exportSprintMarkdown({ scheduled, tree, teams, meta, horizonDays }) {
  if (!scheduled.length) return alert('No scheduled tasks.');
  const horizon = horizonDays
    ? Math.max(1, parseInt(horizonDays) || 30)
    : (() => {
        const horizonStr = prompt('Sprint horizon in days from today?', '30');
        if (horizonStr === null) return null;
        return Math.max(1, parseInt(horizonStr) || 30);
      })();
  if (!horizon) return;
  const now = new Date(); const end = new Date(); end.setDate(end.getDate() + horizon);
  const up = scheduled.filter(s => s.status !== 'done' && s.startD && s.startD <= end).sort((a, b) => (a.startD - b.startD) || (a.prio || 4) - (b.prio || 4));
  if (!up.length) return alert(`No tasks within ${horizon} days.`);
  const tn = id => teams.find(t => t.id === id)?.name || id;
  const groups = new Map();
  up.forEach(s => {
    const key = s.personId || `team:${s.team || 'none'}`;
    if (!groups.has(key)) groups.set(key, { key, isPerson: !!s.personId, label: s.personId ? s.person : `${tn(s.team) || 'No team'} (unassigned)`, items: [] });
    groups.get(key).items.push(s);
  });
  const sorted = [...groups.values()].sort((a, b) => a.isPerson === b.isPerson ? a.label.localeCompare(b.label) : a.isPerson ? -1 : 1);
  let md = `# ${meta.name || 'Project'} — Sprint Plan\n\n_Horizon: ${horizon} days (${iso(now)} → ${iso(end)})_\n_${up.length} tasks, ${sorted.length} lanes_\n\n`;
  sorted.forEach(g => {
    md += `## ${g.label}\n\n| Start | Task | Team | Effort | Status |\n|---|---|---|---|---|\n`;
    g.items.forEach(s => { const node = tree.find(r => r.id === (s.treeId || s.id)); md += `| ${iso(s.startD)} | ${s.id} ${s.name.replace(/\|/g, '\\|')}${node?.decideBy ? ` ⏰ ${node.decideBy}` : ''} | ${tn(s.team)} | ${s.effort?.toFixed(1)}d | ${s.status === 'wip' ? '🟡 WIP' : 'Open'} |\n`; });
    md += '\n';
  });
  download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slug(meta.name)}-sprint-${horizon}d.md`);
}

// ── Mermaid ──────────────────────────────────────────────────────────────────
export function exportMermaid({ tree, meta }) {
  if (!tree.length) return alert('No items.');
  const sid = id => id.replace(/[^A-Za-z0-9_]/g, '_');
  const sl = s => (s || '').replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 60);
  let out = '```mermaid\nflowchart TD\n';
  tree.forEach(r => { const lbl = `${r.id}: ${sl(r.name)}`; out += `  ${sid(r.id)}${!r.id.includes('.') ? `(["${lbl}"])` : r.status === 'done' ? `("${lbl}")` : `["${lbl}"]`}\n`; });
  out += '\n';
  tree.forEach(r => { if (r.id.includes('.')) out += `  ${sid(r.id.split('.').slice(0, -1).join('.'))} --> ${sid(r.id)}\n`; });
  out += '\n';
  tree.forEach(r => { (r.deps || []).forEach(d => { out += `  ${sid(d)} -.->|dep| ${sid(r.id)}\n`; }); });
  out += '\n  classDef done fill:#dcfce7,stroke:#16a34a,color:#15803d\n  classDef wip fill:#fef3c7,stroke:#d97706,color:#a16207\n  classDef root fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a,font-weight:bold\n';
  tree.filter(r => r.status === 'done').forEach(r => { out += `  class ${sid(r.id)} done\n`; });
  tree.filter(r => r.status === 'wip').forEach(r => { out += `  class ${sid(r.id)} wip\n`; });
  tree.filter(r => !r.id.includes('.')).forEach(r => { out += `  class ${sid(r.id)} root\n`; });
  out += '```\n';
  download(new Blob([out], { type: 'text/plain;charset=utf-8' }), `${slug(meta.name)}-mermaid.md`);
}

// ── CSV ──────────────────────────────────────────────────────────────────────
export function exportCSV({ tree, meta }) {
  const hdr = ['ID', 'Level', 'Name', 'Status', 'Team', 'Best (days)', 'Factor', 'Priority', 'Dependencies', 'Phases', 'Notes'];
  const fmtPhases = phases => {
    if (!phases?.length) return '';
    return phases.map(p => formatPhaseToken(p)).join(', ');
  };
  const rows = tree.map(r => [r.id, r.lvl, `"${(r.name || '').replace(/"/g, '""')}"`, r.status, r.team || '', r.best || '', r.factor || '', r.prio || '', (r.deps || []).join('; '), `"${fmtPhases(r.phases)}"`, `"${(r.note || '').replace(/"/g, '""')}"`]);
  download(new Blob(['\uFEFF' + [hdr.join(';'), ...rows.map(r => r.join(';'))].join('\n')], { type: 'text/csv;charset=utf-8' }), `${slug(meta.name)}-${iso(new Date())}.csv`);
}

// ── Jira CSV (importable via Jira's built-in CSV importer) ───────────────────
export function exportJiraCSV({ tree, scheduled, members, teams, meta, selectedIds }) {
  const PRIO = { 1: 'Highest', 2: 'High', 3: 'Medium', 4: 'Low' };
  const sMap = Object.fromEntries((scheduled || []).map(s => [s.id, s]));
  const mMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  const tMap = Object.fromEntries((teams || []).map(t => [t.id, t]));

  // Pick tasks: selected or all non-done leaves
  let items = tree.filter(r => {
    if (selectedIds?.size) return selectedIds.has(r.id);
    const isLeaf = !tree.some(c => c.id !== r.id && c.id.startsWith(r.id + '.'));
    return isLeaf && r.status !== 'done' && r.best > 0;
  });

  const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
  // Jira Issue Key column lets re-imports *update* existing tickets instead of
  // creating duplicates. Detect a custom field that stores the ticket key
  // (`jira`, `issueKey`, `ticket` …) and emit its value alongside the Planr ID.
  const jiraFieldId = (() => {
    const pool = tree.flatMap(r => r.customValues ? Object.keys(r.customValues) : []);
    return [...new Set(pool)].find(k => /jira|issue[_-]?key|ticket/i.test(k)) || '';
  })();
  const hdr = ['Summary', 'Description', 'Issue Type', 'Priority', 'Labels', 'Component', 'Original Estimate', 'Assignee', 'Epic Name', 'Issue Key', 'Planr ID'];
  const rows = items.map(r => {
    const sc = sMap[r.id];
    const assignee = (r.assign || [])[0] ? (mMap[(r.assign || [])[0]]?.name || '') : (sc?.autoAssigned && sc.personId ? mMap[sc.personId]?.name || '' : '');
    const teamName = tMap[r.team]?.name || r.team || '';
    const rootId = r.id.split('.')[0];
    const root = tree.find(x => x.id === rootId);
    const estimate = r.best ? `${Math.round(r.best * (r.factor || 1.5))}d` : '';
    const phases = r.phases?.length ? r.phases.map(p => `${p.status === 'done' ? '✓' : p.status === 'wip' ? '◐' : '○'} ${p.name}`).join(', ') : '';
    const desc = [r.note, phases ? `Phasen: ${phases}` : ''].filter(Boolean).join('\n');
    const issueKey = jiraFieldId && r.customValues?.[jiraFieldId] ? String(r.customValues[jiraFieldId]) : '';
    return [esc(r.name), esc(desc), 'Task', PRIO[r.prio] || 'Medium', esc(teamName), esc(teamName), estimate, esc(assignee), esc(root?.name || rootId), esc(issueKey), r.id].join(',');
  });

  download(new Blob(['\uFEFF' + [hdr.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), `${slug(meta.name)}-jira-${iso(new Date())}.csv`);
}

// ── Report (DOCX for Confluence / Word) — HTML → DOCX via @turbodocx ─────
// The `docx` lib approach required hand-building every paragraph/table and
// fighting percentage-width rendering; Word collapsed columns and Mac users
// saw "missing font" warnings. Routing the existing HTML report through
// html-to-docx yields pixel-equivalent output to the Summary PDF with zero
// width-math and uses only system-available fonts.
export async function exportReportDocx(ctx) {
  try {
    const htmlRaw = generateReport(ctx);
    const { meta, lang } = ctx;
    const de = lang === 'de';
    const dateStr = new Date().toLocaleDateString(de ? 'de-DE' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Rasterize the inline roadmap SVG into a PNG data URL so Word renders it
    // exactly the same as the PDF (html-to-docx accepts <img src="data:...">).
    const roadmapSvgMatch = htmlRaw.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1400 800"[\s\S]*?<\/svg>/);
    let html = htmlRaw;
    if (roadmapSvgMatch) {
      const W = 1400, H = 800;
      const patched = roadmapSvgMatch[0].replace(
        /^<svg [^>]*>/,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`,
      );
      const inlined = patched
        .replace(/var\(--tx,([^)]*)\)/g, '#1a1e2a')
        .replace(/var\(--tx2,([^)]*)\)/g, '#4a5268')
        .replace(/var\(--tx3,([^)]*)\)/g, '#7a839a')
        .replace(/var\(--bg,([^)]*)\)/g, '#ffffff')
        .replace(/var\(--bg2,([^)]*)\)/g, '#f8f9fc')
        .replace(/var\(--b2,([^)]*)\)/g, '#ccd2dc')
        .replace(/var\(--re,([^)]*)\)/g, '#ef4444')
        .replace(/var\(--tx[^)]*\)/g, '#1a1e2a')
        .replace(/var\(--tx2[^)]*\)/g, '#4a5268')
        .replace(/var\(--tx3[^)]*\)/g, '#7a839a')
        .replace(/var\(--bg[^)]*\)/g, '#ffffff');
      try {
        const dataUrl = await svgToDataUrl(inlined, W, H, 3, '#ffffff');
        html = html.replace(roadmapSvgMatch[0], `<div style="text-align:center;margin:8px 0"><img src="${dataUrl}" width="900" alt="Roadmap" /></div>`);
      } catch {
        // If rasterization fails, drop the SVG to avoid breaking the document.
        html = html.replace(roadmapSvgMatch[0], '');
      }
    }

    // Use system-available fonts. JetBrains Mono triggers Mac's "missing font"
    // warning; Consolas/Courier New are universal.
    html = html.replace(/'JetBrains Mono','Cascadia Code',monospace/g, "Consolas,'Courier New',monospace");


    // html-to-docx collapses flexbox to block flow, so KPI rows and two-column
    // grids stack vertically (value/label on separate lines). Rewrite those
    // structures as proper <table>s so Word sees intended columns.
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // KPI row (.kpi-row → one-row table, each .kpi becomes a <td>)
      doc.querySelectorAll('.kpi-row').forEach(row => {
        const kpis = [...row.querySelectorAll('.kpi')];
        if (!kpis.length) return;
        const table = doc.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;margin:0 0 10px 0');
        const tr = doc.createElement('tr');
        kpis.forEach(k => {
          const v = k.querySelector('.kpi-v');
          const l = k.querySelector('.kpi-l');
          const valueColor = v?.getAttribute('style')?.match(/color:\s*([^;]+)/i)?.[1] || '#1a1e2a';
          const td = doc.createElement('td');
          td.setAttribute('style', 'padding:8px 10px;border:1px solid #e0e4ea;background:#f7f9fc;text-align:center;vertical-align:top;font-family:Inter,system-ui,sans-serif');
          td.innerHTML =
            (v ? `<div style="font-size:14pt;font-weight:700;color:${valueColor};line-height:1.1;margin-bottom:2px">${v.innerHTML}</div>` : '') +
            (l ? `<div style="font-size:8pt;color:#7a839a;text-transform:uppercase;letter-spacing:0.04em">${l.innerHTML}</div>` : '');
          tr.appendChild(td);
        });
        table.appendChild(tr);
        row.replaceWith(table);
      });

      // Roadmap legend → flat block HTML inside a multi-column table. The
      // generated legend uses nested flex containers (line column → line
      // header row → station row), which html-to-docx collapses into empty
      // cells. Extract structured bits (line id, stations, cluster items with
      // status + abbrev) and emit clean HTML so Word shows:
      //   P2  Performance / Blocks                                     ← line header
      //   ● PL  Preisfindung Logik 3/4                                 ← station (bold abbrev in line color)
      //     ◐ Preisfindung API                                         ← indented cluster item
      //     ○ Preisfindung Cache
      doc.querySelectorAll('div[style*="margin-top:16px"][style*="display:flex"][style*="flex-wrap:wrap"]').forEach(legend => {
        const cols = [...legend.children];
        if (!cols.length) return;
        // Helpers scoped to the legend parse.
        const isIndented = row => /padding-left:\s*(?:1[4-9]|[2-9]\d|\d{3,})/.test(row.getAttribute('style') || '');
        const isDone = row => /line-through/.test(row.getAttribute('style') || '');
        const guessStatus = row => {
          const txt = row.textContent || '';
          if (isDone(row)) return 'done';
          // "x/y" badge with x === y → done (shouldn't hit because of line-through above);
          // otherwise current-progress uses wip; plain unstarted stays open.
          if (/◐/.test(txt)) return 'wip';
          return /\b([1-9]\d*)\s*\/\s*([1-9]\d*)\b/.test(txt) ? 'wip' : 'open';
        };
        const statusGlyph = st => st === 'done' ? '●' : st === 'wip' ? '◐' : '○';

        const flatCols = cols.map(col => {
          const lineHeader = col.children[0];
          const color = lineHeader?.querySelector('span[style*="background:"]')
            ?.getAttribute('style')
            ?.match(/background:([^;]+)/i)?.[1]?.trim() || '#1a1e2a';
          const headerSpans = lineHeader ? [...lineHeader.querySelectorAll('span')] : [];
          const lineId = headerSpans[1]?.textContent?.trim() || '';
          const lineName = headerSpans[2]?.textContent?.trim() || '';
          const rest = [...col.children].slice(1);
          const stationLines = rest.map(row => {
            const spans = [...row.querySelectorAll('span')].filter(s => s.textContent?.trim());
            const indent = isIndented(row);
            const done = isDone(row);
            const status = guessStatus(row);
            if (indent) {
              // Cluster item: one text span (name)
              return { kind: 'cluster', name: spans[0]?.textContent?.trim() || '', status, done };
            }
            // Station row: [abbrev, "Name x/y"]
            const abbrev = spans[0]?.textContent?.trim() || '';
            // Trailing count like " 3/5" lives at the end of the name span;
            // split it off so we can format it separately.
            const nameRaw = spans[1]?.textContent?.trim() || '';
            const countMatch = nameRaw.match(/\s*(\d+\/\d+|✓)\s*$/);
            const count = countMatch ? countMatch[1] : '';
            const name = count ? nameRaw.slice(0, nameRaw.length - countMatch[0].length).trim() : nameRaw;
            return { kind: 'station', abbrev, name, count, status, done };
          }).filter(s => s.name || s.abbrev);
          return { color, lineId, lineName, stationLines };
        });

        const table = doc.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;margin:12px 0 16px 0');
        const perRow = Math.min(3, flatCols.length);
        for (let i = 0; i < flatCols.length; i += perRow) {
          const tr = doc.createElement('tr');
          for (let j = 0; j < perRow; j++) {
            const td = doc.createElement('td');
            td.setAttribute('style', `width:${Math.floor(100 / perRow)}%;padding:8px 10px;vertical-align:top;border:1px solid #e0e4ea;background:#fafbfd`);
            const data = flatCols[i + j];
            if (data) {
              const parts = [];
              parts.push(
                `<div style="margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid ${data.color}44">` +
                  `<span style="display:inline-block;background:${data.color};color:#fff;font-weight:700;padding:1px 6px;border-radius:3px;font-size:10px;font-family:'Courier New',monospace">${escapeHtml(data.lineId)}</span>` +
                  (data.lineName ? ` <span style="font-size:11px;font-weight:600;color:#1a1e2a">${escapeHtml(data.lineName)}</span>` : '') +
                `</div>`
              );
              // Single font stack (Inter / system) throughout the legend so
              // Word doesn't mix monospace abbrevs with sans text; indent
              // cluster items via a <blockquote>-style margin so the nesting
              // is obvious even in Word's limited block-flow layout.
              const FONT = "'Inter','Segoe UI',system-ui,sans-serif";
              data.stationLines.forEach(s => {
                const iconColor = data.color;
                const strike = s.done ? 'text-decoration:line-through;opacity:0.6;' : '';
                if (s.kind === 'station') {
                  parts.push(
                    `<div style="font-family:${FONT};font-size:10.5px;margin:2px 0;${strike}">` +
                      `<span style="color:${iconColor};font-weight:700;margin-right:6px">${statusGlyph(s.status)}</span>` +
                      `<span style="color:${iconColor};font-weight:700">${escapeHtml(s.abbrev)}</span>` +
                      (s.name ? ` <span style="color:${iconColor};font-weight:700">${escapeHtml(s.name)}</span>` : '') +
                      (s.count ? ` <span style="color:#7a839a;font-weight:400;font-size:9.5px">${escapeHtml(s.count)}</span>` : '') +
                    `</div>`
                  );
                } else {
                  parts.push(
                    `<div style="font-family:${FONT};font-size:10px;margin:1px 0 1px 22px;${strike}">` +
                      `<span style="color:${iconColor};margin-right:6px">${statusGlyph(s.status)}</span>` +
                      `<span style="color:#4a5268;font-weight:400">${escapeHtml(s.name)}</span>` +
                    `</div>`
                  );
                }
              });
              td.innerHTML = parts.join('');
            }
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
        legend.replaceWith(table);
      });

      // Two-column grid (.grid2 → table with 2 tds per row)
      doc.querySelectorAll('.grid2').forEach(grid => {
        const cards = [...grid.children];
        if (!cards.length) return;
        const table = doc.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;margin:0 0 10px 0');
        for (let i = 0; i < cards.length; i += 2) {
          const tr = doc.createElement('tr');
          [cards[i], cards[i + 1]].forEach(card => {
            const td = doc.createElement('td');
            td.setAttribute('style', 'width:50%;padding:4px;vertical-align:top');
            if (card) td.appendChild(card.cloneNode(true));
            tr.appendChild(td);
          });
          table.appendChild(tr);
        }
        grid.replaceWith(table);
      });

      // Progress/confidence bar strips (.bar, .conf-bar) — <div> with flex
      // children. Replace with a 1-row table so segment widths render side by
      // side in Word. Skip if no children have explicit width.
      doc.querySelectorAll('.bar, .conf-bar').forEach(bar => {
        const segs = [...bar.children].filter(c => c.style?.width);
        if (!segs.length) return;
        const table = doc.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;height:8px;margin:4px 0 8px 0');
        const tr = doc.createElement('tr');
        segs.forEach(seg => {
          const td = doc.createElement('td');
          const bg = seg.getAttribute('style')?.match(/background:\s*([^;]+)/i)?.[1] || '#e5e8ee';
          const w = seg.getAttribute('style')?.match(/width:\s*([^;]+)/i)?.[1] || '0';
          td.setAttribute('style', `background:${bg};width:${w};height:8px;padding:0;line-height:8px;font-size:1px`);
          td.innerHTML = '&nbsp;';
          tr.appendChild(td);
        });
        table.appendChild(tr);
        bar.replaceWith(table);
      });

      html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    } catch (e) {
      // Non-fatal: if DOMParser or replacement fails, we still hand the raw
      // HTML to html-to-docx which produces the previous (block-stacked) output.
      console.warn('[exportReportDocx] HTML pre-processing failed; falling back to raw report HTML', e);
    }

    const HTMLtoDOCX = await loadTurboDocx();
    const header = `<div style="font-size:9px;color:#7a839a">${(meta.name || 'Project')} — ${de ? 'Projektbericht' : 'Project Report'}</div>`;
    const footer = `<div style="font-size:8px;color:#7a839a;text-align:center">${dateStr} · Planr</div>`;
    const out = await HTMLtoDOCX(html, header, {
      orientation: 'landscape',
      margins: { top: 720, right: 720, bottom: 720, left: 720, header: 360, footer: 360 },
      title: `${meta.name || 'Project'} — ${de ? 'Projektbericht' : 'Project Report'}`,
      creator: 'Planr',
      font: 'Calibri',
      fontSize: 20, // half-points — 20 = 10pt
      header: true,
      footer: true,
      pageNumber: true,
      table: { row: { cantSplit: true } },
    }, footer);

    const blob = out instanceof Blob ? out : new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    download(blob, `${slug(meta.name)}-summary-${iso(new Date())}.docx`);
  } catch (e) {
    console.error(e);
    alert('Word export failed: ' + (e.message || e));
  }
}


// Re-export PDF exports so App.jsx keeps a single import source.
export { exportSummaryPDF, exportGanttPDF, exportTodoPDF, exportWhatWhenPDF } from './pdfExports.js';

