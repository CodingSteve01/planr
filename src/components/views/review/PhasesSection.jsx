import { phaseAssigneeLabel, phaseTeamLabel } from '../../../utils/phases.js';
import { useT } from '../../../i18n.jsx';

export function PhasesSection({ phaseTodos, phaseShowAll, setPhaseShowAll, teams, members, onOpenItem, advancePhase }) {
  const { t } = useT();
  return (
    <>
      {phaseTodos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('p.noPhaseTodos')}</div>
      )}
      {phaseTodos.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          <button className={`btn btn-xs ${!phaseShowAll ? 'btn-pri' : 'btn-sec'}`} onClick={() => setPhaseShowAll(false)}>
            {t('pr.currentPhases')}
          </button>
          <button className={`btn btn-xs ${phaseShowAll ? 'btn-pri' : 'btn-sec'}`} onClick={() => setPhaseShowAll(true)}>
            {t('pr.allOpen', phaseTodos.length)}
          </button>
        </div>
      )}
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
          return (
            <div key={task.id} style={{ marginBottom: 10 }}>
              {/* Task header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 8px',
                  cursor: 'pointer',
                  background: 'var(--bg3)',
                  borderRadius: '4px 4px 0 0',
                  borderLeft: `3px solid ${team?.color || 'var(--b)'}`,
                }}
                onClick={() => onOpenItem?.(task.id)}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0 }}>
                  {task.id}
                </span>
                <span
                  style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {task.name}
                </span>
                {team && <span style={{ fontSize: 10, color: team.color, flexShrink: 0 }}>{team.name}</span>}
                {task.best > 0 && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{task.best}T</span>
                )}
              </div>
              {/* Phase rows */}
              {phases.map(({ phase, current }) => (
                <div
                  key={phase.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px 3px 20px',
                    borderBottom: '1px solid var(--b)',
                    borderLeft: current ? '3px solid var(--ac)' : '3px solid transparent',
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      cursor: 'pointer',
                      fontSize: 12,
                      color: phase.status === 'wip' ? 'var(--ac)' : 'var(--tx3)',
                      flexShrink: 0,
                    }}
                    onClick={() => advancePhase(task, phase.id)}
                  >
                    {phase.status === 'wip' ? '◐' : '○'}
                  </span>
                  <span style={{ fontWeight: 500, minWidth: 80 }}>{phase.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--tx3)', flex: 1 }}>
                    {phaseTeamLabel(phase, teams)}
                    {phaseAssigneeLabel(phase, members) ? ` · ${phaseAssigneeLabel(phase, members)}` : ''}
                  </span>
                  {phase.effortPct > 0 && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{phase.effortPct}%</span>
                  )}
                  {current && <span style={{ fontSize: 10, color: 'var(--ac)', flexShrink: 0 }}>{t('pr.current')}</span>}
                </div>
              ))}
            </div>
          );
        });
      })()}
    </>
  );
}
