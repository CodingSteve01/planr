import { useMemo, useState, memo } from 'react';
import { CONF_COLOR } from '../../constants.js';
import { isOnboard } from '../../utils/capacity.js';
import { memberShades } from '../../utils/teamShades.js';
import { memberTeams, teamForAssignment } from '../../utils/memberTeams.js';
import { PersonChip } from '../shared/PersonChip.jsx';
import { Icon } from '../shared/Icon.jsx';
import { leafProgress, leafNodes, isLeafNode, re, parentId, resolveToLeafIds, derivePhaseStatus, isDepsReady } from '../../utils/scheduler.js';
import { diffDays, iso } from '../../utils/date.js';
import { createPhaseDraft, normalizePhases, phaseAssigneeIds, phaseAssigneeLabel, phaseTeamIds, phaseTeamLabel } from '../../utils/phases.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { CriticalPathBadge } from '../shared/CriticalPathBadge.jsx';
import { ResourceLoadMatrix } from '../shared/ResourceLoadMatrix.jsx';
import { hasChain, chainShorts, chainTooltip } from '../../utils/handoff.js';
import { buildMemberShortMap } from '../../App.jsx';
import { useT } from '../../i18n.jsx';
import { planInconsistencies } from '../../utils/planIntegrity.js';

const CL = { committed: '●', estimated: '◐', exploratory: '○' };
const CC = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };
const CN = { committed: 'Committed', estimated: 'Estimated', exploratory: 'Exploratory' };

