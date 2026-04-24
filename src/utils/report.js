// Generates a self-contained HTML project report.
// Opens in a new tab and auto-triggers the print dialog (→ save as PDF).
import { iso } from './date.js';
import { leafNodes, re, resolveToLeafIds } from './scheduler.js';
import { renderRoadmapSvg } from './roadmap.js';
import { deadlineScopedScheduledItems } from './deadlines.js';

function parseHexColor(color) {
  const hex = String(color || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.slice(1).split('');
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }
  return null;
}

function mixWithWhite(color, amount = 0) {
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  const mix = c => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

export function buildReportModel({ tree, members, teams, scheduled, weeks, cpSet, goalPaths, stats, confidence, meta, lang }) {
  const de = lang === 'de';
  const t = (en, deTxt) => de ? deTxt : en;
  const tn = id => teams.find(x => x.id === id)?.name || id || '';
  const mn = id => members.find(x => x.id === id)?.name || id || '';
  const lvs = leafNodes(tree);
  const now = new Date();
  const dateStr = now.toLocaleDateString(de ? 'de-DE' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const GT = { goal: '🎯', painpoint: '⚡', deadline: '⏰' };

  // ── Compute all metrics from SCHEDULED data (real scheduler output) ─────
  const done = lvs.filter(r => r.status === 'done').length;
  const wip = lvs.filter(r => r.status === 'wip').length;
  const open = lvs.filter(r => r.status === 'open').length;
  const totalPt = lvs.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
  const prog = lvs.length ? Math.round(done / lvs.length * 100) : 0;

  // Project end = latest scheduled end across ALL items (the real scheduler output)
  const projectEnd = scheduled.length ? scheduled.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;

  // Per-root: end date from scheduled items (not stats aggregation)
  const roots = tree.filter(r => !r.id.includes('.'));
  const rootData = roots.map(root => {
    const childScheduled = scheduled.filter(s => s.id.startsWith(root.id + '.'));
    const endD = childScheduled.length ? childScheduled.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
    const startD = childScheduled.length ? childScheduled.reduce((m, s) => s.startD < m ? s.startD : m, new Date()) : null;
    const childLeaves = lvs.filter(l => l.id === root.id || l.id.startsWith(root.id + '.'));
    const doneC = childLeaves.filter(l => l.status === 'done').length;
    const progC = childLeaves.length ? Math.round(doneC / childLeaves.length * 100) : 0;
    const pt = childLeaves.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
    return { ...root, startD, endD, leafCount: childLeaves.length, doneCount: doneC, prog: progC, pt, conf: confidence[root.id] || 'committed' };
  });

  // Confidence
  const cc = { committed: 0, estimated: 0, exploratory: 0 };
  const ccPt = { committed: 0, estimated: 0, exploratory: 0 };
  lvs.filter(r => r.status !== 'done').forEach(r => {
    const c = confidence[r.id] || 'committed'; cc[c]++; ccPt[c] += re(r.best || 0, r.factor || 1.5);
  });
  const ccTotal = cc.committed + cc.estimated + cc.exploratory;

  // Team capacity
  const teamCap = {};
  teams.forEach(tm => { teamCap[tm.id] = { name: tm.name, color: tm.color, members: [], committed: 0, unassigned: 0, count: 0 }; });
  members.forEach(m => { if (teamCap[m.team]) teamCap[m.team].members.push(m); });
  lvs.filter(r => r.status !== 'done').forEach(r => {
    if (!teamCap[r.team]) return;
    const pt = re(r.best || 0, r.factor || 1.5);
    if ((r.assign || []).length > 0) teamCap[r.team].committed += pt; else if (r.best > 0) { teamCap[r.team].unassigned += pt; teamCap[r.team].count++; }
  });

  // Critical path
  const cpItems = scheduled.filter(s => cpSet?.has(s.id)).sort((a, b) => (a.startD || 0) - (b.startD || 0));

  // Risks & bottlenecks
  const risks = [];
  // 1. Deadlines at risk
  roots.filter(r => r.type === 'deadline' && r.date).forEach(dl => {
    const deadlineScheduled = deadlineScopedScheduledItems(tree, scheduled, dl.id);
    const deadlineEnd = deadlineScheduled.length ? deadlineScheduled.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
    if (deadlineEnd && new Date(dl.date) < deadlineEnd) {
      const daysLate = Math.round((deadlineEnd - new Date(dl.date)) / 86400000);
      risks.push({ severity: 'critical', text: t(`Deadline "${dl.name}" (${dl.date}) is projected to be ${daysLate} days late (scheduled end: ${iso(deadlineEnd)})`, `Deadline „${dl.name}" (${dl.date}) wird voraussichtlich ${daysLate} Tage verspätet (geplantes Ende: ${iso(deadlineEnd)})`) });
    }
  });
  // 2. Exploratory items on critical path
  const expOnCp = cpItems.filter(s => confidence[s.id] === 'exploratory');
  if (expOnCp.length) risks.push({ severity: 'high', text: t(`${expOnCp.length} exploratory items are on the critical path — unreliable schedule`, `${expOnCp.length} explorative Items liegen auf dem kritischen Pfad — Zeitplan unsicher`) });
  // 3. Unassigned work blocking progress
  const unassignedPt = ccPt.estimated + ccPt.exploratory;
  if (unassignedPt > 100) risks.push({ severity: 'medium', text: t(`${(cc.estimated + cc.exploratory)} items (${unassignedPt.toFixed(0)} PT) have no person assigned`, `${(cc.estimated + cc.exploratory)} Items (${unassignedPt.toFixed(0)} PT) haben keine zugewiesene Person`) });
  // 4. Overloaded team members
  members.forEach(m => {
    const personPt = lvs.filter(r => r.status !== 'done' && (r.assign || []).includes(m.id)).reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
    const capDays = (m.cap || 1) * 220; // ~220 working days/year
    if (personPt > capDays * 0.8) risks.push({ severity: 'medium', text: t(`${m.name} has ${personPt.toFixed(0)} PT committed (${Math.round(personPt/capDays*100)}% of annual capacity)`, `${m.name} hat ${personPt.toFixed(0)} PT zugewiesen (${Math.round(personPt/capDays*100)}% der Jahreskapazität)`) });
  });
  // 5. Offboard-truncated tasks — primary assignee offboards mid-task and no
  //    other team member has capacity to absorb the remainder.
  const truncatedTasks = scheduled.filter(s => s.truncatedByOffboard);
  truncatedTasks.forEach(s => {
    const tr = s.truncatedByOffboard;
    risks.push({
      severity: 'critical',
      text: t(
        `"${s.name}" (${s.id}): ${tr.remainingEffort.toFixed(1)} PT unscheduled — ${tr.personName} offboards ${tr.offboardDate} before the task completes, no replacement in team`,
        `„${s.name}" (${s.id}): ${tr.remainingEffort.toFixed(1)} PT nicht eingeplant — ${tr.personName} verlässt Team am ${tr.offboardDate} vor Fertigstellung, keine Nachbesetzung im Team`,
      ),
    });
  });
  // 6. Offboard-handoff tasks — auto-reassigned remainder to another member.
  const handoffTasks = scheduled.filter(s => s.handoff);
  handoffTasks.forEach(s => {
    const h = s.handoff;
    risks.push({
      severity: 'high',
      text: t(
        `"${s.name}" (${s.id}): ${h.effort.toFixed(1)} PT auto-handed off from ${h.fromPersonName} → ${h.toPersonName} on ${h.date} (offboarding) — verify this is intended`,
        `„${s.name}" (${s.id}): ${h.effort.toFixed(1)} PT automatisch übergeben von ${h.fromPersonName} → ${h.toPersonName} zum ${h.date} (Offboarding) — bitte prüfen`,
      ),
    });
  });

  return {
    de,
    t,
    tn,
    mn,
    lvs,
    now,
    dateStr,
    GT,
    done,
    wip,
    open,
    totalPt,
    prog,
    projectEnd,
    roots,
    rootData,
    cc,
    ccPt,
    ccTotal,
    teamCap,
    cpItems,
    risks,
    tree,
    members,
    teams,
    scheduled,
    weeks,
    cpSet,
    goalPaths,
    stats,
    confidence,
    meta,
  };
}

export function generateReport(ctx) {
  const {
    de,
    t,
    tn,
    lvs,
    dateStr,
    GT,
    done,
    wip,
    open,
    totalPt,
    prog,
    projectEnd,
    roots,
    rootData,
    cc,
    ccPt,
    ccTotal,
    teamCap,
    cpItems,
    risks,
    tree,
    members,
    teams,
    scheduled,
    stats,
    confidence,
    meta,
  } = buildReportModel(ctx);

  // ── BUILD HTML ─────────────────────────────────────────────────────────────
  const css = `@page{margin:18mm 14mm;size:A4 landscape}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:10.5px;color:#1a1e2a;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
h1{font-size:20px;margin-bottom:2px}
h2{font-size:13px;margin:20px 0 6px;padding-bottom:3px;border-bottom:2px solid #2563eb;color:#1d4ed8;page-break-after:avoid}
h3{font-size:11px;margin:10px 0 4px;color:#4a5268}
table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:9.5px}
th{background:#f0f2f5;padding:4px 6px;text-align:left;font-weight:600;border-bottom:2px solid #ccd2dc;white-space:nowrap}
td{padding:3px 6px;border-bottom:1px solid #e0e4ea;vertical-align:top}
tr:nth-child(even) td{background:#fafbfd}
.mono{font-family:'JetBrains Mono','Cascadia Code',monospace;font-size:9px}
.kpi-row{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.kpi{background:#f0f2f5;border-radius:6px;padding:8px 12px;min-width:80px}
.kpi-v{font-size:18px;font-weight:700}.kpi-l{font-size:8px;color:#7a839a;text-transform:uppercase;letter-spacing:.04em;margin-top:1px}
.bar{height:7px;background:#e5e8ee;border-radius:4px;overflow:hidden;margin:3px 0}
.bar>div{height:100%;border-radius:4px}
.conf-bar{display:flex;height:7px;border-radius:4px;overflow:hidden;margin:3px 0}
.tag{display:inline-block;padding:1px 5px;border-radius:3px;font-size:8.5px;font-weight:600;margin-right:2px}
.t-crit{background:#fee2e2;color:#b91c1c}.t-high{background:#fef3c7;color:#a16207}.t-med{background:#f0f2f5;color:#7a839a}
.t-com{background:#dcfce7;color:#15803d}.t-est{background:#fef3c7;color:#a16207}.t-exp{background:#f0f2f5;color:#7a839a}
.risk{padding:6px 10px;border-radius:5px;margin-bottom:4px;font-size:10px}
.risk-crit{background:#fee2e2;border-left:3px solid #dc2626}
.risk-high{background:#fef3c7;border-left:3px solid #d97706}
.risk-med{background:#f0f2f5;border-left:3px solid #7a839a}
.roadmap{margin-bottom:14px;display:grid;grid-template-columns:240px 1fr;column-gap:12px;row-gap:8px;align-items:center}
.rm-axis{position:relative}
.rm-axis-scale{display:flex;justify-content:space-between;font-size:7.5px;color:#7a839a;font-family:monospace}
.rm-track{position:relative;height:18px}
.rm-today{position:absolute;top:-4px;bottom:-4px;width:1px;background:#16a34a;z-index:1;opacity:.7}
.rm-bar{height:18px;border-radius:3px;display:flex;align-items:center;padding:0 5px;font-size:8.5px;font-weight:600;color:#fff;overflow:hidden;position:absolute;top:0;z-index:2}
.rm-label{font-size:9px;color:#4a5268;line-height:1.25;padding-right:6px;white-space:normal;overflow-wrap:anywhere}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pb{page-break-before:always}
.sub{color:#7a839a;font-size:11px;margin-bottom:16px}
.kpi,.bar,.bar>div,.conf-bar,.conf-bar>div,.tag,.risk,th,tr:nth-child(even) td,.rm-today,.rm-bar{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
.ft{margin-top:20px;padding-top:6px;border-top:1px solid #e0e4ea;font-size:8px;color:#7a839a;text-align:center}`;

  let h = `<!DOCTYPE html><html lang="${de?'de':'en'}"><head><meta charset="utf-8"><title>${meta.name||'Project'} — ${t('Report','Bericht')}</title><style>${css}</style></head><body>`;

  // ── 1. TITLE ──
  h += `<h1>${meta.name || 'Project'}</h1>`;
  h += `<div class="sub">${t('Project Report','Projektbericht')} — ${dateStr}${meta.planStart ? ` · ${t('Plan','Plan')}: ${meta.planStart}` : ''}${projectEnd ? ` → ${iso(projectEnd)}` : ''}</div>`;

  // ── 2. KPIs ──
  h += `<h2>${t('Key Figures','Kennzahlen')}</h2><div class="kpi-row">`;
  h += `<div class="kpi"><div class="kpi-v" style="color:#16a34a">${prog}%</div><div class="kpi-l">${t('Progress','Fortschritt')}</div></div>`;
  h += `<div class="kpi"><div class="kpi-v">${lvs.length}</div><div class="kpi-l">${t('Items','Items')}</div></div>`;
  h += `<div class="kpi"><div class="kpi-v" style="color:#16a34a">${done}</div><div class="kpi-l">${t('Done','Erledigt')}</div></div>`;
  h += `<div class="kpi"><div class="kpi-v" style="color:#d97706">${wip+open}</div><div class="kpi-l">${t('Open','Offen')}</div></div>`;
  h += `<div class="kpi"><div class="kpi-v">${totalPt.toFixed(0)}</div><div class="kpi-l">${t('Total PT','Gesamt PT')}</div></div>`;
  h += `<div class="kpi"><div class="kpi-v">${members.length}</div><div class="kpi-l">${t('People','Personen')}</div></div>`;
  if (projectEnd) h += `<div class="kpi"><div class="kpi-v mono">${iso(projectEnd)}</div><div class="kpi-l">${t('Projected End','Voraussichtl. Ende')}</div></div>`;
  if (cpItems.length) h += `<div class="kpi"><div class="kpi-v" style="color:#dc2626">${cpItems.length}</div><div class="kpi-l">${t('Critical Path','Krit. Pfad')}</div></div>`;
  h += `</div><div class="bar"><div style="width:${prog}%;background:#16a34a"></div></div>`;

  // ── 3. RISKS ──
  if (risks.length) {
    h += `<h2>${t('Risks & Alerts','Risiken & Warnungen')}</h2>`;
    risks.forEach(r => h += `<div class="risk risk-${r.severity === 'critical' ? 'crit' : r.severity === 'high' ? 'high' : 'med'}">${r.severity === 'critical' ? '⚠ ' : r.severity === 'high' ? '⚡ ' : 'ℹ '}${r.text}</div>`);
  }

  // ── 4. PLANNING CONFIDENCE ──
  h += `<h2>${t('Planning Confidence','Planungssicherheit')}</h2>`;
  if (ccTotal > 0) {
    h += `<div class="conf-bar"><div style="width:${cc.committed/ccTotal*100}%;background:#16a34a"></div><div style="width:${cc.estimated/ccTotal*100}%;background:#d97706"></div><div style="width:${cc.exploratory/ccTotal*100}%;background:#7a839a"></div></div>`;
    h += `<table><tr><th></th><th>Items</th><th>PT</th><th>${t('Description','Beschreibung')}</th></tr>`;
    h += `<tr><td><span class="tag t-com">● Committed</span></td><td>${cc.committed}</td><td>${ccPt.committed.toFixed(0)}</td><td>${t('Person assigned, solid estimate','Person zugewiesen, belastbare Schätzung')}</td></tr>`;
    h += `<tr><td><span class="tag t-est">◐ Estimated</span></td><td>${cc.estimated}</td><td>${ccPt.estimated.toFixed(0)}</td><td>${t('Estimate exists, no person yet','Aufwand geschätzt, noch keine Person')}</td></tr>`;
    h += `<tr><td><span class="tag t-exp">○ Exploratory</span></td><td>${cc.exploratory}</td><td>${ccPt.exploratory > 0 ? ccPt.exploratory.toFixed(0) : '?'}</td><td>${t('Scope unclear, concept work needed','Scope unklar, Konzeption nötig')}</td></tr>`;
    h += `</table>`;
  }

  // ── 5. ROADMAP ──
  h += `<h2>${t('Roadmap','Roadmap')}</h2>`;
  h += renderRoadmapSvg({ tree, scheduled, stats });

  // ── 6. GOALS & DEADLINES ──
  const goals = roots.filter(r => r.type);
  if (goals.length) {
    h += `<h2>${t('Goals & Deadlines','Ziele & Deadlines')}</h2>`;
    h += `<table><tr><th></th><th>${t('Name','Name')}</th><th>${t('Deadline','Deadline')}</th><th>${t('Progress','Fortschritt')}</th><th>${t('Scheduled End','Geplantes Ende')}</th><th>${t('Risk','Risiko')}</th></tr>`;
    goals.forEach(g => {
      const rd = rootData.find(x => x.id === g.id);
      const isLate = rd?.endD && g.date && new Date(g.date) < rd.endD;
      h += `<tr><td>${GT[g.type]||''}</td><td><b>${g.name}</b>${g.description ? `<br><span style="color:#7a839a;font-size:8.5px">${g.description.slice(0,80)}</span>` : ''}</td>`;
      h += `<td class="mono">${g.date||'—'}</td><td>${rd?.prog||0}% (${rd?.doneCount||0}/${rd?.leafCount||0})</td>`;
      h += `<td class="mono">${rd?.endD ? iso(rd.endD) : '—'}</td>`;
      h += `<td>${isLate ? `<span style="color:#dc2626;font-weight:700">⚠ ${t('AT RISK','GEFÄHRDET')}</span>` : rd?.endD ? `<span style="color:#16a34a">✓ ${t('on track','im Plan')}</span>` : '—'}</td></tr>`;
    });
    h += `</table>`;
  }

  // ── 7. TEAM CAPACITY ──
  h += `<h2 class="pb">${t('Team Capacity','Teamauslastung')}</h2><div class="grid2">`;
  Object.values(teamCap).filter(tc => tc.members.length || tc.committed > 0 || tc.unassigned > 0).forEach(tc => {
    const total = tc.committed + tc.unassigned;
    h += `<div style="border:1px solid #e0e4ea;border-left:3px solid ${tc.color};border-radius:5px;padding:8px 10px">`;
    h += `<h3 style="color:${tc.color};margin:0 0 4px">${tc.name}</h3>`;
    tc.members.forEach(m => {
      const pp = lvs.filter(r => r.status !== 'done' && (r.assign || []).includes(m.id)).reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
      h += `<div style="display:flex;justify-content:space-between;font-size:9.5px;margin-bottom:1px"><span>${m.name}${m.cap < 1 ? ` (${Math.round(m.cap*100)}%)` : ''}</span><span class="mono">${pp.toFixed(0)} PT</span></div>`;
    });
    if (total > 0) {
      h += `<div class="conf-bar" style="margin-top:4px"><div style="width:${tc.committed/total*100}%;background:#16a34a"></div><div style="width:${tc.unassigned/total*100}%;background:#d97706"></div></div>`;
      h += `<div style="display:flex;justify-content:space-between;font-size:8px;color:#7a839a"><span style="color:#16a34a">${tc.committed.toFixed(0)} PT ${t('assigned','zugewiesen')}</span>${tc.unassigned > 0 ? `<span style="color:#d97706">${tc.unassigned.toFixed(0)} PT ${t('open','offen')} (${tc.count})</span>` : ''}</div>`;
    }
    h += `</div>`;
  });
  h += `</div>`;

  // ── 8. CRITICAL PATH ──
  if (cpItems.length) {
    h += `<h2>${t('Critical Path','Kritischer Pfad')}</h2>`;
    h += `<p style="font-size:9px;color:#7a839a;margin-bottom:6px">${t('Any delay to these items delays the project end.','Jede Verzögerung dieser Items verzögert das Projektende.')}</p>`;
    h += `<table><tr><th>ID</th><th>${t('Name','Name')}</th><th>${t('Team','Team')}</th><th>${t('Person','Person')}</th><th>${t('Start','Start')}</th><th>${t('End','Ende')}</th><th>PT</th></tr>`;
    cpItems.forEach(s => h += `<tr><td class="mono">${s.id}</td><td>${s.name}</td><td>${tn(s.team)}</td><td>${s.person}</td><td class="mono">${iso(s.startD)}</td><td class="mono">${iso(s.endD)}</td><td class="mono">${s.effort?.toFixed(1)}</td></tr>`);
    h += `</table>`;
  }

  // ── 9. DETAILED SCHEDULE ──
  h += `<h2 class="pb">${t('Detailed Schedule','Detailplan')}</h2>`;
  const byTeam = {};
  scheduled.forEach(s => { const tk = s.team || '__none'; if (!byTeam[tk]) byTeam[tk] = []; byTeam[tk].push(s); });
  Object.entries(byTeam).forEach(([tk, items]) => {
    const tm = teams.find(x => x.id === tk);
    h += `<h3 style="color:${tm?.color||'#4a5268'}">${tm?.name||t('No team','Kein Team')} (${items.length})</h3>`;
    h += `<table><tr><th>ID</th><th>${t('Name','Name')}</th><th>${t('Person','Person')}</th><th>${t('Start','Start')}</th><th>${t('End','Ende')}</th><th>PT</th><th>Conf.</th><th>${t('Phases','Phasen')}</th></tr>`;
    items.sort((a, b) => (a.startD||0) - (b.startD||0)).forEach(s => {
      const node = tree.find(r => r.id === s.id);
      const conf = confidence[s.id] || 'committed';
      const ct = conf === 'exploratory' ? '<span class="tag t-exp">○</span>' : conf === 'estimated' ? '<span class="tag t-est">◐</span>' : '<span class="tag t-com">●</span>';
      const ph = (node?.phases || []).map(p => `${p.status === 'done' ? '✓' : p.status === 'wip' ? '◐' : '○'} ${p.name}`).join(', ');
      h += `<tr><td class="mono">${s.id}</td><td>${s.name}</td><td>${s.person}</td><td class="mono">${iso(s.startD)}</td><td class="mono">${iso(s.endD)}</td><td class="mono">${s.effort?.toFixed(1)}</td><td>${ct}</td><td style="font-size:8.5px">${ph}</td></tr>`;
    });
    h += `</table>`;
  });

  // ── FOOTER ──
  h += `<div class="ft">${t('Generated by','Erstellt mit')} Planr · ${dateStr} · ${lvs.length} items · ${totalPt.toFixed(0)} PT · ${scheduled.length} ${t('scheduled','eingeplant')}</div>`;
  h += `</body></html>`;
  return h;
}
