export function cpm(tree) {
  const lv = Object.fromEntries(tree.filter(r => r.lvl === 3).map(r => [r.id, r]));
  const eff = r => r.status === 'done' ? 0 : Math.max((r.best || 0) * Math.min(r.factor || 1.5, 1.3) * 1.15, 0.01);
  function resD(id) { return lv[id] ? [id] : Object.keys(lv).filter(k => k.startsWith(id + '.')); }
  const rd = Object.fromEntries(Object.keys(lv).map(id => [id, new Set((lv[id].deps || []).flatMap(resD).filter(d => lv[d]))]));
  const vis = new Set(), order = [];
  const visit = id => { if (vis.has(id)) return; vis.add(id); rd[id].forEach(d => visit(d)); order.push(id); };
  Object.keys(lv).sort().forEach(visit);
  const ef = {};
  order.forEach(id => { const df = rd[id].size ? Math.max(...[...rd[id]].map(d => ef[d] || 0)) : 0; ef[id] = df + eff(lv[id]); });
  const pe = Math.max(0, ...Object.values(ef)); if (!pe) return { critical: new Set() };
  const ls = {};
  [...order].reverse().forEach(id => {
    const succs = Object.keys(lv).filter(s => [...rd[s]].includes(id));
    const lf = succs.length ? Math.min(...succs.map(s => ls[s] || pe)) : pe;
    ls[id] = lf - eff(lv[id]);
  });
  const critical = new Set(Object.keys(lv).filter(id => Math.abs(ls[id] - (ef[id] - eff(lv[id]))) < 0.1));
  return { critical };
}
