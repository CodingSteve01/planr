import { LazyInput } from '../../shared/LazyInput.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { deriveCap, FTE_HOURS, sumMeetingHours } from '../../../utils/capacity.js';
import { memberTeams } from '../../../utils/memberTeams.js';
import { PlanPicker } from './PlanPicker.jsx';

export { CapacityField };

/* ─── Capacity field: switches between Manual % and Derived (40h − meetings) ── */
// Baseline is always 40h/week FTE. Members with reduced workload should model
// it as a "Teilzeit" meeting-equivalent, or switch to Manual %.
function CapacityField({ member, onUpd, t, meetingPlans = [], teams = [] }) {
  const mode = member.capMode === 'derived' ? 'derived' : 'manual';
  const setMode = newMode => {
    if (newMode === mode) return;
    if (newMode === 'derived') {
      onUpd({ ...member, capMode: 'derived', meetings: member.meetings || [] });
    } else {
      onUpd({ ...member, capMode: 'manual', cap: deriveCap({ ...member, capMode: 'derived' }) });
    }
  };
  const capCtx = { plans: meetingPlans, teams };
  const derivedPct = Math.round(deriveCap(member, capCtx) * 100);
  const tone = derivedPct > 100 ? 'var(--re)' : derivedPct >= 80 ? 'var(--gr)' : 'var(--am)';
  return (
    <div
      className="cap-card"
      style={{
        marginTop: 10,
        padding: 12,
        background: 'var(--bg3)',
        border: '1px solid var(--b)',
        borderRadius: 'var(--r)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{t('rv.capacityPct')}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: tone }}>{derivedPct}%</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn btn-xs ${mode === 'manual' ? 'btn-pri' : 'btn-sec'}`} onClick={() => setMode('manual')}>
            {t('rv.manualCap')}
          </button>
          <button className={`btn btn-xs ${mode === 'derived' ? 'btn-pri' : 'btn-sec'}`} onClick={() => setMode('derived')}>
            {t('rv.derivedCap')}
          </button>
        </div>
      </div>
      {mode === 'manual' ? (
        <div className="rf" style={{ marginBottom: 0 }}>
          <label>%</label>
          <LazyInput
            type="number"
            min="0"
            max="100"
            step="5"
            value={Math.round((member.cap || 1) * 100)}
            onCommit={v => onUpd({ ...member, cap: v / 100 })}
          />
        </div>
      ) : (
        <DerivedCapacity member={member} onUpd={onUpd} t={t} meetingPlans={meetingPlans} teams={teams} />
      )}
    </div>
  );
}

function DerivedCapacity({ member, onUpd, t, meetingPlans = [], teams = [] }) {
  const wh = typeof member.weeklyHours === 'number' ? member.weeklyHours : FTE_HOURS;
  const meetings = member.meetings || [];
  // Inherited meetings: from the plans of every team the member is in, plus
  // member-level plans.
  const teamPlanIds = new Set(memberTeams(member).flatMap(tid => teams.find(t => t.id === tid)?.meetingPlanIds || []));
  const planIdSet = new Set([...teamPlanIds, ...(member.meetingPlanIds || [])]);
  const inheritedPlans = meetingPlans.filter(p => planIdSet.has(p.id));
  const inheritedMeetings = inheritedPlans.flatMap(p =>
    (p.meetings || []).map(m => ({ ...m, _planName: p.name, _fromTeam: teamPlanIds.has(p.id) })),
  );
  const allMeetingsWeekly = sumMeetingHours([...inheritedMeetings, ...meetings]);
  const meetingH = allMeetingsWeekly; // keep legacy name for display
  const avail = Math.max(0, wh - meetingH);
  const addMeeting = () => {
    const id = 'mt_' + Math.random().toString(36).slice(2, 8);
    onUpd({ ...member, meetings: [...meetings, { id, name: '', hours: 0.5, frequency: 'weekly' }] });
  };
  const updMeeting = (id, patch) => {
    onUpd({ ...member, meetings: meetings.map(m => (m.id === id ? { ...m, ...patch } : m)) });
  };
  const delMeeting = id => onUpd({ ...member, meetings: meetings.filter(m => m.id !== id) });
  const COLS = '1fr 90px 130px 28px';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="rf" style={{ marginBottom: 0 }}>
        <label>{t('rv.hoursWeek')}</label>
        <div style={{ width: 150, display: 'flex', alignItems: 'center', gap: 6 }}>
          <LazyInput type="number" min="0" max="80" step="0.5" value={wh} onCommit={v => onUpd({ ...member, weeklyHours: Number(v) })} />
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>h</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: -4 }}>{t('rv.hoursDefault', FTE_HOURS)}</div>

      {/* Plan-Picker für Member (zusätzlich zu Team-geerbten Plänen). */}
      <PlanPicker
        label="Meeting-Pläne (zusätzlich)"
        hint={
          teamPlanIds.size
            ? `${teamPlanIds.size} Plan(e) automatisch vom Team „${memberTeams(member)
                .map(tid => teams.find(tm => tm.id === tid)?.name || tid)
                .join(' + ')}" geerbt.`
            : 'Pläne bündeln wiederkehrende Termine — verwalten unter „Meeting-Pläne".'
        }
        plans={meetingPlans}
        selected={member.meetingPlanIds || []}
        onChange={ids => onUpd({ ...member, meetingPlanIds: ids })}
      />

      {inheritedMeetings.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--tx3)', padding: '6px 8px', background: 'var(--bg3)', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Aus Plänen:</div>
          {inheritedMeetings.map((m, i) => (
            <div key={i} style={{ fontFamily: 'var(--mono)' }}>
              − {m.hours ?? 0} h{m.frequency && m.frequency !== 'weekly' ? `/${m.frequency}` : ''} {m.name}
              <span style={{ opacity: 0.6 }}>
                {' '}
                [{m._planName}
                {m._fromTeam ? ' · Team' : ''}]
              </span>
            </div>
          ))}
        </div>
      )}
      <div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: COLS,
            gap: 6,
            fontSize: 11,
            color: 'var(--tx3)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          <span>Meeting</span>
          <span>Stunden</span>
          <span>Rhythmus</span>
          <span />
        </div>
        {meetings.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--tx3)', fontStyle: 'italic', padding: '4px 0' }}>Noch keine Meetings erfasst.</div>
        )}
        {meetings.map(mt => (
          <div key={mt.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <LazyInput value={mt.name || ''} onCommit={v => updMeeting(mt.id, { name: v })} placeholder={t('rv.meetingNamePlaceholder')} />
            <LazyInput type="number" min="0" step="0.25" value={mt.hours ?? 0} onCommit={v => updMeeting(mt.id, { hours: Number(v) })} />
            <select value={mt.frequency || 'weekly'} onChange={e => updMeeting(mt.id, { frequency: e.target.value })}>
              <option value="daily">täglich</option>
              <option value="weekly">wöchentl.</option>
              <option value="biweekly">14-tägl.</option>
              <option value="monthly">monatl.</option>
            </select>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => delMeeting(mt.id)}
              style={{ padding: '2px 6px', color: 'var(--re)' }}
              title={t('rv.deleteMeeting')}
            >
              <Icon name="x" size={11} />
            </button>
          </div>
        ))}
        <button className="btn btn-sec btn-xs" onClick={addMeeting} style={{ marginTop: 6 }}>
          + Meeting
        </button>
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--tx2)',
          borderTop: '1px solid var(--b)',
          paddingTop: 8,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontFamily: 'var(--mono)' }}>{wh} h</span>
        <span style={{ color: 'var(--tx3)' }}>−</span>
        <span style={{ fontFamily: 'var(--mono)' }}>{meetingH.toFixed(2)} h Meetings</span>
        <span style={{ color: 'var(--tx3)' }}>=</span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--tx)' }}>{avail.toFixed(2)} h</span>
        <span style={{ color: 'var(--tx3)', marginLeft: 'auto' }}>verfügbar</span>
      </div>
    </div>
  );
}
