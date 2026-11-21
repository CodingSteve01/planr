import { download, slug } from './fileHelpers.js';
import { svgToPng } from './svgRaster.js';

// ── Gantt SVG ────────────────────────────────────────────────────────────────
export function buildGanttSvg({ scheduled, weeks, teams, meta }) {
  if (!scheduled?.length || !weeks?.length) return null;
  const WPX = 22,
    RH = 24,
    GH = 28,
    HH = 50,
    LW = 280;
  const NO_TEAM = '__no_team__';
  const usedT = [...new Set(scheduled.map(s => s.team || NO_TEAM))];
  const tOrd = [...new Set([...teams.map(t => t.id), ...usedT])].filter(t => usedT.includes(t));
  const grp = {};
  tOrd.forEach(t => {
    grp[t] = scheduled.filter(s => (s.team || NO_TEAM) === t).sort((a, b) => (a.startWi || 0) - (b.startWi || 0));
  });
  const rows = [];
  tOrd.forEach(t => {
    const tasks = grp[t] || [];
    if (!tasks.length) return;
    rows.push({ type: 'team', team: t });
    tasks.forEach(s => rows.push({ type: 'task', s }));
  });
  const tw = weeks.length * WPX;
  const totalH = HH + rows.reduce((sum, r) => sum + (r.type === 'team' ? GH : RH), 0) + 20;
  const totalW = LW + tw + 20;
  const months = [];
  let cm = null,
    cc = 0,
    cs = 0;
  weeks.forEach((w, i) => {
    const ym = `${w.mon.getFullYear()}-${w.mon.getMonth()}`;
    if (ym !== cm) {
      if (cm) months.push({ ym: cm, count: cc, start: cs });
      cm = ym;
      cc = 1;
      cs = i;
    } else cc++;
  });
  if (cm) months.push({ ym: cm, count: cc, start: cs });
  const MDE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const teamColor = tid => (tid === NO_TEAM ? '#64748b' : teams.find(x => x.id === tid)?.color || '#3b82f6');
  const teamName = tid => (tid === NO_TEAM ? 'No team' : teams.find(x => x.id === tid)?.name || tid);
  const xmlns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(xmlns, 'svg');
  svg.setAttribute('xmlns', xmlns);
  svg.setAttribute('width', totalW);
  svg.setAttribute('height', totalH);
  svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  svg.setAttribute('font-family', 'Inter, sans-serif');
  const bg = document.createElementNS(xmlns, 'rect');
  bg.setAttribute('width', totalW);
  bg.setAttribute('height', totalH);
  bg.setAttribute('fill', '#ffffff');
  svg.appendChild(bg);
  const title = document.createElementNS(xmlns, 'text');
  title.setAttribute('x', 10);
  title.setAttribute('y', 18);
  title.setAttribute('font-size', 14);
  title.setAttribute('font-weight', '700');
  title.setAttribute('fill', '#1a1e2a');
  title.textContent = (meta.name || 'Project') + ' — Schedule';
  svg.appendChild(title);
  const sub = document.createElementNS(xmlns, 'text');
  sub.setAttribute('x', 10);
  sub.setAttribute('y', 34);
  sub.setAttribute('font-size', 10);
  sub.setAttribute('fill', '#7a839a');
  sub.textContent = `${weeks.length} weeks · ${scheduled.length} tasks · ${new Date().toLocaleDateString('de-DE')}`;
  svg.appendChild(sub);
  let mx = LW;
  months.forEach(m => {
    const [y, mo] = m.ym.split('-');
    const w = WPX * m.count;
    const r = document.createElementNS(xmlns, 'rect');
    r.setAttribute('x', mx);
    r.setAttribute('y', HH - 24);
    r.setAttribute('width', w);
    r.setAttribute('height', 12);
    r.setAttribute('fill', mo === '0' ? '#dbeafe' : '#f0f2f5');
    r.setAttribute('stroke', '#ccd2dc');
    svg.appendChild(r);
    const t = document.createElementNS(xmlns, 'text');
    t.setAttribute('x', mx + 4);
    t.setAttribute('y', HH - 14);
    t.setAttribute('font-size', 9);
    t.setAttribute('fill', mo === '0' ? '#1d4ed8' : '#4a5268');
    t.setAttribute('font-weight', '600');
    t.textContent = (mo === '0' ? y + ' ' : '') + MDE[+mo];
    svg.appendChild(t);
    mx += w;
  });
  weeks.forEach((w, i) => {
    const x = LW + i * WPX;
    const r = document.createElementNS(xmlns, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', HH - 12);
    r.setAttribute('width', WPX);
    r.setAttribute('height', 12);
    r.setAttribute('fill', w.hasH ? '#fee2e2' : '#ffffff');
    r.setAttribute('stroke', '#e0e4ea');
    svg.appendChild(r);
    if (i > 0 && weeks[i - 1].mon.getFullYear() !== w.mon.getFullYear()) {
      const ln = document.createElementNS(xmlns, 'line');
      ln.setAttribute('x1', x);
      ln.setAttribute('x2', x);
      ln.setAttribute('y1', HH - 24);
      ln.setAttribute('y2', totalH);
      ln.setAttribute('stroke', '#1d4ed8');
      ln.setAttribute('stroke-width', '1.5');
      svg.appendChild(ln);
    }
    const t = document.createElementNS(xmlns, 'text');
    t.setAttribute('x', x + WPX / 2);
    t.setAttribute('y', HH - 3);
    t.setAttribute('font-size', 7);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', w.hasH ? '#dc2626' : '#7a839a');
    t.setAttribute('font-family', 'monospace');
    t.textContent = w.kw;
    svg.appendChild(t);
  });
  const now = new Date();
  const todayWi = weeks.findIndex((w, i) => {
    const next = weeks[i + 1];
    return w.mon <= now && (!next || next.mon > now);
  });
  if (todayWi >= 0) {
    const ln = document.createElementNS(xmlns, 'line');
    ln.setAttribute('x1', LW + todayWi * WPX);
    ln.setAttribute('x2', LW + todayWi * WPX);
    ln.setAttribute('y1', HH);
    ln.setAttribute('y2', totalH);
    ln.setAttribute('stroke', '#16a34a');
    ln.setAttribute('stroke-width', '2');
    ln.setAttribute('opacity', '0.6');
    svg.appendChild(ln);
  }
  let y = HH;
  rows.forEach(row => {
    if (row.type === 'team') {
      const col = teamColor(row.team);
      const r = document.createElementNS(xmlns, 'rect');
      r.setAttribute('x', 0);
      r.setAttribute('y', y);
      r.setAttribute('width', totalW);
      r.setAttribute('height', GH);
      r.setAttribute('fill', '#f0f2f5');
      svg.appendChild(r);
      const cb = document.createElementNS(xmlns, 'rect');
      cb.setAttribute('x', 0);
      cb.setAttribute('y', y);
      cb.setAttribute('width', 4);
      cb.setAttribute('height', GH);
      cb.setAttribute('fill', col);
      svg.appendChild(cb);
      const t = document.createElementNS(xmlns, 'text');
      t.setAttribute('x', 12);
      t.setAttribute('y', y + GH / 2 + 4);
      t.setAttribute('font-size', 11);
      t.setAttribute('font-weight', '700');
      t.setAttribute('fill', col);
      t.textContent = teamName(row.team);
      svg.appendChild(t);
      y += GH;
      return;
    }
    const s = row.s;
    const ln = document.createElementNS(xmlns, 'line');
    ln.setAttribute('x1', 0);
    ln.setAttribute('x2', totalW);
    ln.setAttribute('y1', y + RH);
    ln.setAttribute('y2', y + RH);
    ln.setAttribute('stroke', '#f0f2f5');
    svg.appendChild(ln);
    const lid = document.createElementNS(xmlns, 'text');
    lid.setAttribute('x', 6);
    lid.setAttribute('y', y + RH / 2 + 4);
    lid.setAttribute('font-size', 9);
    lid.setAttribute('fill', '#7a839a');
    lid.setAttribute('font-family', 'monospace');
    lid.textContent = s.id;
    svg.appendChild(lid);
    const lname = document.createElementNS(xmlns, 'text');
    lname.setAttribute('x', 70);
    lname.setAttribute('y', y + RH / 2 + 4);
    lname.setAttribute('font-size', 10);
    lname.setAttribute('fill', '#1a1e2a');
    lname.textContent = s.name.length > 28 ? s.name.slice(0, 28) + '…' : s.name;
    svg.appendChild(lname);
    const lper = document.createElementNS(xmlns, 'text');
    lper.setAttribute('x', LW - 6);
    lper.setAttribute('y', y + RH / 2 + 4);
    lper.setAttribute('font-size', 9);
    lper.setAttribute('fill', '#4a5268');
    lper.setAttribute('text-anchor', 'end');
    lper.setAttribute('font-family', 'monospace');
    lper.textContent = s.person;
    svg.appendChild(lper);
    if (s.status !== 'done' && s.startWi >= 0) {
      const bx = LW + s.startWi * WPX + 1,
        bw = (s.endWi - s.startWi + 1) * WPX - 2,
        tc = teamColor(s.team || NO_TEAM);
      const bar = document.createElementNS(xmlns, 'rect');
      bar.setAttribute('x', bx);
      bar.setAttribute('y', y + 5);
      bar.setAttribute('width', Math.max(bw, 4));
      bar.setAttribute('height', RH - 10);
      bar.setAttribute('fill', tc + '55');
      bar.setAttribute('stroke', tc);
      bar.setAttribute('stroke-width', '1');
      bar.setAttribute('rx', 3);
      svg.appendChild(bar);
      if (bw > 30) {
        const lbl = document.createElementNS(xmlns, 'text');
        lbl.setAttribute('x', bx + 5);
        lbl.setAttribute('y', y + RH / 2 + 3);
        lbl.setAttribute('font-size', 9);
        lbl.setAttribute('fill', '#1a1e2a');
        lbl.setAttribute('font-weight', '600');
        lbl.textContent = s.name.length > Math.floor(bw / 7) ? s.name.slice(0, Math.floor(bw / 7) - 1) + '…' : s.name;
        svg.appendChild(lbl);
      }
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
  try {
    const blob = await svgToPng(r.svg, r.width, r.height, 2);
    download(blob, `${slug(ctx.meta.name)}-gantt.png`);
  } catch (e) {
    alert('PNG export failed: ' + (e.message || e));
  }
}
