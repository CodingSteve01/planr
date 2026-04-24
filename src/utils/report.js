// Generates a self-contained HTML project report.
// Opens in a new tab and auto-triggers the print dialog (→ save as PDF).
import { iso, isoWeek, isoWeekYear } from './date.js';
import { leafNodes, re, resolveToLeafIds } from './scheduler.js';
import { renderRoadmapSvg, computeRoadmapModel } from './roadmap.js';
import { deadlineScopedScheduledItems } from './deadlines.js';
import { deriveCap } from './capacity.js';

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

export function buildReportModel({ tree, members, teams, scheduled, weeks, cpSet, goalPaths, stats, confidence, meta, lang, data }) {
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

  // Team capacity. Parallel tasks are tracked separately since they run
  // alongside the primary queue and would otherwise double-count load.
  const teamCap = {};
  teams.forEach(tm => { teamCap[tm.id] = { name: tm.name, color: tm.color, members: [], committed: 0, unassigned: 0, parallel: 0, count: 0 }; });
  members.forEach(m => { if (teamCap[m.team]) teamCap[m.team].members.push(m); });
  lvs.filter(r => r.status !== 'done').forEach(r => {
    if (!teamCap[r.team]) return;
    const pt = re(r.best || 0, r.factor || 1.5);
    if (r.parallel) { teamCap[r.team].parallel += pt; return; }
    if ((r.assign || []).length > 0) teamCap[r.team].committed += pt;
    else if (r.best > 0) { teamCap[r.team].unassigned += pt; teamCap[r.team].count++; }
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
  // 4. Overloaded team members. Capacity scales with actual project span
  //    (not a fixed year) and excludes `parallel` tasks since those run
  //    alongside the primary queue rather than consuming it linearly.
  const planStart = meta.planStart ? new Date(meta.planStart) : null;
  const projectSpanDays = planStart && projectEnd && projectEnd > planStart
    ? Math.max(1, Math.round((projectEnd - planStart) / 86400000))
    : 365;
  const projectSpanYears = projectSpanDays / 365;
  members.forEach(m => {
    const primaryPt = lvs
      .filter(r => r.status !== 'done' && !r.parallel && (r.assign || []).includes(m.id))
      .reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
    const parallelPt = lvs
      .filter(r => r.status !== 'done' && r.parallel && (r.assign || []).includes(m.id))
      .reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
    const capDays = deriveCap(m, { plans: data?.meetingPlans || [], teams }) * 220 * projectSpanYears;
    const util = capDays > 0 ? Math.round(primaryPt / capDays * 100) : 0;
    if (util > 100) {
      risks.push({
        severity: 'critical',
        text: t(
          `${m.name} is ${util}% loaded (${primaryPt.toFixed(0)} PT committed vs. ${capDays.toFixed(0)} PT capacity over ${projectSpanDays} days)${parallelPt > 0 ? ` + ${parallelPt.toFixed(0)} PT parallel` : ''} — overbooked, something will slip`,
          `${m.name} zu ${util}% ausgelastet (${primaryPt.toFixed(0)} PT zugewiesen vs. ${capDays.toFixed(0)} PT Kapazität über ${projectSpanDays} Tage)${parallelPt > 0 ? ` + ${parallelPt.toFixed(0)} PT parallel` : ''} — überbucht, etwas wird verrutschen`,
        ),
      });
    } else if (util > 80) {
      risks.push({
        severity: 'medium',
        text: t(
          `${m.name} is ${util}% loaded (${primaryPt.toFixed(0)} PT committed vs. ${capDays.toFixed(0)} PT capacity)${parallelPt > 0 ? ` + ${parallelPt.toFixed(0)} PT parallel` : ''}`,
          `${m.name} zu ${util}% ausgelastet (${primaryPt.toFixed(0)} PT zugewiesen vs. ${capDays.toFixed(0)} PT Kapazität)${parallelPt > 0 ? ` + ${parallelPt.toFixed(0)} PT parallel` : ''}`,
        ),
      });
    }
  });
  // 5. Offboard-truncated tasks — last segment's assignee offboards and no
  //    further team member can absorb the remainder. Critical — work will
  //    silently go undone without intervention.
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
  // 6. Offboard-handoff tasks — task was split into multiple person-segments
  //    to work around offboarding. Surface so user can verify the handoff.
  scheduled.forEach(s => {
    const segs = s.segments || [];
    if (segs.length < 2) return;
    const chain = segs.map(seg => seg.personName).join(' → ');
    const effortChain = segs.slice(1).map(seg => seg.effort.toFixed(1) + ' PT').join(' + ');
    risks.push({
      severity: 'high',
      text: t(
        `"${s.name}" (${s.id}): split across ${segs.length} people due to offboarding (${chain}); handed-off effort: ${effortChain} — verify intent`,
        `„${s.name}" (${s.id}): aufgeteilt auf ${segs.length} Personen wegen Offboarding (${chain}); übergebene Aufwände: ${effortChain} — bitte prüfen`,
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

  // ── 5b. FAHRPLAN ──
  try {
    const rmModel = computeRoadmapModel({ tree, scheduled, stats });
    if (rmModel?.lines?.length) {
      const segsByTree = {};
      scheduled.forEach(s => { const k = s.treeId || s.id; (segsByTree[k] ||= []).push(s); });
      const kwTag = d => `KW${isoWeek(d)}/${String(isoWeekYear(d)).slice(-2)}`;
      h += `<h2>${t('Timetable','Fahrplan')}</h2>`;
      h += `<p style="font-size:9px;color:#7a839a;margin-bottom:6px">${t('Station abbreviations reference the Roadmap above.','Stations-Kürzel verweisen auf die Roadmap oben.')}</p>`;
      h += `<div class="grid2">`;
      rmModel.lines.forEach(line => {
        const allStations = [...line.majorStations, ...line.minorStations].filter(st => st.clusterItems?.length);
        const rows = allStations.map(st => {
          const items = st.clusterItems || [];
          const allSegs = items.flatMap(it => segsByTree[it.id] || []);
          const dated = allSegs.filter(s => s && s.startD && s.endD);
          const startD = dated.length ? new Date(Math.min(...dated.map(s => +s.startD))) : null;
          const endD = dated.length ? new Date(Math.max(...dated.map(s => +s.endD))) : null;
          const calDays = startD && endD ? Math.max(1, Math.round((endD - startD) / 86400000) + 1) : 0;
          const workDays = dated.reduce((s, r) => s + (r.workingDaysInWindow || 0), 0);
          const status = st.allDone ? '✓' : items.some(it => it.status === 'wip') ? '◐' : '○';
          return { abbrev: st.abbrev + (items.length > 1 ? ' ×' + items.length : ''), startD, endD, calDays, workDays, status };
        }).sort((a, b) => (a.startD || 0) - (b.startD || 0));
        h += `<div style="border:1px solid #e0e4ea;border-left:3px solid ${line.color};border-radius:5px;padding:6px 8px;margin-bottom:6px">`;
        h += `<div style="font-weight:700;font-size:11px;color:${line.color};margin-bottom:3px">${line.root.id} · <span style="color:#1a1e2a">${line.root.name}</span></div>`;
        h += `<table style="font-size:9px"><tr><th>Stn</th><th>Start</th><th>Dauer</th><th>St</th></tr>`;
        rows.forEach(r => {
          h += `<tr>`;
          h += `<td class="mono" style="color:${line.color};font-weight:700">${r.abbrev}</td>`;
          h += `<td class="mono">${r.startD ? `${kwTag(r.startD)} ${iso(r.startD).slice(5)}` : '—'}</td>`;
          h += `<td class="mono">${r.calDays ? `${r.calDays}d/${r.workDays.toFixed(0)}PT` : '—'}</td>`;
          h += `<td style="text-align:center">${r.status}</td>`;
          h += `</tr>`;
        });
        h += `</table></div>`;
      });
      h += `</div>`;
    }
  } catch (e) {
    console.warn('[report] timetable generation failed', e);
  }

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
      const node = tree.find(r => r.id === (s.treeId || s.id));
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
