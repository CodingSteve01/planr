import { useEffect, useRef, useState } from 'react';
import { SearchSelect } from './SearchSelect.jsx';

// Per-cutoff override editor. Cutoffs are not created here — the scheduler
// derives them from member offboarding dates. This UI surfaces each derived
// cutoff and lets the user override *who* picks up after it. Empty override
// = scheduler decides automatically.
//
// Stored on the tree node as:
//   r.handoffPlan?: Array<{ team?: string, assign?: string[] }>
//
// Index N of handoffPlan overrides the Nth cutoff (0-based). Anything beyond
// the observed cutoffs is shown as "future cutoff" so the user can pre-plan.
export function HandoffPlanEditor({ node, members, teams, scheduled, onChange, focusStage = null }) {
  const stageRefs = useRef({});
  // Expand automatically when focused (offcut-click) or when the user has
  // already added plan entries / scheduler produced cutoffs; otherwise keep
  // collapsed so the editor isn't visual noise on every task.
  const hasContent = Array.isArray(node.handoffPlan) && node.handoffPlan.some(p => p?.team || p?.assign?.length);
  const [expanded, setExpanded] = useState(focusStage != null || hasContent);
  useEffect(() => {
    if (focusStage == null) return;
    setExpanded(true);
    const el = stageRefs.current[focusStage];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusStage]);
  const plan = Array.isArray(node.handoffPlan) ? node.handoffPlan : [];
  const memberName = id => members.find(m => m.id === id)?.name || id;
  const teamName = id => teams.find(tm => tm.id === id)?.name || id;

  // Pull the forecasted segment chain from the scheduler. Primary segment
  // (index 0) is the original assignee; subsequent segments are cutoffs.
  const sc = Array.isArray(scheduled)
    ? scheduled.find(s => (s.treeId || s.id) === node.id && !s.isHandoff)
    : null;
  const allSegs = sc?.segments || [];
  const cutoffs = allSegs.slice(1); // entries after the primary

  const setStage = (idx, patch) => {
    const next = [...plan];
    while (next.length <= idx) next.push({});
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const clearStage = idx => {
    const next = [...plan];
    if (idx >= next.length) return;
    next[idx] = {};
    // Strip trailing empties only — never the stage the user is editing.
    while (next.length && !next[next.length - 1]?.team && !(next[next.length - 1]?.assign?.length)) {
      next.pop();
    }
    onChange(next);
  };
  const addExtraStage = () => {
    // Seed a fresh empty stage at the end of the plan so the user sees a row.
    onChange([...plan, { team: '', assign: [] }]);
  };

  // Stages to render: union of derived cutoffs and any extra overrides the
  // user has already typed beyond the observed chain (pre-planning).
  const totalStages = Math.max(cutoffs.length, plan.length);
  const stages = Array.from({ length: totalStages }, (_, i) => ({
    idx: i,
    predicted: cutoffs[i] || null,
    override: plan[i] || null,
  }));

  // Collapsed summary: one-liner only. User opens on demand.
  if (!expanded) {
    return (
      <div style={{
        marginTop: 10, padding: '6px 10px', background: 'var(--bg3)',
        border: '1px solid var(--b)', borderRadius: 'var(--r)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11,
      }}>
        <div style={{ color: 'var(--tx3)' }}>
          <span style={{ fontWeight: 600, color: 'var(--tx2)' }}>Handoff-Plan</span>
          <span style={{ marginLeft: 6 }}>
            {cutoffs.length === 0
              ? 'Kein Cutoff erwartet — Auto-Cascade übernimmt, falls später nötig.'
              : `${cutoffs.length} Auto-Cutoff${cutoffs.length === 1 ? '' : 's'} (Scheduler entscheidet)`}
          </span>
        </div>
        <button className="btn btn-sec btn-xs" onClick={() => setExpanded(true)}>
          Override…
        </button>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 10, padding: 10, background: 'var(--bg3)',
      border: '1px solid var(--b)', borderRadius: 'var(--r)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>Handoff-Plan</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
            {cutoffs.length === 0 && plan.length === 0
              ? 'Kein Cutoff erwartet'
              : `${cutoffs.length} Auto-Cutoff${cutoffs.length === 1 ? '' : 's'}${plan.length > 0 ? ` · ${plan.length} Override${plan.length === 1 ? '' : 's'}` : ''}`}
          </div>
          {focusStage == null && (
            <button className="btn btn-ghost btn-xs" onClick={() => setExpanded(false)} style={{ padding: '0 6px', color: 'var(--tx3)' }}>ein­klappen</button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--tx3)', lineHeight: 1.4 }}>
        Cutoffs werden vom Scheduler automatisch aus Offboarding-Datums berechnet. Für jede Etappe kann hier optional ein Team oder eine Person fest vorgegeben werden — sonst sucht der Scheduler.
      </div>

      {stages.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--tx3)', fontStyle: 'italic' }}>
          Aktuell kein Handoff nötig. Falls du Vorgaben für künftige Offboardings setzen willst, "+ Etappe" anlegen.
        </div>
      )}

      {stages.map(({ idx, predicted, override }) => {
        const stage = override || {};
        const stageMembers = stage.team
          ? members.filter(m => m.team === stage.team)
          : members;
        const predictedLabel = predicted
          ? `Scheduler wählt: ${predicted.personName || '(unassigned)'}${predicted.unscheduled ? ' ⚠' : ''}`
          : 'Vorgeplant (noch kein Cutoff erwartet)';
        const predictedAfter = predicted?.handoff && allSegs[idx]?.personName
          ? ` nach Offboarding von ${allSegs[idx].personName}`
          : '';
        const isFocused = focusStage === idx;
        return (
          <div key={idx} ref={el => { stageRefs.current[idx] = el; }} style={{
            padding: 8,
            background: isFocused ? 'rgba(59,130,246,.12)' : 'var(--bg2)',
            border: '1px solid var(--b)',
            borderLeft: `3px solid ${predicted?.unscheduled ? 'var(--re)' : 'var(--ac)'}`,
            borderRadius: 4,
            display: 'flex', flexDirection: 'column', gap: 6,
            outline: isFocused ? '2px solid var(--ac)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Etappe {idx + 1}{predictedAfter}
              </span>
              <button className="btn btn-ghost btn-xs" style={{ color: 'var(--re)', padding: '0 6px' }}
                onClick={() => clearStage(idx)} title="Override entfernen (zurück zu Auto)">×</button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{predictedLabel}</div>
            <div className="rf" style={{ marginBottom: 0 }}>
              <label>Team</label>
              <SearchSelect value={stage.team || ''}
                options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))}
                onSelect={v => setStage(idx, { team: v })}
                placeholder="(Auto)" allowEmpty emptyLabel="(Auto)" />
            </div>
            <div className="rf" style={{ marginBottom: 0, alignItems: 'flex-start' }}>
              <label>Person(en)</label>
              <div style={{ width: 150, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(stage.assign || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {stage.assign.map(id => (
                      <span key={id} className="tag">{memberName(id)}
                        <span className="tag-x" onClick={() => setStage(idx, {
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
                    setStage(idx, {
                      assign: [...new Set([...(stage.assign || []), id])],
                      team: stage.team || m?.team || '',
                    });
                  }}
                  placeholder="+ Override-Person..."
                />
              </div>
            </div>
          </div>
        );
      })}

      <button className="btn btn-sec btn-xs" onClick={addExtraStage} style={{ alignSelf: 'flex-start' }}
        data-htip="Fügt eine zusätzliche Etappe hinzu — für Offboardings die noch nicht im Ressourcen-Datum erfasst sind">
        + {plan.length === 0 ? 'Etappe vorbelegen' : 'Weitere Etappe'}
      </button>
    </div>
  );
}
