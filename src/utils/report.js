// Generates a self-contained HTML project report document.
// Opens in a new tab — user prints as PDF via Cmd/Ctrl+P.
import { iso } from './date.js';
import { leafNodes, isLeafNode, re, resolveToLeafIds, computeConfidence } from './scheduler.js';

export function generateReport({ tree, members, teams, scheduled, weeks, cpSet, goalPaths, stats, confidence, meta, lang }) {
  const de = lang === 'de';
  const t = (en, deTxt) => de ? deTxt : en;
  const teamName = id => teams.find(x => x.id === id)?.name || id || '';
  const memberName = id => members.find(x => x.id === id)?.name || id || '';
  const lvs = leafNodes(tree);
  const done = lvs.filter(r => r.status === 'done').length;
  const wip = lvs.filter(r => r.status === 'wip').length;
  const open = lvs.filter(r => r.status === 'open').length;
  const totalPt = lvs.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
  const donePt = lvs.filter(r => r.status === 'done').reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
  const prog = lvs.length ? Math.round(done / lvs.length * 100) : 0;
  const latestEnd = scheduled.length ? scheduled.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
  const roots = tree.filter(r => !r.id.includes('.'));
  const GT = { goal: '🎯', painpoint: '⚡', deadline: '⏰' };

  // Confidence counts
  const cc = { committed: 0, estimated: 0, exploratory: 0 };
  const ccPt = { committed: 0, estimated: 0, exploratory: 0 };
  lvs.filter(r => r.status !== 'done').forEach(r => {
    const c = confidence[r.id] || 'committed';
    cc[c]++; ccPt[c] += re(r.best || 0, r.factor || 1.5);
  });
  const ccTotal = cc.committed + cc.estimated + cc.exploratory;

  // Team capacity
  const teamCap = {};
  teams.forEach(tm => { teamCap[tm.id] = { name: tm.name, color: tm.color, members: [], committed: 0, unassigned: 0, count: 0 }; });
  members.forEach(m => { if (teamCap[m.team]) teamCap[m.team].members.push(m); });
  lvs.filter(r => r.status !== 'done').forEach(r => {
    if (!teamCap[r.team]) return;
    const pt = re(r.best || 0, r.factor || 1.5);
    if ((r.assign || []).length > 0) teamCap[r.team].committed += pt;
    else if (r.best > 0) { teamCap[r.team].unassigned += pt; teamCap[r.team].count++; }
  });

  // Critical path items
  const cpItems = scheduled.filter(s => cpSet?.has(s.id)).sort((a, b) => (a.startD || 0) - (b.startD || 0));

  // Unassigned ready items
  const doneSet = new Set(lvs.filter(r => r.status === 'done').map(r => r.id));
  function isReady(id) {
    const item = tree.find(r => r.id === id); if (!item) return true;
    const parts = id.split('.'); const ancestors = [];
    for (let i = 1; i < parts.length; i++) ancestors.push(parts.slice(0, i).join('.'));
    const allDeps = [...new Set([...(item.deps || []), ...ancestors.flatMap(a => tree.find(r => r.id === a)?.deps || [])])];
    return allDeps.every(d => resolveToLeafIds(tree, d).every(dl => doneSet.has(dl)));
  }
  const unassigned = lvs.filter(r => r.status !== 'done' && !(r.assign || []).length && r.best > 0 && isReady(r.id));

  // Roadmap: root items with their scheduled ranges
  const roadmap = roots.map(root => {
    const st = stats[root.id];
    const childLeaves = lvs.filter(l => l.id === root.id || l.id.startsWith(root.id + '.'));
    const doneC = childLeaves.filter(l => l.status === 'done').length;
    const progC = childLeaves.length ? Math.round(doneC / childLeaves.length * 100) : 0;
    return { ...root, _startD: st?._startD, _endD: st?._endD, _r: st?._r || 0, leafCount: childLeaves.length, doneCount: doneC, prog: progC, conf: confidence[root.id] || 'committed' };
  }).filter(r => r._startD);

  const now = new Date();
  const dateStr = now.toLocaleDateString(de ? 'de-DE' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build HTML
  let html = `<!DOCTYPE html><html lang="${de ? 'de' : 'en'}"><head><meta charset="utf-8">
<title>${meta.name || 'Project'} — ${t('Project Report', 'Projektbericht')}</title>
<style>
  @page { margin: 20mm 15mm; size: A4 landscape; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 11px; color: #1a1e2a; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #2563eb; color: #1d4ed8; page-break-after: avoid; }
  h3 { font-size: 12px; margin: 12px 0 4px; color: #4a5268; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th { background: #f0f2f5; padding: 5px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #ccd2dc; white-space: nowrap; }
  td { padding: 4px 8px; border-bottom: 1px solid #e0e4ea; vertical-align: top; }
  tr:nth-child(even) td { background: #fafbfd; }
  .mono { font-family: 'JetBrains Mono', 'Cascadia Code', monospace; font-size: 9px; }
  .kpi-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .kpi { background: #f0f2f5; border-radius: 6px; padding: 10px 14px; min-width: 100px; }
  .kpi-v { font-size: 20px; font-weight: 700; }
  .kpi-l { font-size: 9px; color: #7a839a; text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }
  .bar-wrap { height: 8px; background: #e5e8ee; border-radius: 4px; overflow: hidden; margin: 4px 0; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .conf-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin: 4px 0; }
  .tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; margin-right: 3px; }
  .tag-cp { background: #fee2e2; color: #b91c1c; }
  .tag-exp { background: #f0f2f5; color: #7a839a; }
  .tag-est { background: #fef3c7; color: #a16207; }
  .tag-com { background: #dcfce7; color: #15803d; }
  .roadmap-bar { position: relative; height: 20px; border-radius: 4px; display: flex; align-items: center; padding: 0 6px; font-size: 9px; font-weight: 600; color: #fff; overflow: hidden; margin-bottom: 3px; }
  .page-break { page-break-before: always; }
  .subtitle { color: #7a839a; font-size: 12px; margin-bottom: 20px; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e0e4ea; font-size: 9px; color: #7a839a; text-align: center; }
  .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media print { .page-break { page-break-before: always; } }
</style></head><body>`;

  // ── 1. Cover ──
  html += `<h1>${meta.name || 'Project'}</h1>`;
  html += `<div class="subtitle">${t('Project Report', 'Projektbericht')} — ${dateStr}</div>`;

  // ── 2. Executive Summary ──
  html += `<h2>${t('Executive Summary', 'Zusammenfassung')}</h2>`;
  html += `<div class="kpi-row">`;
  html += `<div class="kpi"><div class="kpi-v" style="color:#16a34a">${prog}%</div><div class="kpi-l">${t('Progress', 'Fortschritt')}</div></div>`;
  html += `<div class="kpi"><div class="kpi-v">${lvs.length}</div><div class="kpi-l">${t('Total items', 'Gesamt Items')}</div></div>`;
  html += `<div class="kpi"><div class="kpi-v" style="color:#16a34a">${done}</div><div class="kpi-l">${t('Done', 'Erledigt')}</div></div>`;
  html += `<div class="kpi"><div class="kpi-v" style="color:#d97706">${wip}</div><div class="kpi-l">${t('In Progress', 'In Bearbeitung')}</div></div>`;
  html += `<div class="kpi"><div class="kpi-v">${open}</div><div class="kpi-l">${t('Open', 'Offen')}</div></div>`;
  html += `<div class="kpi"><div class="kpi-v">${totalPt.toFixed(0)}</div><div class="kpi-l">${t('Total PT (realistic)', 'Gesamt PT (realistisch)')}</div></div>`;
  if (latestEnd) html += `<div class="kpi"><div class="kpi-v class="mono"">${iso(latestEnd)}</div><div class="kpi-l">${t('Projected end', 'Voraussichtliches Ende')}</div></div>`;
  html += `</div>`;
  html += `<div class="bar-wrap"><div class="bar-fill" style="width:${prog}%;background:#16a34a"></div></div>`;

  // ── 3. Planning Confidence ──
  html += `<h2>${t('Planning Confidence', 'Planungssicherheit')}</h2>`;
  if (ccTotal > 0) {
    html += `<div class="conf-bar">`;
    html += `<div style="width:${cc.committed/ccTotal*100}%;background:#16a34a"></div>`;
    html += `<div style="width:${cc.estimated/ccTotal*100}%;background:#d97706"></div>`;
    html += `<div style="width:${cc.exploratory/ccTotal*100}%;background:#7a839a"></div>`;
    html += `</div>`;
    html += `<table><tr><th></th><th>${t('Items', 'Items')}</th><th>PT</th><th>${t('Meaning', 'Bedeutung')}</th></tr>`;
    html += `<tr><td><span class="tag tag-com">● Committed</span></td><td>${cc.committed}</td><td>${ccPt.committed.toFixed(0)}</td><td>${t('Person assigned, estimate solid, low risk', 'Person zugewiesen, Aufwand belastbar, geringes Risiko')}</td></tr>`;
    html += `<tr><td><span class="tag tag-est">◐ Estimated</span></td><td>${cc.estimated}</td><td>${ccPt.estimated.toFixed(0)}</td><td>${t('Estimate exists but no person or higher risk', 'Aufwand geschätzt, aber keine Person oder höheres Risiko')}</td></tr>`;
    html += `<tr><td><span class="tag tag-exp">○ Exploratory</span></td><td>${cc.exploratory}</td><td>${ccPt.exploratory > 0 ? ccPt.exploratory.toFixed(0) : '?'}</td><td>${t('Scope unclear — concept work needed first', 'Scope unklar — erst Konzeption nötig')}</td></tr>`;
    html += `</table>`;
  }

  // ── 4. Roadmap — root items timeline ──
  html += `<h2>${t('Roadmap', 'Roadmap')}</h2>`;
  if (roadmap.length && weeks.length) {
    const minD = weeks[0].mon;
    const maxD = new Date(Math.max(...roadmap.map(r => r._endD?.getTime() || 0), latestEnd?.getTime() || 0));
    const rangeMs = maxD - minD || 1;
    html += `<div style="position:relative;margin-bottom:16px">`;
    // Today marker
    const todayPct = Math.max(0, Math.min(100, (now - minD) / rangeMs * 100));
    html += `<div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:1px;background:#16a34a;z-index:2"></div>`;
    // Date axis
    html += `<div style="display:flex;justify-content:space-between;font-size:8px;color:#7a839a;margin-bottom:6px;font-family:monospace">`;
    html += `<span>${iso(minD)}</span><span>${t('Today', 'Heute')}: ${iso(now)}</span><span>${iso(maxD)}</span></div>`;
    roadmap.forEach(r => {
      const left = Math.max(0, (r._startD - minD) / rangeMs * 100);
      const width = Math.max(2, (r._endD - r._startD) / rangeMs * 100);
      const tc = teams.find(x => x.id === r.team)?.color || '#3b82f6';
      const confTag = r.conf === 'exploratory' ? ' ○' : r.conf === 'estimated' ? ' ◐' : '';
      html += `<div style="position:relative;height:22px;margin-bottom:4px">`;
      html += `<div style="position:absolute;right:${100 - left}%;top:3px;font-size:9px;color:#4a5268;text-align:right;padding-right:6px;white-space:nowrap">${r.type ? GT[r.type] + ' ' : ''}${r.id} ${r.name?.slice(0, 35)}${confTag}</div>`;
      html += `<div class="roadmap-bar" style="position:absolute;left:${left}%;width:${width}%;background:${tc}${r.conf === 'exploratory' ? '66' : r.conf === 'estimated' ? 'aa' : ''}">${r.prog}% · ${r._r?.toFixed(0) || 0}d</div>`;
      html += `</div>`;
    });
    html += `</div>`;
  }

  // ── 5. Goals & Deadlines ──
  const goals = roots.filter(r => r.type);
  if (goals.length) {
    html += `<h2>${t('Goals & Deadlines', 'Ziele & Deadlines')}</h2>`;
    html += `<table><tr><th></th><th>${t('Name', 'Name')}</th><th>${t('Date', 'Datum')}</th><th>${t('Progress', 'Fortschritt')}</th><th>${t('Projected end', 'Voraussichtliches Ende')}</th><th>${t('Status', 'Status')}</th></tr>`;
    goals.forEach(g => {
      const st = stats[g.id];
      const linked = scheduled.filter(s => s.id.startsWith(g.id + '.'));
      const maxEnd = linked.length ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
      const isLate = maxEnd && g.date && new Date(g.date) < maxEnd;
      const childLeaves = lvs.filter(l => l.id.startsWith(g.id + '.'));
      const doneC = childLeaves.filter(l => l.status === 'done').length;
      const progC = childLeaves.length ? Math.round(doneC / childLeaves.length * 100) : 0;
      html += `<tr><td>${GT[g.type] || ''}</td><td><b>${g.name}</b>${g.description ? `<br><span style="color:#7a839a;font-size:9px">${g.description}</span>` : ''}</td>`;
      html += `<td class="mono">${g.date || '—'}</td>`;
      html += `<td>${progC}% (${doneC}/${childLeaves.length})</td>`;
      html += `<td class="mono">${maxEnd ? iso(maxEnd) : '—'}</td>`;
      html += `<td>${isLate ? '<span style="color:#dc2626;font-weight:700">⚠ AT RISK</span>' : maxEnd ? '<span style="color:#16a34a">✓ on track</span>' : '—'}</td></tr>`;
    });
    html += `</table>`;
  }

  // ── 6. Team Capacity ──
  html += `<h2 class="page-break">${t('Team Capacity', 'Teamauslastung')}</h2>`;
  html += `<div class="section-grid">`;
  Object.values(teamCap).filter(tc => tc.members.length || tc.committed > 0 || tc.unassigned > 0).forEach(tc => {
    const total = tc.committed + tc.unassigned;
    html += `<div style="border:1px solid #e0e4ea;border-left:3px solid ${tc.color};border-radius:6px;padding:10px 12px">`;
    html += `<h3 style="color:${tc.color};margin:0 0 6px">${tc.name}</h3>`;
    tc.members.forEach(m => {
      const personPt = lvs.filter(r => r.status !== 'done' && (r.assign || []).includes(m.id)).reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
      html += `<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><span>${m.name}${m.cap < 1 ? ` (${Math.round(m.cap * 100)}%)` : ''}</span><span class="mono">${personPt.toFixed(0)} PT</span></div>`;
    });
    if (total > 0) {
      html += `<div class="conf-bar" style="margin-top:6px"><div style="width:${tc.committed/total*100}%;background:#16a34a"></div><div style="width:${tc.unassigned/total*100}%;background:#d97706"></div></div>`;
      html += `<div style="display:flex;justify-content:space-between;font-size:9px;color:#7a839a"><span style="color:#16a34a">${tc.committed.toFixed(0)} PT ${t('assigned', 'zugewiesen')}</span><span style="color:#d97706">${tc.unassigned.toFixed(0)} PT ${t('open', 'offen')} (${tc.count})</span></div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;

  // ── 7. Critical Path ──
  if (cpItems.length) {
    html += `<h2>${t('Critical Path', 'Kritischer Pfad')}</h2>`;
    html += `<p style="font-size:10px;color:#7a839a;margin-bottom:8px">${t('These items determine the earliest possible project end. Any delay here delays the entire project.', 'Diese Items bestimmen das frühestmögliche Projektende. Jede Verzögerung hier verzögert das gesamte Projekt.')}</p>`;
    html += `<table><tr><th>ID</th><th>${t('Name', 'Name')}</th><th>${t('Team', 'Team')}</th><th>${t('Person', 'Person')}</th><th>${t('Start', 'Start')}</th><th>${t('End', 'Ende')}</th><th>${t('Effort', 'Aufwand')}</th></tr>`;
    cpItems.forEach(s => {
      html += `<tr><td class="mono">${s.id}</td><td>${s.name}</td><td>${teamName(s.team)}</td><td>${s.person}</td><td class="mono">${iso(s.startD)}</td><td class="mono">${iso(s.endD)}</td><td class="mono">${s.effort?.toFixed(1)}d</td></tr>`;
    });
    html += `</table>`;
  }

  // ── 8. Detailed Schedule ──
  html += `<h2 class="page-break">${t('Detailed Schedule', 'Detailplan')}</h2>`;
  const byTeam = {};
  scheduled.forEach(s => { const tk = s.team || '__none'; if (!byTeam[tk]) byTeam[tk] = []; byTeam[tk].push(s); });
  Object.entries(byTeam).forEach(([tk, items]) => {
    const tm = teams.find(x => x.id === tk);
    html += `<h3 style="color:${tm?.color || '#4a5268'}">${tm?.name || t('No team', 'Kein Team')} (${items.length} ${t('items', 'Items')})</h3>`;
    html += `<table><tr><th>ID</th><th>${t('Name', 'Name')}</th><th>${t('Person', 'Person')}</th><th>${t('Start', 'Start')}</th><th>${t('End', 'Ende')}</th><th>${t('Effort', 'Aufwand')}</th><th>Conf.</th><th>${t('Status', 'Status')}</th></tr>`;
    items.sort((a, b) => (a.startD || 0) - (b.startD || 0)).forEach(s => {
      const node = tree.find(r => r.id === s.id);
      const conf = confidence[s.id] || 'committed';
      const confTag = conf === 'exploratory' ? '<span class="tag tag-exp">○</span>' : conf === 'estimated' ? '<span class="tag tag-est">◐</span>' : '<span class="tag tag-com">●</span>';
      const statusTag = s.status === 'done' ? '✓' : s.status === 'wip' ? '◐' : '';
      html += `<tr><td class="mono">${s.id}</td><td>${s.name}${node?.note ? `<br><span style="color:#7a839a;font-size:9px;font-style:italic">${node.note.slice(0, 60)}</span>` : ''}</td><td>${s.person}</td><td class="mono">${iso(s.startD)}</td><td class="mono">${iso(s.endD)}</td><td class="mono">${s.effort?.toFixed(1)}d</td><td>${confTag}</td><td>${statusTag}</td></tr>`;
    });
    html += `</table>`;
  });

  // ── 9. Open Decisions ──
  if (unassigned.length) {
    html += `<h2>${t('Open Decisions', 'Offene Entscheidungen')}</h2>`;
    html += `<p style="font-size:10px;color:#7a839a;margin-bottom:8px">${t('These items are ready to start but have no person assigned.', 'Diese Items sind startbereit, aber noch keiner Person zugewiesen.')}</p>`;
    html += `<table><tr><th>ID</th><th>${t('Name', 'Name')}</th><th>${t('Team', 'Team')}</th><th>${t('Effort', 'Aufwand')}</th><th>Conf.</th></tr>`;
    unassigned.forEach(r => {
      const conf = confidence[r.id] || 'estimated';
      const confTag = conf === 'exploratory' ? '<span class="tag tag-exp">○ Exploratory</span>' : '<span class="tag tag-est">◐ Estimated</span>';
      html += `<tr><td class="mono">${r.id}</td><td>${r.name}</td><td>${teamName(r.team)}</td><td class="mono">${re(r.best || 0, r.factor || 1.5).toFixed(1)}d</td><td>${confTag}</td></tr>`;
    });
    html += `</table>`;
  }

  // ── Footer ──
  html += `<div class="footer">${t('Generated by', 'Erstellt mit')} Planr · ${dateStr} · ${lvs.length} ${t('items', 'Items')} · ${totalPt.toFixed(0)} PT</div>`;
  html += `</body></html>`;
  return html;
}