function PlanReviewImpl({ tree, scheduled, members, teams, weeks = [], vacations = [], meetingPlans = [], confidence, confReasons = {}, cpSet, cpLabels = {}, cpPaths = {}, stats, rootFilter = '', teamFilter = '', personFilter = '', hideDone = false, planTree = null, horizonIds = null, diffChangedIds = null, diffVisibleIds = null, onOpenItem, onUpdate }) {
  const { t } = useT();
  const reasonText = r => ({
    'manual': t('pr.reasonManual'),
    'done': t('pr.reasonDone'),
    'auto:person+estimate': t('pr.reasonPersonEstimate'),
    'auto:no-person': t('pr.reasonNoPerson'),
    'auto:high-risk': t('pr.reasonHighRisk'),
    'auto:no-estimate': t('pr.reasonNoEstimate'),
    'inherited': t('pr.reasonInherited'),
  }[r] || r);
  const [section, setSection] = useState('decide');
  const [phaseShowAll, setPhaseShowAll] = useState(false);
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  // Checked against the WHOLE plan, never the filtered tree this view gets:
  // hide-done, the archive and the root filter are exactly what hide these
  // entries, so a check over what is on screen would find nothing.
  const fullTree = planTree || tree;
  const fullMap = useMemo(() => Object.fromEntries(fullTree.map(r => [r.id, r])), [fullTree]);
  const conflicts = useMemo(() => planInconsistencies(fullTree), [fullTree]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);
  const allLvs = useMemo(() => leafNodes(tree), [tree]);
  const lvs = useMemo(() => {
    let f = allLvs;
    if (rootFilter) f = f.filter(r => r.id === rootFilter || r.id.startsWith(rootFilter + '.'));
    if (teamFilter) f = f.filter(r => (r.team || '') === teamFilter);
    if (personFilter) f = f.filter(r => (r.assign || []).includes(personFilter));
    if (hideDone) f = f.filter(r => r.status !== 'done' || diffVisibleIds?.has(r.id));
    if (horizonIds) f = f.filter(r => horizonIds.has(r.id));
    if (diffChangedIds) f = f.filter(r => diffChangedIds.has(r.id));
    return f;
  }, [allLvs, rootFilter, teamFilter, personFilter, hideDone, horizonIds, diffChangedIds, diffVisibleIds]);
  const doneSet = useMemo(() => new Set(lvs.filter(r => r.status === 'done').map(r => r.id)), [lvs]);
  const teamName = id => teams.find(tm => tm.id === id)?.name || id || '';
  const teamColor = id => teams.find(tm => tm.id === id)?.color || 'var(--b3)';
  const memberName = id => members.find(m => m.id === id)?.name || id;
  const memberShort = id => { const m = members.find(x => x.id === id); if (!m) return '?'; const w = (m.name || '').trim().split(/\s+/); return w.length === 1 ? w[0].slice(0, 2).toUpperCase() : w.map(x => x[0]).join('').toUpperCase(); };
  const memberFullName = id => members.find(x => x.id === id)?.name || id || '?';
  const shortMap = useMemo(() => buildMemberShortMap(members), [members]);
  const matchesFilter = node => {
    if (!node) return false;
    if (rootFilter && !(node.id === rootFilter || node.id.startsWith(rootFilter + '.'))) return false;
    if (teamFilter && (node.team || '') !== teamFilter) return false;
    if (personFilter && !(node.assign || []).includes(personFilter)) return false;
    if (hideDone && node.status === 'done' && !diffVisibleIds?.has(node.id)) return false;
    if (horizonIds && !horizonIds.has(node.id)) return false;
    if (diffChangedIds && !diffChangedIds.has(node.id)) return false;
    return true;
  };

  function isReady(id) {
    return isDepsReady(tree, doneSet, iMap[id]);
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
    teams.forEach(tm => { cap[tm.id] = { id: tm.id, name: tm.name, color: tm.color, members: [], committedPt: 0, unassignedPt: 0, unassignedCount: 0 }; });
    // People who have left are not capacity, and a team of nothing but leavers
    // is not a team any more. Both were listed here at 0 PT beside the teams
    // actually doing the work.
    // A member in several teams appears on each team's card, with the load
    // that falls in that team (see memberShares below).
    members.filter(m => isOnboard(m)).forEach(m => memberTeams(m).forEach(tid => { if (cap[tid]) cap[tid].members.push(m); }));
    // "Has someone on it" means the SCHEDULE placed a person, not that a name
    // was typed in: most work in a long plan is auto-assigned, so the explicit
    // test reported a team as almost entirely unstaffed while its people were
    // carrying hundreds of PT two rows above.
    const staffedIds = new Set();
    (scheduled || []).forEach(sc => { if (sc.personId) staffedIds.add(sc.treeId || sc.id); });
    lvs.filter(r => r.status !== 'done').forEach(r => {
      const tk = r.team; if (!cap[tk]) return;
      const pt = re(r.best || 0, r.factor || 1.5);
      if ((r.assign || []).length > 0 || staffedIds.has(r.id)) cap[tk].committedPt += pt;
      else if (r.best > 0) { cap[tk].unassignedPt += pt; cap[tk].unassignedCount++; }
    });
    return Object.values(cap).filter(tm => tm.committedPt > 0 || tm.unassignedPt > 0 || tm.members.length > 0);
  }, [teams, members, lvs, scheduled]);

  // ── Accept auto-assign ──
  const acceptAuto = (node) => {
    const sc = sMap[node.id];
    if (!sc?.autoAssigned || !sc.personId) return;
    const m = members.find(x => x.id === sc.personId);
    if (m) onUpdate?.({ ...node, assign: [sc.personId], team: teamForAssignment(m, node.team) });
  };

  const total = confCounts.committed + confCounts.estimated + confCounts.exploratory;
  const criticalScopes = useMemo(() => {
    const entries = Object.entries(cpPaths || {}).map(([scopeId, scope], idx) => {
      const chains = (scope?.chains || []).filter(chain => chain.length);
      if (!chains.length) return null;
      const nodes = [...new Set(chains.flat())];
      const hasMatchingNode = !teamFilter && !personFilter
        ? true
        : nodes.some(id => matchesFilter(iMap[id]));
      if (rootFilter && scopeId !== rootFilter) return null;
      if (!hasMatchingNode) return null;
      return {
        scopeId,
        scope,
        chains,
        cpNoBase: idx,
        nodes,
      };
    }).filter(Boolean);
    return entries;
  }, [cpPaths, iMap, rootFilter, teamFilter, personFilter]);

  return <div style={{ maxWidth: 960, margin: '0 auto' }}>
    {/* Confidence bar */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
      {['committed', 'estimated', 'exploratory'].map(c => CONF_COLOR[c] && [c, CONF_COLOR[c]]).map(([c, col]) =>
        <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: col }}>{CL[c]}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: col }}>{confCounts[c]}</span>
          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{c === 'committed' ? t('p.clear') : c === 'estimated' ? t('p.needsPerson') : t('p.unclear')}</span>
        </span>)}
      <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>{confCounts.done} {t('p.finished')}</span>
    </div>
    {total > 0 && <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 20, background: 'var(--bg4)' }}>
      <div style={{ width: `${confCounts.committed / total * 100}%`, background: CONF_COLOR.committed }} />
      <div style={{ width: `${confCounts.estimated / total * 100}%`, background: CONF_COLOR.estimated }} />
      <div style={{ width: `${confCounts.exploratory / total * 100}%`, background: CONF_COLOR.exploratory }} />
    </div>}

    {/* Section tabs. They WRAP rather than pushing the pane wide: seven of
        them do not fit a normal pane, and a row that overflows does not
        overflow alone — it gives the whole view a horizontal scrollbar, so
        the header and the figures above slide out of frame with it. A second
        line of buttons costs 26px; a pane that scrolls sideways costs the
        reader their place. */}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16, minWidth: 0 }}>
      {(() => {
        const dueViolations = scheduled.filter(s => s.dueOverdue || (s.due && new Date(s.due) < new Date() && s.status !== 'done'));
        const truncated = scheduled.filter(s => s.truncatedByOffboard);
        const warnCount = dueViolations.length + truncated.length + conflicts.length;
        return [
          ['decide', `${t('p.decisions')} (${readyItems.length})`],
          ['phases', `${t('p.phaseTodos')} (${phaseTodos.length})`],
          ['capacity', t('p.teamCapacity')],
          ['load', t('p.load') || 'Load'],
          ['blocked', `${t('p.blocked')} (${blockedItems.length})`],
          ['warnings', `${t('pr.warnings')}${warnCount > 0 ? ' (' + warnCount + ')' : ''}`],
          ['critical', `${t('pr.criticalPaths')} (${criticalScopes.reduce((sum, scope) => sum + scope.chains.length, 0)})`],
        ];
      })().map(([k, l]) =>
        <button key={k} className={`btn btn-xs ${section === k ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setSection(k)}>{l}</button>)}
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
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{items.length} · {items.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0).toFixed(0)} PT</span>
            </div>
            {items.map(r => {
              const node = iMap[r.id];
              const sc = sMap[r.id];
              const hasAuto = sc?.autoAssigned && sc.personId && !(node?.assign || []).length;
              const autoM = hasAuto ? members.find(x => x.id === sc.personId) : null;
              return <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid var(--b)', cursor: 'pointer', fontSize: 12 }}
                onClick={() => onOpenItem?.(r.id)}>
                <span style={{ fontSize: 11, color: CC[r.conf], flexShrink: 0 }}>{CL[r.conf]}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{r.id}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                {r.isCp && <CriticalPathBadge id={r.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
                {/* Only the reasons that EXPLAIN something. "Manually set" is
                    true of nearly every row on a real plan, so as a badge it
                    was twenty identical marks down a column, saying nothing
                    and crowding out the two that do — "no person assigned",
                    "no estimate". A badge on every row is not a badge. The
                    full reason stays in the row's tooltip either way. */}
                {!['manual', 'done', 'inherited'].includes(confReasons[r.id]) && (
                  <span style={{ fontSize: 10, color: CC[r.conf], flexShrink: 0, border: `1px dashed ${CC[r.conf]}`, borderRadius: 3, padding: '1px 4px' }}>{reasonText(confReasons[r.id]) || CN[r.conf]}</span>
                )}
                {r.best > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{r.best}T</span>}
                {hasChain(sc) && (() => {
                  const primary = (node?.assign || []).map(memberShort).join('/') || memberShort(sc.personId);
                  return <PersonChip chain short={chainShorts(sc, shortMap, primary)}
                    title={chainTooltip(sc, memberFullName)} style={{ flexShrink: 0 }} />;
                })()}
                {/* The schedule's suggestion was a `btn btn-pri` — the loudest
                    control in the app, on every row, for a person's initials.
                    It is the same quiet chip as everywhere else now, with a
                    small accept beside it: the initials identify, the button
                    acts, and only the button looks like one. */}
                {hasAuto && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <PersonChip auto short={memberShort(sc.personId)}
                    title={`${autoM.name}: ${iso(sc.startD)} — ${iso(sc.endD)}`} />
                  <button type="button" className="btn btn-sec btn-xs"
                    style={{ padding: '1px 5px', display: 'inline-flex', alignItems: 'center' }}
                    onClick={e => { e.stopPropagation(); acceptAuto(node); }}
                    aria-label={t('aa.accept')} data-htip={t('aa.accept')}>
                    <Icon name="check" size={11} />
                  </button>
                </span>}
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
        <button className={`btn btn-xs ${!phaseShowAll ? 'btn-pri' : 'btn-sec'}`} onClick={() => setPhaseShowAll(false)}>{t('pr.currentPhases')}</button>
        <button className={`btn btn-xs ${phaseShowAll ? 'btn-pri' : 'btn-sec'}`} onClick={() => setPhaseShowAll(true)}>{t('pr.allOpen', phaseTodos.length)}</button>
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
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0 }}>{task.id}</span>
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
              {team && <span style={{ fontSize: 10, color: team.color, flexShrink: 0 }}>{team.name}</span>}
              {task.best > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{task.best}T</span>}
            </div>
            {/* Phase rows */}
            {phases.map(({ phase, current }) => <div key={phase.id}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px 3px 20px', borderBottom: '1px solid var(--b)', borderLeft: current ? '3px solid var(--ac)' : '3px solid transparent', fontSize: 12 }}>
              <span style={{ cursor: 'pointer', fontSize: 12, color: phase.status === 'wip' ? 'var(--ac)' : 'var(--tx3)', flexShrink: 0 }}
                onClick={() => advancePhase(task, phase.id)}>{phase.status === 'wip' ? '◐' : '○'}</span>
              <span style={{ fontWeight: 500, minWidth: 80 }}>{phase.name}</span>
              <span style={{ fontSize: 10, color: 'var(--tx3)', flex: 1 }}>
                {phaseTeamLabel(phase, teams)}{phaseAssigneeLabel(phase, members) ? ` · ${phaseAssigneeLabel(phase, members)}` : ''}
              </span>
              {phase.effortPct > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{phase.effortPct}%</span>}
              {current && <span style={{ fontSize: 10, color: 'var(--ac)', flexShrink: 0 }}>{t('pr.current')}</span>}
            </div>)}
          </div>;
        });
      })()}
    </>}

    {/* ══════ CAPACITY — compact cards ══════ */}
    {section === 'capacity' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
      {teamCapacity.map(tc => {
        // The card is about THIS team's open work, and every number on it adds
        // up to the bar: each member's share in their own dot colour, plus a
        // neutral remainder for work nobody is on. The dots are the bar's
        // legend, which is the whole reason they are there.
        const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
        const shades = memberShades(tc.color, tc.members.length, { dark: !isLight });
        const memberShares = tc.members.map((m, mi) => ({
          m,
          color: shades[mi] || tc.color,
          pt: (scheduled || [])
            .filter(r => r.status !== 'done' && !r.unscheduled && r.personId === m.id && (r.team || '') === (tc.id || ''))
            .reduce((acc, r) => acc + (r.effort || 0), 0),
        }));
        const staffedPt = memberShares.reduce((acc, x) => acc + x.pt, 0);
        const teamTotal = staffedPt + tc.unassignedPt;
        return <div key={tc.name} style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderLeft: `3px solid ${tc.color}`, borderRadius: 'var(--r)', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: tc.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{tc.name}</span>
          </div>
          {memberShares.map(({ m, pt, color }) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 2 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{m.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{m.cap < 1 ? `${Math.round(m.cap * 100)}%` : ''}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx2)' }}>{pt.toFixed(0)} PT</span>
            </div>
          ))}
          {teamTotal > 0 && <>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg4)', margin: '7px 0 4px' }}>
              {memberShares.map(({ m, pt, color }) => pt > 0 && (
                <div key={m.id} style={{ width: `${pt / teamTotal * 100}%`, background: color }} />
              ))}
              {tc.unassignedPt > 0 && <div style={{ width: `${tc.unassignedPt / teamTotal * 100}%`, background: 'var(--b2)' }} />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>
              <span style={{ color: 'var(--tx2)' }}>{teamTotal.toFixed(0)} PT {t('pr.open')}</span>
              {tc.unassignedPt > 0 && <span>{t('pr.ptOpen', tc.unassignedPt.toFixed(0), tc.unassignedCount)}</span>}
            </div>
          </>}
        </div>;
      })}
    </div>}

    {/* ══════ LOAD — weekly resource-load matrix (scheduler output) ══════ */}
    {section === 'load' && (
      <ResourceLoadMatrix
        members={members}
        teams={teams}
        weeks={weeks}
        vacations={vacations}
        meetingPlans={meetingPlans}
        scheduled={scheduled}
      />
    )}

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
        return <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid var(--b)', cursor: 'pointer', fontSize: 12 }}
          onClick={() => onOpenItem?.(r.id)}
          data-htip={blockers.length ? `${t('p.waitingFor')}: ${blockers.join(', ')}` : undefined}>
          <span style={{ fontSize: 11, color: CC[r.conf] }}>{CL[r.conf]}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{r.id}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          {r.isCp && <CriticalPathBadge id={r.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
          <span style={{ fontSize: 10, color: 'var(--am)', flexShrink: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('pr.waitingOn', blockers.length)}</span>
          {team && <span style={{ fontSize: 10, color: team.color, flexShrink: 0 }}>{team.name}</span>}
        </div>;
      })}
    </>}

    {section === 'warnings' && (() => {
      const dueViolations = scheduled
        .filter(s => s.dueOverdue || (s.due && new Date(s.due) < new Date() && s.status !== 'done'))
        .sort((a, b) => (a.due || '').localeCompare(b.due || ''));
      const truncated = scheduled
        .filter(s => s.truncatedByOffboard)
        .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      if (!dueViolations.length && !truncated.length && !conflicts.length) {
        return <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('pr.warningsNone')}</div>;
      }
      const conflictDetail = c => c.kind === 'orphan'
        ? t('pr.conflictOrphan', c.parentId)
        : c.kind === 'droppedLive'
          ? t('pr.conflictDroppedLive', c.progress)
          : t('pr.conflictDoneOverOpen', c.openIds.length, c.openIds.slice(0, 3).join(', ') + (c.openIds.length > 3 ? ' …' : ''));
      return <>
        {conflicts.length > 0 && <div style={{ marginBottom: 18 }} data-testid="plan-conflicts">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--am)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--am)' }}>! {t('pr.conflicts')}</span>
            <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{conflicts.length}</span>
          </div>
          <p className="helper" style={{ fontSize: 11, margin: '0 0 6px' }}>{t('pr.conflictsHelp')}</p>
          {conflicts.map(c => <div key={`${c.kind}-${c.id}`} data-conflict={c.kind} data-conflict-id={c.id}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid var(--b)', cursor: 'pointer', fontSize: 12 }}
            onClick={() => onOpenItem?.(c.id)}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{c.id}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullMap[c.id]?.name || c.id}</span>
            <span style={{ fontSize: 11, color: 'var(--am)', flexShrink: 0 }}>{conflictDetail(c)}</span>
          </div>)}
        </div>}
        {dueViolations.length > 0 && <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--re)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--re)' }}>~ {t('pr.warnDueOverdue')}</span>
            <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{dueViolations.length}</span>
          </div>
          {dueViolations.map(s => {
            const node = iMap[s.treeId || s.id];
            const projEnd = s.endD ? iso(s.endD) : '—';
            const latest = s.latestStart ? (s.latestStart instanceof Date ? iso(s.latestStart) : s.latestStart) : null;
            return <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid var(--b)', cursor: 'pointer', fontSize: 12 }}
              onClick={() => onOpenItem?.(s.treeId || s.id)}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{s.id}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node?.name || s.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--re)', flexShrink: 0 }}>~ {s.due}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>→ {projEnd}</span>
              {latest && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: s.dueInfeasible ? 'var(--re)' : 'var(--am)', flexShrink: 0, fontWeight: s.dueInfeasible ? 600 : 400 }}
                data-htip={t(s.dueInfeasible ? 'ins.latestStartPast' : 'ins.latestStart')}>
                ↶ {latest}{s.dueInfeasible ? ' !' : ''}
              </span>}
            </div>;
          })}
        </div>}
        {truncated.length > 0 && <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--am)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--am)' }}>! {t('pr.warnTruncated')}</span>
            <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{truncated.length}</span>
          </div>
          {truncated.map(s => {
            const node = iMap[s.treeId || s.id];
            const tr = s.truncatedByOffboard;
            return <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid var(--b)', cursor: 'pointer', fontSize: 12 }}
              onClick={() => onOpenItem?.(s.treeId || s.id)}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>{s.id}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node?.name || s.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)', flexShrink: 0 }}>{tr.remainingEffort.toFixed(1)} PT</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>nach {tr.offboardDate}</span>
              <span style={{ fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>↳ {t('pr.warnSplitHint')}</span>
            </div>;
          })}
        </div>}
      </>;
    })()}

    {section === 'critical' && <>
      {criticalScopes.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('pr.noCriticalPaths')}</div>}
      {criticalScopes.length > 0 && <div style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 14, fontSize: 12, color: 'var(--tx2)' }}>
        {t('pr.criticalHint')}
        {(teamFilter || personFilter) && <div style={{ marginTop: 6, color: 'var(--tx3)' }}>{t('pr.filterHint')}</div>}
      </div>}
      {criticalScopes.map((entry, scopeIndex) => {
        const scopeNode = iMap[entry.scopeId];
        return <div key={entry.scopeId} style={{ background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--b)' }}>
            <span className="badge b-cp">{scopeIndex + 1}</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{scopeNode?.name || entry.scopeId}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{entry.scopeId}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{t('pr.scopePaths', entry.chains.length, entry.nodes.length)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entry.chains.map((chain, chainIndex) => {
              const cpNo = `${scopeIndex + 1}.${chainIndex + 1}`;
              return <div key={`${entry.scopeId}:${chain.join('>')}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span className="badge b-cp" style={{ flexShrink: 0, minWidth: 42, textAlign: 'center' }}>CP{cpNo}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                  {chain.map((id, idx) => {
                    const node = iMap[id];
                    const sc = sMap[id];
                    const dimmed = (teamFilter || personFilter) && !matchesFilter(node);
                    return <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {idx > 0 && <Icon name="chevronRight" size={11} strokeWidth={2.4} style={{ color: 'var(--re)', flexShrink: 0 }} />}
                      <button
                        className="btn btn-sec btn-xs"
                        onClick={() => onOpenItem?.(id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          maxWidth: 260,
                          padding: '4px 8px',
                          borderColor: 'rgba(154,36,40,.45)',
                          background: dimmed ? 'var(--bg3)' : 'rgba(154,36,40,.08)',
                          opacity: dimmed ? .55 : 1,
                        }}
                        data-htip={node?.name || id}
                      >
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--re)', flexShrink: 0 }}>{id}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{node?.name || id}</span>
                        {sc?.effort > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{sc.effort.toFixed(0)}d</span>}
                      </button>
                    </span>;
                  })}
                  {chain.length === 1 && <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{t('pr.standalone')}</span>}
                </div>
              </div>;
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{t('pr.chainLength', entry.scope.chainLength.toFixed(1))}</div>
        </div>;
      })}
    </>}
  </div>;
}

export const PlanReview = memo(PlanReviewImpl);
