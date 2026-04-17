import { useMemo, useState } from 'react';
import { leafNodes, isLeafNode, re, parentId, resolveToLeafIds, derivePhaseStatus } from '../../utils/scheduler.js';
import { diffDays } from '../../utils/date.js';
import { createPhaseDraft, normalizePhases, phaseAssigneeIds, phaseAssigneeLabel, phaseTeamIds, phaseTeamLabel } from '../../utils/phases.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { useT } from '../../i18n.jsx';

const CL = { committed: '●', estimated: '◐', exploratory: '○' };
const CC = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };

export function PlanReview({ tree, scheduled, members, teams, confidence, cpSet, stats, onOpenItem, onUpdate }) {
  const { t } = useT();
  const [section, setSection] = useState('decide'); // decide | phases | capacity | blocked
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);
  const lvs = useMemo(() => leafNodes(tree), [tree]);
  const doneSet = useMemo(() => new Set(lvs.filter(r => r.status === 'done').map(r => r.id)), [lvs]);
  const teamName = id => teams.find(tm => tm.id === id)?.name || id || '';
  const memberName = id => members.find(m => m.id === id)?.name || id;

  // Build ancestor breadcrumb for an item: "P1 › P1.1 › P1.1.1"
  function breadcrumb(id) {
    const parts = id.split('.');
    const crumbs = [];
    for (let i = 1; i < parts.length; i++) {
      const pid = parts.slice(0, i).join('.');
      const p = iMap[pid];
      if (p) crumbs.push(p.name?.length > 30 ? p.name.slice(0, 28) + '…' : p.name);
    }
    return crumbs;
  }

  // Check if all deps of an item are done (including inherited parent deps)
  function isReady(id) {
    const item = iMap[id]; if (!item) return true;
    const parts = id.split('.');
    const ancestors = [];
    for (let i = 1; i < parts.length; i++) ancestors.push(parts.slice(0, i).join('.'));
    const allDeps = [...new Set([...(item.deps || []), ...ancestors.flatMap(a => iMap[a]?.deps || [])])];
    return allDeps.every(d => {
      const depLeaves = resolveToLeafIds(tree, d);
      return depLeaves.every(dl => doneSet.has(dl));
    });
  }

  // Confidence counts
  const confCounts = useMemo(() => {
    const c = { committed: 0, estimated: 0, exploratory: 0, done: 0 };
    lvs.forEach(r => {
      if (r.status === 'done') { c.done++; return; }
      c[confidence[r.id] || 'committed']++;
    });
    return c;
  }, [lvs, confidence]);

  // ── Section: DECIDE (items needing a person assignment) ────────────────────
  const decideItems = useMemo(() => {
    return lvs
      .filter(r => r.status !== 'done' && (confidence[r.id] === 'estimated' || confidence[r.id] === 'exploratory'))
      .map(r => {
        const sc = sMap[r.id];
        const ready = isReady(r.id);
        const isCp = cpSet?.has(r.id);
        const weeksUntil = sc?.startD ? diffDays(new Date(), sc.startD) / 7 : null;
        return { ...r, sc, ready, isCp, weeksUntil, conf: confidence[r.id] };
      })
      .sort((a, b) => {
        // Ready before blocked
        if (a.ready !== b.ready) return a.ready ? -1 : 1;
        // Critical path first
        if (a.isCp !== b.isCp) return a.isCp ? -1 : 1;
        // Earlier scheduled start first
        if (a.weeksUntil != null && b.weeksUntil != null) return a.weeksUntil - b.weeksUntil;
        if (a.weeksUntil != null) return -1;
        if (b.weeksUntil != null) return 1;
        return a.id.localeCompare(b.id);
      });
  }, [lvs, confidence, sMap, cpSet, doneSet]);

  const readyItems = decideItems.filter(r => r.ready);
  const blockedItems = decideItems.filter(r => !r.ready);

  const phaseTodos = useMemo(() => {
    return lvs
      .filter(r => r.status !== 'done' && Array.isArray(r.phases) && r.phases.length > 0)
      .flatMap(r => {
        const phases = normalizePhases(r.phases);
        const currentIdx = phases.findIndex(phase => phase.status !== 'done');
        return phases.flatMap((phase, index) => {
          if (phase.status === 'done') return [];
          return [{
            task: r,
            phase,
            phaseIndex: index,
            current: index === currentIdx,
            ready: isReady(r.id),
            owners: phaseAssigneeIds(phase),
            teams: phaseTeamIds(phase),
          }];
        });
      })
      .sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        if (a.ready !== b.ready) return a.ready ? -1 : 1;
        return a.task.id.localeCompare(b.task.id) || a.phaseIndex - b.phaseIndex;
      });
  }, [lvs, doneSet]);

  function updatePhase(node, phaseId, patch) {
    const nextPhases = normalizePhases(node.phases).map(phase => phase.id === phaseId ? createPhaseDraft({ ...phase, ...patch }) : createPhaseDraft(phase));
    const derived = derivePhaseStatus(nextPhases);
    onUpdate?.({
      ...node,
      phases: nextPhases,
      ...(derived ? { status: derived.status, progress: derived.progress } : {}),
    });
  }

  // ── Section: CAPACITY (per team) ───────────────────────────────────────────
  const teamCapacity = useMemo(() => {
    const cap = {};
    teams.forEach(tm => { cap[tm.id] = { name: tm.name, color: tm.color, members: [], committedPt: 0, unassignedPt: 0, unassignedCount: 0 }; });
    members.forEach(m => {
      if (cap[m.team]) cap[m.team].members.push(m);
    });
    lvs.filter(r => r.status !== 'done').forEach(r => {
      const tk = r.team;
      if (!cap[tk]) return;
      const pt = re(r.best || 0, r.factor || 1.5);
      if ((r.assign || []).length > 0) cap[tk].committedPt += pt;
      else if (r.best > 0) { cap[tk].unassignedPt += pt; cap[tk].unassignedCount++; }
    });
    return Object.values(cap).filter(tm => tm.committedPt > 0 || tm.unassignedPt > 0 || tm.members.length > 0);
  }, [teams, members, lvs]);

  // ── Item card (shared between sections) ────────────────────────────────────
  function ItemCard({ item, showBlockedBy }) {
    const node = iMap[item.id]; if (!node) return null;
    const team = teams.find(tm => tm.id === item.team);
    const crumbs = breadcrumb(item.id);
    const conf = item.conf || confidence[item.id] || 'committed';
    const isCp = item.isCp ?? cpSet?.has(item.id);
    const hasAssign = (node.assign || []).length > 0;

    // Find what this is blocked by
    let blockedBy = [];
    if (showBlockedBy && !item.ready) {
      const parts = item.id.split('.');
      const ancestors = [];
      for (let i = 1; i < parts.length; i++) ancestors.push(parts.slice(0, i).join('.'));
      const allDeps = [...new Set([...(node.deps || []), ...ancestors.flatMap(a => iMap[a]?.deps || [])])];
      blockedBy = allDeps.filter(d => {
        const depLeaves = resolveToLeafIds(tree, d);
        return !depLeaves.every(dl => doneSet.has(dl));
      }).map(d => ({ id: d, name: iMap[d]?.name || d }));
    }

    return <div style={{
      background: 'var(--bg2)', border: '1px solid var(--b)',
      borderLeft: `3px solid ${isCp ? 'var(--re)' : team?.color || 'var(--b)'}`,
      borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 6,
    }}>
      {/* Breadcrumb */}
      {crumbs.length > 0 && <div style={{ fontSize: 9, color: 'var(--tx3)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {crumbs.map((c, i) => <span key={i}>{i > 0 && ' › '}{c}</span>)}
      </div>}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer' }}
        onClick={() => onOpenItem?.(item.id)}>
        <span style={{ fontSize: 11, color: CC[conf] }}>{CL[conf]}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600 }}>{item.id}</span>
        <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        {isCp && <span style={{ fontSize: 8, color: 'var(--re)', fontWeight: 700, border: '1px solid var(--re)', borderRadius: 3, padding: '0 4px' }}>CP</span>}
        {item.best > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{item.best}T</span>}
        {team && <span style={{ fontSize: 9, color: team.color, fontWeight: 500 }}>{team.name}</span>}
      </div>
      {/* Blocked-by info */}
      {blockedBy.length > 0 && <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>
        {t('p.waitingFor')}: {blockedBy.map((b, i) => <span key={b.id}>
          {i > 0 && ', '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--am)', cursor: 'pointer' }} onClick={() => onOpenItem?.(b.id)}>{b.id}</span>
          {' '}{b.name?.slice(0, 30)}
        </span>)}
      </div>}
      {/* Assign action */}
      {!hasAssign && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <SearchSelect
          options={members.filter(m => {
            // Prefer members from the same team, but show all
            return !(node.assign || []).includes(m.id);
          }).sort((a, b) => {
            // Same team first
            const aMatch = a.team === node.team ? 0 : 1;
            const bMatch = b.team === node.team ? 0 : 1;
            return aMatch - bMatch || a.name.localeCompare(b.name);
          }).map(m => ({
            id: m.id,
            label: `${m.name} — ${teamName(m.team)}${m.cap < 1 ? ` (${Math.round(m.cap * 100)}%)` : ''}`,
          }))}
          onSelect={id => {
            const m = members.find(x => x.id === id);
            onUpdate?.({ ...node, assign: [...new Set([...(node.assign || []), id])], team: m?.team || node.team });
          }}
          placeholder={t('p.assignPerson')}
        />
      </div>}
    </div>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const total = confCounts.committed + confCounts.estimated + confCounts.exploratory;

  return <div style={{ maxWidth: 920 }}>
    {/* Confidence summary bar */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {[['committed', 'var(--gr)'], ['estimated', 'var(--am)'], ['exploratory', 'var(--tx3)']].map(([c, col]) =>
          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: col }}>{CL[c]}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: col }}>{confCounts[c]}</span>
            <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{c === 'committed' ? t('p.clear') : c === 'estimated' ? t('p.needsPerson') : t('p.unclear')}</span>
          </span>)}
      </div>
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

    {/* ── DECIDE section ────────────────────────────────────────────────── */}
    {section === 'decide' && <>
      {readyItems.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>{t('p.allAssigned')}</div>
        <div style={{ fontSize: 12 }}>{t('p.allAssignedDesc')}</div>
      </div>}
      {readyItems.length > 0 && <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>
        {t('p.readyItems', readyItems.length)}
      </p>}
      {/* Group by team for clarity */}
      {(() => {
        const byTeam = {};
        readyItems.forEach(r => {
          const tk = r.team || '__none';
          if (!byTeam[tk]) byTeam[tk] = [];
          byTeam[tk].push(r);
        });
        return Object.entries(byTeam).map(([tk, items]) => {
          const team = teams.find(tm => tm.id === tk);
          const teamMembers = members.filter(m => m.team === tk);
          return <div key={tk} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${team?.color || 'var(--b)'}` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: team?.color || 'var(--tx2)' }}>{team?.name || t('noTeam')}</span>
              <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{items.length} {t('p.items')} · {items.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0).toFixed(0)} {t('pt')}</span>
              {teamMembers.length > 0 && <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto' }}>
                Team: {teamMembers.map(m => `${m.name.split(' ')[0]}${m.cap < 1 ? ` (${Math.round(m.cap * 100)}%)` : ''}`).join(', ')}
              </span>}
            </div>
            {items.map(r => <ItemCard key={r.id} item={r} />)}
          </div>;
        });
      })()}
    </>}

    {/* ── PHASES section ───────────────────────────────────────────────── */}
    {section === 'phases' && <>
      {phaseTodos.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
        <div style={{ fontSize: 12 }}>{t('p.noPhaseTodos')}</div>
      </div>}
      {phaseTodos.length > 0 && <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>
        {t('p.phaseTodosDesc', phaseTodos.length)}
      </p>}
      {(() => {
        const groups = new Map();
        phaseTodos.forEach(entry => {
          const ownerIds = entry.owners.length ? entry.owners : entry.teams.length ? entry.teams.map(teamId => `team:${teamId}`) : ['unassigned'];
          ownerIds.forEach(ownerId => {
            if (!groups.has(ownerId)) {
              const isTeam = ownerId.startsWith('team:');
              const teamId = isTeam ? ownerId.slice(5) : null;
              groups.set(ownerId, {
                key: ownerId,
                label: ownerId === 'unassigned'
                  ? t('unassigned')
                  : isTeam
                    ? `${teamName(teamId)} ${t('qe.team').toLowerCase()}`
                    : memberName(ownerId),
                items: [],
                color: isTeam ? (teams.find(team => team.id === teamId)?.color || 'var(--b3)') : 'var(--ac)',
              });
            }
            groups.get(ownerId).items.push(entry);
          });
        });
        return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map(group => <div key={group.key} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${group.color}` }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{group.label}</span>
            <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{group.items.length} {t('p.items')}</span>
          </div>
          {group.items.map(({ task, phase, current, ready }) => <div key={`${task.id}_${phase.id}`} style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderLeft: `3px solid ${current ? 'var(--ac)' : ready ? 'var(--gr)' : 'var(--am)'}`, borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: phase.status === 'wip' ? 'var(--ac)' : 'var(--tx3)' }}>{phase.status === 'wip' ? '◐' : '○'}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600 }}>{task.id}</span>
              <span style={{ fontSize: 12, fontWeight: 500, flex: 1, cursor: 'pointer' }} onClick={() => onOpenItem?.(task.id)}>{phase.name} · {task.name}</span>
              {current && <span className="badge bo">{t('ph.currentPhase')}</span>}
              {phase.effortPct && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{phase.effortPct}%</span>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 8 }}>
              {phaseTeamLabel(phase, teams) && <span>{phaseTeamLabel(phase, teams)}</span>}
              {phaseTeamLabel(phase, teams) && phaseAssigneeLabel(phase, members) && <span> · </span>}
              {phaseAssigneeLabel(phase, members) && <span>{phaseAssigneeLabel(phase, members)}</span>}
              {!ready && <span> · {t('p.waitingFor')}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-sec btn-xs" onClick={() => updatePhase(task, phase.id, { status: phase.status === 'open' ? 'wip' : phase.status === 'wip' ? 'done' : 'open' })}>{t('p.advancePhase')}</button>
              <div style={{ minWidth: 200, flex: 1 }}>
                <SearchSelect
                  options={members.filter(member => !phaseAssigneeIds(phase).includes(member.id)).map(member => ({ id: member.id, label: `${member.name} — ${teamName(member.team)}` }))}
                  onSelect={memberId => {
                    const member = members.find(entry => entry.id === memberId);
                    updatePhase(task, phase.id, {
                      assign: [...new Set([...phaseAssigneeIds(phase), memberId])],
                      teams: [...new Set([...phaseTeamIds(phase), ...(member?.team ? [member.team] : [])])],
                    });
                  }}
                  allowEmpty
                  placeholder={t('p.assignPhasePerson')}
                />
              </div>
            </div>
          </div>)}
        </div>);
      })()}
    </>}

    {/* ── CAPACITY section ──────────────────────────────────────────────── */}
    {section === 'capacity' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {teamCapacity.map(tc => {
        const totalPt = tc.committedPt + tc.unassignedPt;
        const commitPct = totalPt > 0 ? tc.committedPt / totalPt * 100 : 0;
        return <div key={tc.name} style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderLeft: `3px solid ${tc.color}`, borderRadius: 'var(--r)', padding: '12px 14px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: tc.color, marginBottom: 8 }}>{tc.name}</div>
          {/* Members */}
          <div style={{ marginBottom: 8 }}>
            {tc.members.map(m => {
              // Calculate committed PT for this specific person
              const personPt = lvs.filter(r => r.status !== 'done' && (r.assign || []).includes(m.id))
                .reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
              return <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3 }}>
                <span style={{ flex: 1 }}>{m.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{m.cap < 1 ? `${Math.round(m.cap * 100)}%` : '100%'}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: personPt > 0 ? 'var(--gr)' : 'var(--tx3)' }}>{personPt.toFixed(0)} {t('pt')}</span>
              </div>;
            })}
          </div>
          {/* Bar */}
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg4)', marginBottom: 6 }}>
            <div style={{ width: `${commitPct}%`, background: 'var(--gr)' }} />
            <div style={{ width: `${100 - commitPct}%`, background: tc.unassignedPt > 0 ? 'var(--am)' : 'transparent' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>
            <span style={{ color: 'var(--gr)' }}>{tc.committedPt.toFixed(0)} {t('pt')} {t('p.assigned')}</span>
            {tc.unassignedPt > 0 && <span style={{ color: 'var(--am)' }}>{tc.unassignedPt.toFixed(0)} {t('pt')} {t('p.open')} ({tc.unassignedCount})</span>}
          </div>
        </div>;
      })}
    </div>}

    {/* ── BLOCKED section ───────────────────────────────────────────────── */}
    {section === 'blocked' && <>
      {blockedItems.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
        <div style={{ fontSize: 12 }}>{t('p.noBlocked')}</div>
      </div>}
      {blockedItems.length > 0 && <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>
        {t('p.blockedDesc')}
      </p>}
      {blockedItems.map(r => <ItemCard key={r.id} item={r} showBlockedBy />)}
    </>}
  </div>;
}
