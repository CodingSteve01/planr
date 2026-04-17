import { useMemo, useState } from 'react';
import { TBadge } from '../shared/Badges.jsx';
import { leafNodes, re, resolveToLeafIds, treeStats } from '../../utils/scheduler.js';
import { iso, diffDays } from '../../utils/date.js';
import { GT, GL } from '../../constants.js';
import { useT } from '../../i18n.jsx';
import { Roadmap } from '../shared/Roadmap.jsx';

const ORDER = ['goal', 'painpoint', 'deadline'];
const BC = { goal: 'var(--ac)', painpoint: 'var(--am)', deadline: 'var(--re)' };

export function SumView({ tree, scheduled, goals, members, teams, cpSet, goalPaths, stats, confidence = {}, onNavigate, onExportTodo }) {
  const { t } = useT();
  const lvs = leafNodes(tree);
  const done = lvs.filter(r => r.status === 'done').length;
  const wip = lvs.filter(r => r.status === 'wip').length;
  const open = lvs.filter(r => r.status === 'open').length;
  const tR = lvs.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
  const prog = lvs.length > 0 ? (done / lvs.length) * 100 : 0;
  const latE = scheduled.length > 0 ? scheduled.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
  const byT = {}; scheduled.forEach(s => { if (!byT[s.team]) byT[s.team] = { t: 0, pt: 0 }; byT[s.team].t++; byT[s.team].pt += s.effort; });

  // Sprint horizon (next-N-days) — for the "Up next" planning view
  const [horizonDays, setHorizonDays] = useState(() => { try { return +localStorage.getItem('planr_sprint_horizon') || 30; } catch { return 30; } });
  const setHd = v => { setHorizonDays(v); try { localStorage.setItem('planr_sprint_horizon', String(v)); } catch {} };
  const sprintEnd = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + horizonDays); return d; }, [horizonDays]);
  const now = new Date();
  const h1Weeks = useMemo(() => { try { return +localStorage.getItem('planr_h1_weeks') || 8; } catch { return 8; } }, []);
  const h2Weeks = useMemo(() => { try { return +localStorage.getItem('planr_h2_weeks') || 18; } catch { return 18; } }, []);
  const h1Date = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + h1Weeks * 7); return date; }, [h1Weeks]);
  const h2Date = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + h2Weeks * 7); return date; }, [h2Weeks]);
  // Collect: scheduled tasks that are not done and start within the horizon (or are already in progress)
  const upcoming = useMemo(() => scheduled
    .filter(s => s.status !== 'done' && s.startD && s.startD <= sprintEnd)
    .sort((a, b) => (a.startD - b.startD) || (a.prio || 4) - (b.prio || 4))
  , [scheduled, sprintEnd]);
  // Group by person (with NO_PERSON bucket per team)
  const sprintGroups = useMemo(() => {
    const groups = new Map();
    upcoming.forEach(s => {
      const key = s.personId || `team:${s.team || 'none'}`;
      if (!groups.has(key)) {
        const tName = teams.find(t => t.id === s.team)?.name || s.team || 'No team';
        groups.set(key, { key, label: s.personId ? s.person : `${tName} (unassigned)`, isPerson: !!s.personId, color: s.personId ? 'var(--ac)' : 'var(--tx3)', items: [] });
      }
      groups.get(key).items.push(s);
    });
    return [...groups.values()].sort((a, b) => a.isPerson === b.isPerson ? a.label.localeCompare(b.label) : a.isPerson ? -1 : 1);
  }, [upcoming, teams]);
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);

  const grouped = ORDER.map(tp => ({ type: tp, items: goals.filter(g => g.type === tp) })).filter(g => g.items.length);

  return <div style={{ maxWidth: 900 }}>
    {/* Progress header */}
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: 'var(--gr)' }}>{prog.toFixed(0)}%</span>
      <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{t('s.doneOf', done, wip, open, lvs.length)}</span>
      {latE && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx3)', marginLeft: 'auto' }}>{t('s.projected')}: {iso(latE)}</span>}
    </div>
    <div className="prog-wrap" style={{ height: 6, marginBottom: 16 }}><div className="prog-fill" style={{ width: `${prog}%` }} /></div>

    {/* Roadmap bus-line */}
    <Roadmap tree={tree} scheduled={scheduled} goals={goals} stats={stats} />

    {/* Planning confidence */}
    {(() => {
      const cc = { committed: 0, estimated: 0, exploratory: 0 };
      const ccPt = { committed: 0, estimated: 0, exploratory: 0 };
      lvs.filter(r => r.status !== 'done').forEach(r => {
        const c = confidence[r.id] || 'committed';
        cc[c]++;
        ccPt[c] += re(r.best || 0, r.factor || 1.5);
      });
      const total = cc.committed + cc.estimated + cc.exploratory;
      if (!total) return null;
      return <div style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>{t('s.planConfidence')}</span>
          <span style={{ fontSize: 10, color: 'var(--tx3)', cursor: 'pointer' }} onClick={() => onNavigate?.(null, 'plan')}>{t('s.openPlanReview')}</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 10, background: 'var(--bg4)' }}>
          {cc.committed > 0 && <div style={{ width: `${cc.committed / total * 100}%`, background: 'var(--gr)', transition: 'width .3s' }} />}
          {cc.estimated > 0 && <div style={{ width: `${cc.estimated / total * 100}%`, background: 'var(--am)', transition: 'width .3s' }} />}
          {cc.exploratory > 0 && <div style={{ width: `${cc.exploratory / total * 100}%`, background: 'var(--tx3)', transition: 'width .3s' }} />}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
          <span style={{ color: 'var(--gr)' }}>● {cc.committed} {t('conf.committed').toLowerCase()} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>({ccPt.committed.toFixed(0)} PT)</span></span>
          <span style={{ color: 'var(--am)' }}>◐ {cc.estimated} {t('conf.estimated').toLowerCase()} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>({ccPt.estimated.toFixed(0)} PT)</span></span>
          <span style={{ color: 'var(--tx3)' }}>○ {cc.exploratory} {t('conf.exploratory').toLowerCase()} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: .7 }}>({ccPt.exploratory > 0 ? ccPt.exploratory.toFixed(0) + ' PT' : '? PT'})</span></span>
        </div>
      </div>;
    })()}

    {/* Pulse Check — actionable warnings instead of static horizon explainer */}
    {(() => {
      const notDone = scheduled.filter(s => s.status !== 'done');
      const inH1 = notDone.filter(s => s.startD && s.startD <= h1Date);
      const inH2 = notDone.filter(s => s.startD && s.startD > h1Date && s.startD <= h2Date);
      const h1NoAssign = inH1.filter(s => !s.personId);
      const h1NoEstimate = inH1.filter(s => { const n = iMap[s.id]; return !n?.best || n.best === 0; });
      const h2Exploratory = inH2.filter(s => confidence[s.id] === 'exploratory');
      const blockedNoOwner = notDone.filter(s => {
        if (s.personId) return false;
        const n = iMap[s.id];
        const deps = n?.deps || [];
        return deps.some(d => { const dt = tree.find(r => r.id === d); return dt && dt.status !== 'done'; });
      });
      const deadlinesAtRisk = goals.filter(g => {
        if (g.type !== 'deadline' || !g.date) return false;
        const linked = scheduled.filter(s => s.id.startsWith(g.id + '.'));
        const maxEnd = linked.length > 0 ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
        return maxEnd && new Date(g.date) < maxEnd;
      });
      const checks = [
        h1NoAssign.length > 0 && { warn: true, text: `${h1NoAssign.length} Tasks in H1 ohne Person`, items: h1NoAssign },
        h1NoEstimate.length > 0 && { warn: true, text: `${h1NoEstimate.length} Tasks in H1 ohne Schätzung`, items: h1NoEstimate },
        h2Exploratory.length > 0 && { warn: true, text: `${h2Exploratory.length} Tasks in H2 noch explorativ`, items: h2Exploratory },
        blockedNoOwner.length > 0 && { warn: true, text: `${blockedNoOwner.length} blockierte Tasks ohne Person`, items: blockedNoOwner },
        deadlinesAtRisk.length > 0 && { warn: true, text: `${deadlinesAtRisk.length} Deadlines gefährdet`, items: deadlinesAtRisk },
      ].filter(Boolean);
      const allClear = checks.length === 0;

      return <div style={{ background: 'var(--bg2)', border: `1px solid ${allClear ? 'var(--gr)' : 'var(--am)'}`, borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: checks.length ? 10 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: allClear ? 'var(--gr)' : 'var(--am)' }}>Pulse Check</span>
          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--gr)' }}>H1 {iso(h1Date)}</span>
            <span style={{ color: 'var(--am)' }}>H2 {iso(h2Date)}</span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)', cursor: 'pointer' }} onClick={() => onNavigate?.(null, 'plan')}>{t('s.openPlanReview')}</span>
        </div>
        {allClear && <div style={{ fontSize: 12, color: 'var(--gr)' }}>Alles im grünen Bereich — keine offenen Punkte.</div>}
        {checks.map((c, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
          <span style={{ color: 'var(--am)', flexShrink: 0 }}>⚠</span>
          <span style={{ color: 'var(--tx)' }}>{c.text}</span>
          {c.items?.[0]?.id && <span style={{ fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)', cursor: 'pointer' }}
            onClick={() => onNavigate?.(c.items[0].id, 'tree')}>→ {c.items[0].id}</span>}
        </div>)}
      </div>;
    })()}

    {/* Focus */}
    <div className="section-h" style={{ marginTop: 0 }}>{t('s.focus')}</div>
    {grouped.map(g => <div key={g.type}>
      <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)', margin: '10px 0 4px' }}>{GT[g.type]} {t(g.type + 's')}</div>
      {g.items.map(dl => {
        const gp = goalPaths?.[dl.id];
        const st = stats?.[dl.id];
        const linked = scheduled.filter(s => s.id.startsWith(dl.id + '.'));
        const maxEnd = linked.length > 0 ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
        const dlDate = dl.date ? new Date(dl.date) : null;
        const isLate = maxEnd && dlDate && dlDate < maxEnd;
        const daysLeft = dlDate ? diffDays(new Date(), dlDate) : null;
        const gpDone = gp ? gp.needed.filter(id => tree.find(x => x.id === id)?.status === 'done').length : 0;
        const gpProg = gp && gp.needed.length ? Math.round(gpDone / gp.needed.length * 100) : 0;
        const borderC = dl.type === 'painpoint' ? 'var(--am)' : isLate ? 'var(--re)' : BC[dl.type] || 'var(--b)';

        return <div key={dl.id} style={{ background: 'var(--bg2)', border: `1px solid ${isLate && dl.type === 'deadline' ? 'var(--re)' : 'var(--b)'}`, borderLeft: `3px solid ${borderC}`, borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13 }}>{GT[dl.type]}</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{dl.name}</span>
            {dlDate && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{dl.date}</span>}
            {dlDate && daysLeft >= 0 && <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{daysLeft}d left</span>}
            <span style={{ marginLeft: 'auto' }}>
              {dl.type === 'deadline' && isLate ? <span className="badge bc">{t('s.atRisk')}</span> : dl.type === 'deadline' && maxEnd ? <span className="badge bd">{t('s.onTrack')}</span> : null}
              {dl.type !== 'deadline' && linked.length > 0 && <span className="badge bo">{linked.length} {t('s.linked')}</span>}
            </span>
          </div>
          {dl.description && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>{dl.description}</div>}
          {gp && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx3)', marginBottom: 3 }}>
              <span>{t('s.tasksDone', gpDone + '/' + gp.needed.length, gp.critical.size)}</span>
              <span>{gpProg}%</span>
            </div>
            <div className="prog-wrap"><div className="prog-fill" style={{ width: `${gpProg}%`, background: dl.severity === 'critical' ? 'var(--re)' : 'var(--am)' }} /></div>
            {gp.critical.size > 0 && <div style={{ marginTop: 6, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {[...gp.critical].slice(0, 6).map(id => { const r = tree.find(x => x.id === id); return <span key={id} style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--re)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3, cursor: 'pointer' }} onClick={() => onNavigate?.(id, 'tree')} title={r?.name}>{id}</span>; })}
              {gp.critical.size > 6 && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>+{gp.critical.size - 6}</span>}
            </div>}
          </>}
        </div>;
      })}
    </div>)}

    {/* Sprint planning — Up next per person/team */}
    {sprintGroups.length > 0 && <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '24px 0 8px' }}>
        <div className="section-h" style={{ margin: 0 }}>{t('s.upNext')}</div>
        <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{t('s.scheduledWithin')}</span>
        {[14, 30, 60, 90].map(d => <button key={d} className={`btn btn-xs ${horizonDays === d ? 'btn-pri' : 'btn-sec'}`} style={{ padding: '2px 7px', fontSize: 10 }} onClick={() => setHd(d)}>{d}d</button>)}
        {onExportTodo && <button className="btn btn-sec btn-xs" style={{ padding: '2px 7px', fontSize: 10 }} onClick={() => onExportTodo(horizonDays)}>{t('s.exportTodo')}</button>}
        <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{upcoming.length} {t('s.tasks')} · {sprintGroups.length} {sprintGroups.length === 1 ? t('s.lane') : t('s.lanes')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10, marginBottom: 18 }}>
        {sprintGroups.map(g => <div key={g.key} style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--b)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
            <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{g.items.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {g.items.slice(0, 8).map(s => {
              const node = iMap[s.id];
              const isWip = s.status === 'wip';
              const startsSoon = s.startD && diffDays(now, s.startD) <= 7;
              const overdue = node?.decideBy && new Date(node.decideBy) < now;
              const team = teams.find(t => t.id === s.team);
              return <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 4, cursor: 'pointer', background: isWip ? 'var(--bg-done)' : 'transparent', border: '1px solid', borderColor: isWip ? 'var(--gr)' : 'var(--b2)' }}
                onClick={() => onNavigate?.(s.id, 'tree')}
                title={`${s.id} — ${s.name}\n${iso(s.startD)} → ${iso(s.endD)}\n${s.effort?.toFixed(1)}d effort`}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', flexShrink: 0, minWidth: 60 }}>{iso(s.startD)?.slice(5)}</span>
                <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isWip && <span style={{ color: 'var(--am)', marginRight: 3 }}>◐</span>}
                  {s.name}
                </span>
                {team && <span style={{ fontSize: 9, color: team.color, fontWeight: 500, flexShrink: 0 }}>{team.name}</span>}
                {overdue && <span style={{ fontSize: 9, color: 'var(--re)', flexShrink: 0 }} title={`Decide by ${node.decideBy} — overdue`}>⏰!</span>}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{s.effort?.toFixed(0)}d</span>
              </div>;
            })}
            {g.items.length > 8 && <div style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'center', padding: '3px 0' }}>+ {g.items.length - 8} more</div>}
          </div>
        </div>)}
      </div>
    </>}

    {/* Team effort - compact */}
    <div className="section-h">{t('s.resources')}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
      <div className="sum-card" style={{ minWidth: 80 }}><div className="sum-v">{members.length}</div><div className="sum-l">{t('s.people')}</div></div>
      <div className="sum-card" style={{ minWidth: 80 }}><div className="sum-v" style={{ color: 'var(--gr)' }}>{tR.toFixed(0)}</div><div className="sum-l">{t('s.totalPt')}</div></div>
      {Object.entries(byT).sort().map(([tk, d]) => { const team = teams.find(x => x.id === tk);
        return <div key={tk} className="sum-card" style={{ minWidth: 100 }}>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 2 }}>{team?.name || tk}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: team?.color || 'var(--tx)' }}>{d.pt.toFixed(0)} PT</div>
          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{d.t} {t('s.tasks')}</div>
        </div>; })}
    </div>

    {/* Project breakdown */}
    {tree.filter(r => r.lvl === 1).length > 0 && <>
      <div className="section-h">{t('s.topItems')}</div>
      <table className="tree-tbl">
        <thead><tr><th>Item</th><th className="r">{t('s.effort')}</th><th className="r">{t('s.progress')}</th><th>{t('s.projected')}</th></tr></thead>
        <tbody>{tree.filter(r => r.lvl === 1).map(r => { const s = stats[r.id] || r;
          const leaves = lvs.filter(c => c.id === r.id || c.id.startsWith(r.id + '.'));
          const done = leaves.filter(l => l.status === 'done').length;
          const prog = leaves.length > 0 ? Math.round(done / leaves.length * 100) : 0;
          return <tr key={r.id} className="tr l1" style={{ cursor: 'pointer' }} onClick={() => onNavigate?.(r.id, 'tree')}>
            <td><span className="tid">{r.id}</span><span style={{ marginLeft: 8 }}>{r.name}</span></td>
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{s._r > 0 ? s._r.toFixed(0) + 'd' : ''}</td>
            <td className="nc"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 5, background: 'var(--bg4)', borderRadius: 3, minWidth: 40 }}><div style={{ width: `${prog}%`, height: '100%', background: prog === 100 ? 'var(--gr)' : 'var(--ac)', borderRadius: 3 }} /></div>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{done}/{leaves.length}</span>
            </div></td>
            <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: s._endD ? 'var(--tx)' : 'var(--tx3)' }}>
              {s._endD ? s._endD.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </td>
          </tr>; })}</tbody>
      </table>
    </>}
  </div>;
}
