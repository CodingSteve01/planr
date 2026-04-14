import { addD, iso } from './date.js';
import { buildWeeks } from './holidays.js';

export const pt = t => { if (!t) return ''; const m = t.match(/[A-Z][A-Z0-9]*/g); return m ? m[0] : t; };
export const re = (best, factor) => best && best > 0 ? best * Math.min(factor || 1.5, 1.3) * 1.15 : 0;

export function schedule(tree, members, vacations, ps, pe, hm) {
  const wks = buildWeeks(ps, pe, hm);
  if (!wks.length) return { results: [], weeks: [] };
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const lvs = tree.filter(r => r.lvl === 3);
  function resD(id) { const it = iMap[id]; if (!it) return []; if (it.lvl === 3) return [id]; return lvs.filter(l => l.id.startsWith(id + '.')).map(l => l.id); }
  const vis = new Set(), ord = [];
  const sv = [...lvs].sort((a, b) => (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id));
  const visit = id => { if (vis.has(id)) return; vis.add(id); const r = iMap[id]; if (r)(r.deps || []).flatMap(resD).forEach(visit); ord.push(id); };
  sv.forEach(r => visit(r.id));
  const pF = Object.fromEntries(members.map(m => [m.id, 0]));
  const tEW = {};
  lvs.filter(r => r.status === 'done' || !r.best || r.best === 0).forEach(r => { tEW[r.id] = -1; });
  const vs = {}; (vacations || []).forEach(v => { if (!vs[v.person]) vs[v.person] = {}; vs[v.person][v.week] = true; });
  function pC(m, wmon) {
    if (vs[m.id]?.[iso(wmon)]) return 0;
    const st = new Date(m.start || ps); if (st > addD(wmon, 6)) return 0;
    const w = wks.find(x => x.mon.getTime() === wmon.getTime());
    if (!w) return 0;
    return w.wds.filter(d => d >= st).length * (m.cap || 1) * (1 - (m.vac || 25) / 230);
  }
  const res = [];
  ord.forEach(id => {
    if (tEW[id] != null && tEW[id] === -1) return;
    const r = iMap[id];
    if (!r || r.lvl !== 3 || !r.best || r.best === 0) { tEW[id] = -1; return; }
    const eff = re(r.best, r.factor);
    const team = pt(r.team);
    const tM = members.filter(m => pt(m.team) === team);
    const allD = (r.deps || []).flatMap(resD);
    let dE = -1; allD.forEach(d => { const fw = tEW[d]; if (fw != null && fw > dE) dE = fw; });
    const early = dE >= 0 ? dE + 2 : 0;
    const asgn = (r.assign || []).filter(a => members.find(m => m.id === a));
    const cands = asgn.length > 0 ? members.filter(m => asgn.includes(m.id)) : (tM.length > 0 ? tM : members);
    let bp = null, bs = 9999;
    cands.forEach(m => { const ji = wks.findIndex(w => w.mon >= new Date(m.start || ps)); const fw = Math.max(pF[m.id] || 0, early, ji >= 0 ? ji : 0); if (fw < bs) { bs = fw; bp = m; } });
    if (!bp || bs >= wks.length) { tEW[id] = Math.min(early, wks.length - 1); return; }
    let rem = eff, wi = bs;
    while (rem > 0 && wi < wks.length) { rem -= Math.max(pC(bp, wks[wi].mon), 0.01); wi++; }
    const eW = Math.min(wi - 1, wks.length - 1);
    tEW[id] = eW; pF[bp.id] = eW + 1;
    res.push({ id: r.id, name: r.name, team, person: bp.id, prio: r.prio, seq: r.seq,
      best: r.best, effort: eff, startWi: bs, endWi: eW,
      startD: wks[bs].mon, endD: addD(wks[eW].mon, 4),
      deps: (r.deps || []).join(', '), status: r.status, note: r.note || '' });
  });
  return { results: res, weeks: wks };
}

export function treeStats(tree) {
  const m = Object.fromEntries(tree.map(r => [r.id, { ...r }]));
  [...tree].reverse().forEach(r => {
    if (r.lvl === 3) { m[r.id]._b = r.best || 0; m[r.id]._r = re(r.best || 0, r.factor || 1.5); m[r.id]._w = (r.best || 0) * (r.factor || 1.5); }
    else {
      const ch = tree.filter(c => c.id !== r.id && c.id.startsWith(r.id + '.') && c.id.split('.').length === r.id.split('.').length + 1);
      m[r.id]._b = ch.reduce((s, c) => s + (m[c.id]?._b || 0), 0);
      m[r.id]._r = ch.reduce((s, c) => s + (m[c.id]?._r || 0), 0);
      m[r.id]._w = ch.reduce((s, c) => s + (m[c.id]?._w || 0), 0);
    }
  });
  return m;
}

export function nextChildId(tree, parentId) {
  if (!parentId) {
    const nums = tree.filter(r => r.lvl === 1).map(r => parseInt(r.id.replace(/^P/, '')) || 0);
    return `P${(nums.length ? Math.max(...nums) : 0) + 1}`;
  }
  const depth = parentId.split('.').length;
  const siblings = tree.filter(r => r.id.startsWith(parentId + '.') && r.id.split('.').length === depth + 1);
  const nums = siblings.map(r => parseInt(r.id.split('.').pop()) || 0);
  return `${parentId}.${(nums.length ? Math.max(...nums) : 0) + 1}`;
}
