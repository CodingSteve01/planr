import { useMemo, useState } from 'react';
import { leafNodes, isLeafNode, re, parentId, resolveToLeafIds, derivePhaseStatus } from '../../utils/scheduler.js';
import { diffDays, iso } from '../../utils/date.js';
import { createPhaseDraft, normalizePhases, phaseAssigneeIds, phaseAssigneeLabel, phaseTeamIds, phaseTeamLabel } from '../../utils/phases.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { useT } from '../../i18n.jsx';

const CL = { committed: '●', estimated: '◐', exploratory: '○' };
const CC = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };
const CN = { committed: 'Committed', estimated: 'Estimated', exploratory: 'Exploratory' };
const REASON_TEXT = {
  'manual': 'Manuell gesetzt',
  'done': 'Erledigt',
  'auto:person+estimate': 'Auto: Person + Schätzung vorhanden',
  'auto:no-person': 'Auto: keine Person zugewiesen',
  'auto:high-risk': 'Auto: Risikofaktor ≥ 2.0',
  'auto:no-estimate': 'Auto: keine Schätzung vorhanden',
  'inherited': 'Abgeleitet vom schlechtesten Kind-Element',
};

export function PlanReview({ tree, scheduled, members, teams, confidence, confReasons = {}, cpSet, stats, rootFilter = '', teamFilter = '', onOpenItem, onUpdate }) {
  const { t } = useT();
  const [section, setSection] = useState('decide');
  const [phaseShowAll, setPhaseShowAll] = useState(false);
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);
  const allLvs = useMemo(() => leafNodes(tree), [tree]);
  const lvs = useMemo(() => {
    let f = allLvs;
    if (rootFilter) f = f.filter(r => r.id === rootFilter || r.id.startsWith(rootFilter + '.'));
    if (teamFilter) f = f.filter(r => (r.team || '') === teamFilter);
    return f;
  }, [allLvs, rootFilter, teamFilter]);
  const doneSet = useMemo(() => new Set(lvs.filter(r => r.status === 'done').map(r => r.id)), [lvs]);
  const teamName = id => teams.find(tm => tm.id === id)?.name || id || '';
  const teamColor = id => teams.find(tm => tm.id === id)?.color || 'var(--b3)';
  const memberName = id => members.find(m => m.id === id)?.name || id;
  const memberShort = id => { const m = members.find(x => x.id === id); if (!m) return '?'; const w = (m.name || '').trim().split(/\s+/); return w.length === 1 ? w[0].slice(0, 2).toUpperCase() : w.map(x => x[0]).join('').toUpperCase(); };

  function isReady(id) {
    const item = iMap[id]; if (!item) return true;
    const parts = id.split('.');
    const ancestors = [];
    for (let i = 1; i < parts.length; i++) ancestors.push(parts.slice(0, i).join('.'));
    const allDeps = [...new Set([...(item.deps || []), ...ancestors.flatMap(a => iMap[a]?.deps || [])])];
    return allDeps.every(d => resolveToLeafIds(tree, d).every(dl => doneSet.has(dl)));
  }

  const confCounts = useMemo(() => {
    const c = { committed: 0, estimated: 0, exploratory: 0, done: 0 };
    lvs.forEach(r => { if (r.status === 'done') { c.done++; return; } c[confidence[r.id] || 'committed']++; });
    return c;
  }, [lvs, confidence]);

  // ── DECIDE items ──
  const decideItems = useMemo(() => lvs
    .filter(r => r.status !== 'done' && (confidence[r.id] === 'estimated' || confidence[r.id] === 'exploratory'))
    .map(r => ({ ...r, sc: sMap[r.id], ready: isReady(r.id), isCp: cpSet?.has(r.id), conf: confidence[r.id] }))
    .sort((a, b) => (a.ready === b.ready ? 0 : a.ready ? -1 : 1) || (a.isCp === b.isCp ? 0 : a.isCp ? -1 : 1) || a.id.localeCompare(b.id))
  , [lvs, confidence, sMap, cpSet, doneSet]);
  const readyItems = decideItems.filter(r => r.ready);
  const blockedItems = decideItems.filter(r => !r.ready);

  // ── PHASE TODOS ──
  const phaseTodos = useMemo(() => lvs
    .filter(r => r.status !== 'done' && r.phases?.length)
    .flatMap(r => {
      const phases = normalizePhases(r.phases);
      const ci = phases.findIndex(p => p.status !== 'done');
      return phases.filter(p => p.status !== 'done').map((p, _, arr) => ({
        task: r, phase: p, phaseIndex: phases.indexOf(p), current: phases.indexOf(p) === ci, ready: isReady(r.id),
        owners: phaseAssigneeIds(p), teams: phaseTeamIds(p),
      }));
    })
    .sort((a, b) => (a.current === b.current ? 0 : a.current ? -1 : 1) || (a.ready === b.ready ? 0 : a.ready ? -1 : 1) || a.task.id.localeCompare(b.task.id))
  , [lvs, doneSet]);

  function advancePhase(node, phaseId) {
    const nextPhases = normalizePhases(node.phases).map(p => p.id === phaseId ? createPhaseDraft({ ...p, status: p.status === 'open' ? 'wip' : p.status === 'wip' ? 'done' : 'open' }) : createPhaseDraft(p));
    const derived = derivePhaseStatus(nextPhases);
    onUpdate?.({ ...node, phases: nextPhases, ...(derived ? { status: derived.status, progress: derived.progress } : {}) });
  }

  // ── CAPACITY ──
  const teamCapacity = useMemo(() => {
    const cap = {};
    teams.forEach(tm => { cap[tm.id] = { name: tm.name, color: tm.color, members: [], committedPt: 0, unassignedPt: 0, unassignedCount: 0 }; });
    members.forEach(m => { if (cap[m.team]) cap[m.team].members.push(m); });
    lvs.filter(r => r.status !== 'done').forEach(r => {
      const tk = r.team; if (!cap[tk]) return;
      const pt = re(r.best || 0, r.factor || 1.5);
      if ((r.assign || []).length > 0) cap[tk].committedPt += pt;
      else if (r.best > 0) { cap[tk].unassignedPt += pt; cap[tk].unassignedCount++; }
    });
    return Object.values(cap).filter(tm => tm.committedPt > 0 || tm.unassignedPt > 0 || tm.members.length > 0);
  }, [teams, members, lvs]);

  // ── Accept auto-assign ──
  const acceptAuto = (node) => {
    const sc = sMap[node.id];
    if (!sc?.autoAssigned || !sc.personId) return;
    const m = members.find(x => x.id === sc.personId);
    if (m) onUpdate?.({ ...node, assign: [sc.personId], team: m.team || node.team });
  };

  const total = confCounts.committed + confCounts.estimated + confCounts.exploratory;

  return <div style={{ width: '100%', maxWidth: '100%' }}>
    {/* Confidence bar */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
      {[['committed', 'var(--gr)'], ['estimated', 'var(--am)'], ['exploratory', 'var(--tx3)']].map(([c, col]) =>
        <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: col }}>{CL[c]}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: col }}>{confCounts[c]}</span>
          <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{c === 'committed' ? t('p.clear') : c === 'estimated' ? t('p.needsPerson') : t('p.unclear')}</span>
        </span>)}
      <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>{confCounts.done} {t('p.finished')}</span>
    </div>
    {total > 0 && <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 20, background: 'var(--bg4)' }}>
      <div style={{ width: `${confCounts.committed / total * 100}%`, background: 'var(--gr)' }} />
      <div style={{ width: `${confCounts.estimated / total * 100}%`, background: 'var(--am)' }} />
      <div style={{ width: `${confCounts.exploratory / total * 100}%`, background: 'var(--tx3)' }} />
    </div>}

    {/* Section tabs */}
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {[
        ['decide', `${t('p.decisions')} (${readyItems.length})`],
        ['phases', `${t('p.phaseTodos')} (${phaseTodos.length})`],
        ['capacity', t('p.teamCapacity')],
        ['blocked', `${t('p.blocked')} (${blockedItems.length})`],
      ].map(([k, l]) =>
        <button key={k} className={`btn btn-xs ${section === k ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSection(k)}>{l}</button>)}
    </div>

    {/* ══════ DECIDE — compact rows ══════ */}
    {section === 'decide' && <>
      {readyItems.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('p.allAssigned')}</div>}
      {(() => {
        const byTeam = {};
        readyItems.forEach(r => { const tk = r.team || '__none'; if (!byTeam[tk]) byTeam[tk] = []; byTeam[tk].push(r); });
        return Object.entries(byTeam).map(([tk, items]) => {
          const team = teams.find(tm => tm.id === tk);
          return <div key={tk} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${team?.color || 'var(--b)'}` }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: team?.color || 'var(--tx2)' }}>{team?.name || t('noTeam')}</span>
              <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{items.length} · {items.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0).toFixed(0)} PT</span>
            </div>
            {items.map(r => {
              const node = iMap[r.id];
              const sc = sMap[r.id];
              const hasAuto = sc?.autoAssigned && sc.personId && !(node?.assign || []).length;
              const autoM = hasAuto ? members.find(x => x.id === sc.personId) : null;
              return <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid var(--b)', cursor: 'pointer', fontSize: 11 }}
                onClick={() => onOpenItem?.(r.id)}>
                <span style={{ fontSize: 10, color: CC[r.conf], flexShrink: 0 }}>{CL[r.conf]}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{r.id}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                {r.isCp && <span style={{ fontSize: 8, color: 'var(--re)', fontWeight: 700, flexShrink: 0 }}>CP</span>}
                <span style={{ fontSize: 8, color: CC[r.conf], flexShrink: 0, border: `1px dashed ${CC[r.conf]}`, borderRadius: 3, padding: '1px 4px' }}>{REASON_TEXT[confReasons[r.id]] || CN[r.conf]}</span>
                {r.best > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', flexShrink: 0 }}>{r.best}T</span>}
                {hasAuto && <button className="btn btn-pri btn-xs" style={{ padding: '2px 6px', fontSize: 9, flexShrink: 0 }}
                  onClick={e => { e.stopPropagation(); acceptAuto(node); }}
                  title={`${autoM.name}: ${iso(sc.startD)} — ${iso(sc.endD)}`}>{memberShort(sc.personId)}</button>}
              </div>;
            })}
          </div>;
        });
      })()}
    </>}

    {/* ══════ PHASES — grouped by task ══════ */}
    {section === 'phases' && <>
      {phaseTodos.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('p.noPhaseTodos')}</div>}
      {phaseTodos.length > 0 && <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <button className={`btn btn-xs ${!phaseShowAll ? 'btn-pri' : 'btn-sec'}`} onClick={() => setPhaseShowAll(false)}>Aktuelle Phasen</button>
        <button className={`btn btn-xs ${phaseShowAll ? 'btn-pri' : 'btn-sec'}`} onClick={() => setPhaseShowAll(true)}>Alle offenen ({phaseTodos.length})</button>
      </div>}
      {(() => {
        // Group by task, preserving phase order within each task
        const filtered = phaseShowAll ? phaseTodos : phaseTodos.filter(e => e.current);
        const byTask = new Map();
        filtered.forEach(entry => {
          if (!byTask.has(entry.task.id)) byTask.set(entry.task.id, { task: entry.task, phases: [] });
          byTask.get(entry.task.id).phases.push(entry);
        });
        return [...byTask.values()].map(({ task, phases }) => {
          const team = teams.find(tm => tm.id === task.team);
          return <div key={task.id} style={{ marginBottom: 10 }}>
            {/* Task header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', cursor: 'pointer', background: 'var(--bg3)', borderRadius: '4px 4px 0 0', borderLeft: `3px solid ${team?.color || 'var(--b)'}` }}
              onClick={() => onOpenItem?.(task.id)}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ac)', fontWeight: 600, flexShrink: 0 }}>{task.id}</span>
              <span style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
              {team && <span style={{ fontSize: 9, color: team.color, flexShrink: 0 }}>{team.name}</span>}
              {task.best > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', flexShrink: 0 }}>{task.best}T</span>}
            </div>
            {/* Phase rows */}
            {phases.map(({ phase, current }) => <div key={phase.id}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px 3px 20px', borderBottom: '1px solid var(--b)', borderLeft: current ? '3px solid var(--ac)' : '3px solid transparent', fontSize: 11 }}>
              <span style={{ cursor: 'pointer', fontSize: 12, color: phase.status === 'wip' ? 'var(--ac)' : 'var(--tx3)', flexShrink: 0 }}
                onClick={() => advancePhase(task, phase.id)}>{phase.status === 'wip' ? '◐' : '○'}</span>
              <span style={{ fontWeight: 500, minWidth: 80 }}>{phase.name}</span>
              <span style={{ fontSize: 9, color: 'var(--tx3)', flex: 1 }}>
                {phaseTeamLabel(phase, teams)}{phaseAssigneeLabel(phase, members) ? ` · ${phaseAssigneeLabel(phase, members)}` : ''}
              </span>
              {phase.effortPct > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', flexShrink: 0 }}>{phase.effortPct}%</span>}
              {current && <span style={{ fontSize: 8, color: 'var(--ac)', flexShrink: 0 }}>aktuell</span>}
            </div>)}
          </div>;
        });
      })()}
    </>}

    {/* ══════ CAPACITY — compact cards ══════ */}
    {section === 'capacity' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
      {teamCapacity.map(tc => {
        const totalPt = tc.committedPt + tc.unassignedPt;
        const commitPct = totalPt > 0 ? tc.committedPt / totalPt * 100 : 0;
        return <div key={tc.name} style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderLeft: `3px solid ${tc.color}`, borderRadius: 'var(--r)', padding: '10px 12px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: tc.color, marginBottom: 6 }}>{tc.name}</div>
          {tc.members.map(m => {
            const pt = lvs.filter(r => r.status !== 'done' && (r.assign || []).includes(m.id)).reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
            return <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, marginBottom: 2 }}>
              <span style={{ flex: 1 }}>{m.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{m.cap < 1 ? `${Math.round(m.cap * 100)}%` : ''}</span>
              <span style={{ fontFamily: 'var(--mono)', color: pt > 0 ? 'var(--gr)' : 'var(--tx3)' }}>{pt.toFixed(0)} PT</span>
            </div>;
          })}
          <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--bg4)', margin: '6px 0 4px' }}>
            <div style={{ width: `${commitPct}%`, background: 'var(--gr)' }} />
            {tc.unassignedPt > 0 && <div style={{ width: `${100 - commitPct}%`, background: 'var(--am)' }} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>
            <span style={{ color: 'var(--gr)' }}>{tc.committedPt.toFixed(0)} PT</span>
            {tc.unassignedPt > 0 && <span style={{ color: 'var(--am)' }}>{tc.unassignedPt.toFixed(0)} PT offen ({tc.unassignedCount})</span>}
          </div>
        </div>;
      })}
    </div>}

    {/* ══════ BLOCKED — compact rows ══════ */}
    {section === 'blocked' && <>
      {blockedItems.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('p.noBlocked')}</div>}
      {blockedItems.map(r => {
        const node = iMap[r.id]; if (!node) return null;
        const team = teams.find(tm => tm.id === r.team);
        // Find what blocks this item
        const parts = r.id.split('.');
        const ancestors = [];
        for (let i = 1; i < parts.length; i++) ancestors.push(parts.slice(0, i).join('.'));
        const allDeps = [...new Set([...(node.deps || []), ...ancestors.flatMap(a => iMap[a]?.deps || [])])];
        const blockers = allDeps.filter(d => !resolveToLeafIds(tree, d).every(dl => doneSet.has(dl))).map(d => iMap[d]?.name || d);
        return <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid var(--b)', cursor: 'pointer', fontSize: 11 }}
          onClick={() => onOpenItem?.(r.id)}
          title={blockers.length ? `Wartet auf: ${blockers.join(', ')}` : ''}>
          <span style={{ fontSize: 10, color: CC[r.conf] }}>{CL[r.conf]}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{r.id}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          {r.isCp && <span style={{ fontSize: 8, color: 'var(--re)', fontWeight: 700, flexShrink: 0 }}>CP</span>}
          <span style={{ fontSize: 8, color: 'var(--am)', flexShrink: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>wartet auf {blockers.length}</span>
          {team && <span style={{ fontSize: 9, color: team.color, flexShrink: 0 }}>{team.name}</span>}
        </div>;
      })}
    </>}
  </div>;
}
