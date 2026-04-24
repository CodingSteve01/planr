import { SearchSelect } from './SearchSelect.jsx';

// Per-segment handoff override editor. Stage 0 = primary (r.team + r.assign).
// Stages 1..N are explicit targets — when the scheduler hits an offboarding
// it consults the plan; the plan's team restricts the candidate pool, the
// plan's assign pins a specific member (cascading auto-pick otherwise).
//
// Stored on the tree node as:
//   r.handoffPlan?: Array<{ team?: string, assign?: string[] }>
//
// Left unset = pure auto-cascade (current default). Any explicit entry is
// honored in order; empty trailing entries are ignored.
export function HandoffPlanEditor({ node, members, teams, onChange }) {
  const plan = Array.isArray(node.handoffPlan) ? node.handoffPlan : [];
  const memberName = id => members.find(m => m.id === id)?.name || id;
  const setPlan = next => {
    // Drop completely-empty trailing entries so JSON stays clean.
    const trimmed = [...next];
    while (trimmed.length && !trimmed[trimmed.length - 1]?.team && !(trimmed[trimmed.length - 1]?.assign?.length)) {
      trimmed.pop();
    }
    onChange(trimmed);
  };
  const addStage = () => setPlan([...plan, { team: '', assign: [] }]);
  const updStage = (idx, patch) => setPlan(plan.map((p, i) => i === idx ? { ...p, ...patch } : p));
  const delStage = idx => setPlan(plan.filter((_, i) => i !== idx));

  return (
    <div style={{
      marginTop: 10, padding: 10, background: 'var(--bg3)',
      border: '1px solid var(--b)', borderRadius: 'var(--r)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>Handoff-Plan</div>
        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
          {plan.length === 0 ? 'Leer → Auto-Cascade' : `${plan.length} Etappe${plan.length > 1 ? 'n' : ''} vorgegeben`}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--tx3)', lineHeight: 1.4 }}>
        Beim Offboarding wechselt der Task an die hier hinterlegte Person/Team. Jede Etappe = ein Ressourcen-Block nach einem Offcut. Leere Felder → Scheduler sucht automatisch.
      </div>

      {plan.map((stage, idx) => {
        const stageMembers = stage.team
          ? members.filter(m => m.team === stage.team)
          : members;
        return (
          <div key={idx} style={{
            padding: 8, background: 'var(--bg2)', border: '1px solid var(--b)',
            borderLeft: '3px solid var(--ac)', borderRadius: 4,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Etappe {idx + 1}  ·  nach {idx === 0 ? 'primärem Offboarding' : `Offboarding Etappe ${idx}`}
              </span>
              <button className="btn btn-ghost btn-xs" style={{ color: 'var(--re)' }}
                onClick={() => delStage(idx)} title="Etappe entfernen">×</button>
            </div>
            <div className="rf" style={{ marginBottom: 0 }}>
              <label>Team</label>
              <SearchSelect value={stage.team || ''}
                options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))}
                onSelect={v => updStage(idx, { team: v, assign: [] /* reset on team change */ })}
                placeholder="(beliebiges Team)" allowEmpty emptyLabel="(beliebig)" />
            </div>
            <div className="rf" style={{ marginBottom: 0, alignItems: 'flex-start' }}>
              <label>Person(en)</label>
              <div style={{ width: 150, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(stage.assign || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {stage.assign.map(id => (
                      <span key={id} className="tag">{memberName(id)}
                        <span className="tag-x" onClick={() => updStage(idx, {
                          assign: (stage.assign || []).filter(a => a !== id),
                        })}>×</span>
                      </span>
                    ))}
                  </div>
                )}
                <SearchSelect
                  options={stageMembers
                    .filter(m => !(stage.assign || []).includes(m.id))
                    .map(m => ({ id: m.id, label: m.name || m.id }))}
                  onSelect={id => {
                    const m = members.find(x => x.id === id);
                    updStage(idx, {
                      assign: [...new Set([...(stage.assign || []), id])],
                      team: stage.team || m?.team || '',
                    });
                  }}
                  placeholder="+ Person hinzufügen..."
                />
              </div>
            </div>
          </div>
        );
      })}

      <button className="btn btn-sec btn-xs" onClick={addStage} style={{ alignSelf: 'flex-start' }}>
        + {plan.length === 0 ? 'Erste Handoff-Etappe' : 'Weitere Etappe'}
      </button>
    </div>
  );
}
