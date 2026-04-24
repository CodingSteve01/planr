import { useState, useEffect } from 'react';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { LazyInput } from '../shared/LazyInput.jsx';
import { buildMemberShortMap } from '../../App.jsx';
import { useT } from '../../i18n.jsx';
import { deriveCap, capBreakdown, FTE_HOURS, sumMeetingHours } from '../../utils/capacity.js';

/* ─── helpers ─────────────────────────────────────────────────────────── */
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

/* ─── TeamEditModal ───────────────────────────────────────────────────── */
function TeamEditModal({ team, idx, meetingPlans = [], onUpd, onDel, onClose, t }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{t('rv.editTeam')}</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose} title={t('rv.close')}>×</button>
        </div>

        {/* Body */}
        <div className="field">
          <label>{t('rv.teamColor')}</label>
          <input
            type="color"
            value={team.color || '#3b82f6'}
            onChange={e => onUpd(idx, 'color', e.target.value)}
            className="res-color-pick"
          />
        </div>
        <div className="field">
          <label>{t('rv.teamName')}</label>
          <LazyInput
            value={team.name || ''}
            onCommit={v => onUpd(idx, 'name', v)}
            placeholder={t('rv.teamName')}
          />
        </div>

        {/* Meeting-Plans für das Team (werden allen Mitgliedern zugewiesen). */}
        <PlanPicker
          label="Meeting-Pläne (Team)"
          hint="Wirken auf alle Team-Mitglieder mit derived-Cap."
          plans={meetingPlans}
          selected={team.meetingPlanIds || []}
          onChange={ids => onUpd(idx, 'meetingPlanIds', ids)} />

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-danger"
            onClick={() => { onDel(idx); onClose(); }}
          >
            {t('rv.remove')}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={onClose}>{t('rv.close')}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── MemberEditModal ─────────────────────────────────────────────────── */
function MemberEditModal({ member, teams, shortMap, meetingPlans = [], onUpd, onClone, onDel, onClose, t }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar member={member} teams={teams} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {member.name || member.id}
              {shortMap[member.id] && (
                <span className="res-row-short" data-htip="Auto-generated short name (used in Markdown)">
                  {shortMap[member.id]}
                </span>
              )}
            </span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose} title={t('rv.close')}>×</button>
        </div>

        {/* Body — 2-column grid */}
        <div className="res-edit-grid">
          {[
            [t('rv.fullName'),    <LazyInput value={member.name || ''} onCommit={v => onUpd({ ...member, name: v })} />],
            [t('qe.team'),       <SearchSelect value={member.team || ''} options={teams.map(tm => ({ id: tm.id, label: tm.name }))} onSelect={v => onUpd({ ...member, team: v })} placeholder={t('rv.chooseTeam')} allowEmpty />],
            [t('rv.role'),       <LazyInput value={member.role || ''} onCommit={v => onUpd({ ...member, role: v })} placeholder="e.g. Senior Dev" />],
            [t('rv.vacDays'),    <LazyInput type="number" min="0" max="40" value={member.vac || 25} onCommit={v => onUpd({ ...member, vac: v })} />],
            [t('rv.startDate'),  <LazyInput type="date" value={member.start || ''} onCommit={v => onUpd({ ...member, start: v })} />],
            [t('rv.endDate'),    <LazyInput type="date" value={member.end || ''} onCommit={v => onUpd({ ...member, end: v })} />],
          ].map(([l, c]) => (
            <div key={l} className="rf">
              <label>{l}</label>{c}
            </div>
          ))}
        </div>
        {/* Capacity is a compound field — breaks out of the narrow 150px
            label/value grid so the meetings list and breakdown have room. */}
        <CapacityField member={member} onUpd={onUpd} t={t} meetingPlans={meetingPlans} teams={teams} />

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-danger"
            onClick={() => { onDel(member.id); onClose(); }}
          >
            {t('rv.remove')}
          </button>
          {onClone && (
            <button
              className="btn btn-sec"
              onClick={() => { onClone(member); onClose(); }}
              data-htip={t('rv.clone')}
            >
              {t('rv.clone')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={onClose}>{t('rv.close')}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Meeting-Plan: row + popout edit modal ──────────────────────────────── */
function MeetingPlanReadRow({ plan, teamCount, memberCount, totalHours, onClick }) {
  return (
    <li className="res-row res-row-plan" onClick={onClick}>
      <span className="res-dot" style={{ background: 'var(--ac)' }} />
      <span className="res-row-name">{plan.name || 'Unbenannter Plan'}</span>
      <span className="res-row-meta">
        {(plan.meetings || []).length} Termin(e) · {totalHours.toFixed(2)} h/Woche
      </span>
      <span className="res-row-meta">{teamCount} Team(s) · {memberCount} Person(en)</span>
    </li>
  );
}

function MeetingPlanEditModal({ plan, onUpd, onDel, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const addMeeting = () => onUpd({
    ...plan,
    meetings: [...(plan.meetings || []), { id: 'mt_' + Math.random().toString(36).slice(2, 8), name: '', hours: 0.5, frequency: 'weekly' }],
  });
  const updMeeting = (mid, patch) => onUpd({
    ...plan,
    meetings: (plan.meetings || []).map(m => m.id === mid ? { ...m, ...patch } : m),
  });
  const delMeeting = (mid) => onUpd({
    ...plan,
    meetings: (plan.meetings || []).filter(m => m.id !== mid),
  });
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal cap-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Meeting-Plan</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose} title="Schließen">×</button>
        </div>
        <div className="field">
          <label>Name</label>
          <LazyInput value={plan.name || ''} onCommit={v => onUpd({ ...plan, name: v })} placeholder="z. B. Engineering Standard" />
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 130px 28px', gap: 6,
            fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 4,
          }}>
            <span>Meeting</span><span>Stunden</span><span>Rhythmus</span><span />
          </div>
          {(plan.meetings || []).map(mt => (
            <div key={mt.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px 28px', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <LazyInput value={mt.name || ''} onCommit={v => updMeeting(mt.id, { name: v })} placeholder="z. B. Standup" />
              <LazyInput type="number" min="0" step="0.25" value={mt.hours ?? 0}
                onCommit={v => updMeeting(mt.id, { hours: Number(v) })} />
              <select value={mt.frequency || 'weekly'}
                onChange={e => updMeeting(mt.id, { frequency: e.target.value })}>
                <option value="daily">täglich</option>
                <option value="weekly">wöchentl.</option>
                <option value="biweekly">14-tägl.</option>
                <option value="monthly">monatl.</option>
              </select>
              <button className="btn btn-ghost btn-xs" onClick={() => delMeeting(mt.id)} style={{ color: 'var(--re)', padding: '2px 6px' }}>×</button>
            </div>
          ))}
          <button className="btn btn-sec btn-xs" onClick={addMeeting} style={{ marginTop: 6 }}>+ Meeting</button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-danger" onClick={() => { if (confirm('Plan löschen? Zuweisungen bleiben als tote Referenz zurück.')) { onDel(plan.id); onClose(); } }}>
            Entfernen
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Capacity field: switches between Manual % and Derived (40h − meetings) ── */
// Baseline is always 40h/week FTE. Members with reduced workload should model
// it as a "Teilzeit" meeting-equivalent, or switch to Manual %.
// Simple plan picker: toggle chips for each plan. Used for Team + Member.
function PlanPicker({ label, hint, plans, selected, onChange }) {
  if (!plans.length) return null;
  const toggle = id => {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    onChange(next);
  };
  return (
    <div className="field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <label style={{ marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {plans.map(p => {
          const on = selected.includes(p.id);
          return (
            <button key={p.id} className={`btn btn-xs ${on ? 'btn-pri' : 'btn-sec'}`}
              onClick={() => toggle(p.id)} style={{ fontSize: 10 }}>
              {on ? '✓ ' : ''}{p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
    <div className="cap-card" style={{
      marginTop: 10, padding: 12, background: 'var(--bg3)',
      border: '1px solid var(--b)', borderRadius: 'var(--r)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>{t('rv.capacityPct')}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: tone }}>
            {derivedPct}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn btn-xs ${mode === 'manual' ? 'btn-pri' : 'btn-sec'}`}
            onClick={() => setMode('manual')}>Manuell</button>
          <button className={`btn btn-xs ${mode === 'derived' ? 'btn-pri' : 'btn-sec'}`}
            onClick={() => setMode('derived')}>Aus Meetings</button>
        </div>
      </div>
      {mode === 'manual' ? (
        <div className="rf" style={{ marginBottom: 0 }}>
          <label>%</label>
          <LazyInput type="number" min="0" max="100" step="5"
            value={Math.round((member.cap || 1) * 100)}
            onCommit={v => onUpd({ ...member, cap: v / 100 })} />
        </div>
      ) : (
        <DerivedCapacity member={member} onUpd={onUpd} meetingPlans={meetingPlans} teams={teams} />
      )}
    </div>
  );
}

function DerivedCapacity({ member, onUpd, meetingPlans = [], teams = [] }) {
  const wh = typeof member.weeklyHours === 'number' ? member.weeklyHours : FTE_HOURS;
  const meetings = member.meetings || [];
  // Inherited meetings: from team-level + member-level plans.
  const team = member.team ? teams.find(t => t.id === member.team) : null;
  const planIdSet = new Set([
    ...((team?.meetingPlanIds) || []),
    ...((member.meetingPlanIds) || []),
  ]);
  const inheritedPlans = meetingPlans.filter(p => planIdSet.has(p.id));
  const inheritedMeetings = inheritedPlans.flatMap(p => (p.meetings || []).map(m => ({ ...m, _planName: p.name, _fromTeam: (team?.meetingPlanIds || []).includes(p.id) })));
  const allMeetingsWeekly = sumMeetingHours([...inheritedMeetings, ...meetings]);
  const meetingH = allMeetingsWeekly; // keep legacy name for display
  const avail = Math.max(0, wh - meetingH);
  const addMeeting = () => {
    const id = 'mt_' + Math.random().toString(36).slice(2, 8);
    onUpd({ ...member, meetings: [...meetings, { id, name: '', hours: 0.5, frequency: 'weekly' }] });
  };
  const updMeeting = (id, patch) => {
    onUpd({ ...member, meetings: meetings.map(m => m.id === id ? { ...m, ...patch } : m) });
  };
  const delMeeting = id => onUpd({ ...member, meetings: meetings.filter(m => m.id !== id) });
  const COLS = '1fr 90px 130px 28px';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="rf" style={{ marginBottom: 0 }}>
        <label>Std / Woche</label>
        <div style={{ width: 150, display: 'flex', alignItems: 'center', gap: 6 }}>
          <LazyInput type="number" min="0" max="80" step="0.5" value={wh}
            onCommit={v => onUpd({ ...member, weeklyHours: Number(v) })} />
          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>h</span>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: -4 }}>
        Default: {FTE_HOURS} h (FTE). Teilzeit/Überstunden hier anpassen.
      </div>

      {/* Plan-Picker für Member (zusätzlich zu Team-geerbten Plänen). */}
      <PlanPicker
        label="Meeting-Pläne (zusätzlich)"
        hint={team?.meetingPlanIds?.length
          ? `${team.meetingPlanIds.length} Plan(e) automatisch vom Team „${team.name}" geerbt.`
          : 'Pläne bündeln wiederkehrende Termine — verwalten unter „Meeting-Pläne".'}
        plans={meetingPlans}
        selected={member.meetingPlanIds || []}
        onChange={ids => onUpd({ ...member, meetingPlanIds: ids })} />

      {inheritedMeetings.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--tx3)', padding: '6px 8px', background: 'var(--bg3)', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Aus Plänen:</div>
          {inheritedMeetings.map((m, i) => (
            <div key={i} style={{ fontFamily: 'var(--mono)' }}>
              − {(m.hours ?? 0)} h{m.frequency && m.frequency !== 'weekly' ? `/${m.frequency}` : ''} {m.name}
              <span style={{ opacity: 0.6 }}> [{m._planName}{m._fromTeam ? ' · Team' : ''}]</span>
            </div>
          ))}
        </div>
      )}
      <div>
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 6,
          fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase',
          letterSpacing: '.06em', fontWeight: 600, marginBottom: 4,
        }}>
          <span>Meeting</span>
          <span>Stunden</span>
          <span>Rhythmus</span>
          <span />
        </div>
        {meetings.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic', padding: '4px 0' }}>
            Noch keine Meetings erfasst.
          </div>
        )}
        {meetings.map(mt => (
          <div key={mt.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <LazyInput value={mt.name || ''} onCommit={v => updMeeting(mt.id, { name: v })} placeholder="z. B. Standup" />
            <LazyInput type="number" min="0" step="0.25" value={mt.hours ?? 0}
              onCommit={v => updMeeting(mt.id, { hours: Number(v) })} />
            <select value={mt.frequency || 'weekly'}
              onChange={e => updMeeting(mt.id, { frequency: e.target.value })}>
              <option value="daily">täglich</option>
              <option value="weekly">wöchentl.</option>
              <option value="biweekly">14-tägl.</option>
              <option value="monthly">monatl.</option>
            </select>
            <button className="btn btn-ghost btn-xs" onClick={() => delMeeting(mt.id)}
              style={{ padding: '2px 6px', color: 'var(--re)' }} title="Meeting entfernen">×</button>
          </div>
        ))}
        <button className="btn btn-sec btn-xs" onClick={addMeeting} style={{ marginTop: 6 }}>+ Meeting</button>
      </div>
      <div style={{
        fontSize: 11, color: 'var(--tx2)', borderTop: '1px solid var(--b)',
        paddingTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6,
        alignItems: 'baseline',
      }}>
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

/* ─── Teams ───────────────────────────────────────────────────────────── */
function TeamReadRow({ team, memberCount, meetingPlans = [], onClick, t }) {
  const plans = (team.meetingPlanIds || [])
    .map(id => meetingPlans.find(p => p.id === id))
    .filter(Boolean);
  return (
    <li className="res-row res-row-team" onClick={onClick}>
      <span className="res-dot" style={{ background: team.color || 'var(--ac)' }} />
      <span className="res-row-name">{team.name || team.id}</span>
      <span className="res-plan-tags">
        {plans.map(p => (
          <span key={p.id} className="res-plan-tag res-plan-tag-team" title="Meeting-Plan (Team-weit)">{p.name}</span>
        ))}
      </span>
      <span className="res-row-meta">{memberCount} {t('rv.members')}</span>
    </li>
  );
}

/* ─── Members ─────────────────────────────────────────────────────────── */
function Avatar({ member, teams }) {
  const team = teams.find(t => t.id === member.team);
  const bg = team?.color || 'var(--ac)';
  return (
    <span className="res-avatar" style={{ background: bg }}>
      {initials(member.name || member.id)}
    </span>
  );
}

function MemberReadRow({ member, teams, shortMap, meetingPlans = [], onClick, t }) {
  const team = teams.find(t => t.id === member.team);
  const cap = Math.round(deriveCap(member, { plans: meetingPlans, teams }) * 100);
  const vac = member.vac ?? 25;
  const today = new Date();
  const endD = member.end ? new Date(member.end) : null;
  const offboarded = endD && endD < today;
  const offboardingSoon = endD && endD >= today && (endD - today) / 86400000 <= 60;
  const dates = [member.start, member.end].filter(Boolean).join(' – ');
  // Build plan tag list: team-inherited plans flagged, member plans plain.
  const teamPlanIds = new Set((team?.meetingPlanIds) || []);
  const memberPlanIds = new Set((member.meetingPlanIds) || []);
  const allPlanIds = [...teamPlanIds, ...[...memberPlanIds].filter(id => !teamPlanIds.has(id))];
  const planObjs = allPlanIds.map(id => meetingPlans.find(p => p.id === id)).filter(Boolean);
  return (
    <li className="res-row res-row-member" onClick={onClick}
      style={{ opacity: offboarded ? 0.5 : 1 }}>
      <Avatar member={member} teams={teams} />
      <span className="res-row-name">
        {member.name || member.id}
        {shortMap[member.id] && (
          <span className="res-row-short" data-htip="Auto-generated short name (used in Markdown)">
            {shortMap[member.id]}
          </span>
        )}
        {offboarded && (
          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--re)', color: '#fff' }}
            data-htip={`Offboarded am ${member.end}`}>OFFBOARDED</span>
        )}
        {offboardingSoon && (
          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--am)', color: '#fff' }}
            data-htip={`Offboarded zum ${member.end}`}>BALD RAUS</span>
        )}
      </span>
      {team ? (
        <span className="res-team-badge" style={{ borderColor: team.color, color: team.color }}>
          {team.name}
        </span>
      ) : <span />}
      <span className="res-plan-tags">
        {planObjs.map(p => (
          <span key={p.id}
            className={`res-plan-tag${teamPlanIds.has(p.id) ? ' res-plan-tag-team' : ''}`}
            title={teamPlanIds.has(p.id) ? 'Meeting-Plan (vom Team geerbt)' : 'Meeting-Plan (individuell)'}>
            {p.name}
          </span>
        ))}
      </span>
      <span className="res-row-meta">{cap}% · {vac}d</span>
      <span className="res-row-meta">{dates || ''}</span>
    </li>
  );
}

/* ─── Main component ──────────────────────────────────────────────────── */
export function ResView({ members, teams, vacations, meetingPlans = [], onMeetingPlansUpd, onUpd, onAdd, onClone, onDel, onVac, onTeamUpd, onTeamAdd, onTeamDel }) {
  const { t } = useT();
  const shortMap = buildMemberShortMap(members);

  const [section, setSection] = useState('members');
  const [editingTeamId, setEditingTeamId]     = useState(null);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editingVacIdx, setEditingVacIdx]     = useState(null);
  const [editingPlanId, setEditingPlanId]     = useState(null);
  const editingPlan = editingPlanId != null ? meetingPlans.find(p => p.id === editingPlanId) : null;

  const memberCountForTeam = tid => members.filter(m => m.team === tid).length;

  const editingTeam   = editingTeamId   != null ? teams.find(tm => tm.id === editingTeamId)   : null;
  const editingTeamIdx = editingTeam    != null ? teams.indexOf(editingTeam)                   : -1;
  const editingMember = editingMemberId != null ? members.find(m => m.id === editingMemberId)  : null;

  /* sort vacations: latest first within year */
  const sortedVacs = [...vacations].sort((a, b) => (a.from || '') < (b.from || '') ? 1 : -1);
  const vacsByYear = sortedVacs.reduce((acc, v) => {
    const y = (v.from || '').slice(0, 4) || '—';
    (acc[y] ||= []).push(v);
    return acc;
  }, {});
  const vacYears = Object.keys(vacsByYear).sort((a, b) => b.localeCompare(a));

  const addVacation = () => {
    const newVacs = [...vacations, { person: members[0]?.id || '', from: '', to: '', note: '' }];
    onVac(newVacs);
    setEditingVacIdx(newVacs.length - 1);
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Section pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        {[
          ['plans', `Meeting-Pläne (${meetingPlans.length})`],
          ['teams', `${t('rv.teams')} (${teams.length})`],
          ['members', `${t('rv.members')} (${members.length})`],
          ['vacations', `${t('rv.vacations')} (${vacations.length})`],
        ].map(([k, l]) =>
          <button key={k} className={`btn btn-xs ${section === k ? 'btn-pri' : 'btn-sec'}`}
            style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSection(k)}>{l}</button>)}
        <div style={{ flex: 1 }} />
        {section === 'teams' && <button className="btn btn-sec btn-sm" onClick={onTeamAdd}>{t('rv.addTeam')}</button>}
        {section === 'vacations' && <button className="btn btn-sec btn-sm" onClick={addVacation}>{t('rv.addVacation')}</button>}
        {section === 'plans' && <button className="btn btn-sec btn-sm" onClick={() => {
          const id = 'mp_' + Math.random().toString(36).slice(2, 8);
          onMeetingPlansUpd([...meetingPlans, { id, name: 'Neuer Plan', meetings: [] }]);
          setEditingPlanId(id);
        }}>+ Plan</button>}
      </div>

      {/* ═══════════════ MEETING-PLÄNE ═══════════════ */}
      {section === 'plans' && (
        meetingPlans.length === 0
          ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>
              Noch keine Meeting-Pläne definiert. Pläne bündeln wiederkehrende Termine (z. B. "Engineering Standard") und werden Teams oder Personen zugewiesen.
            </div>
          : <>
              <div className="res-row res-row-plan res-row-header">
                <span />
                <span>Name</span>
                <span>Termine</span>
                <span style={{ textAlign: 'right' }}>Zuweisungen</span>
              </div>
              <ul className="res-list">
                {meetingPlans.map(pl => {
                  const teamCount = teams.filter(t => (t.meetingPlanIds || []).includes(pl.id)).length;
                  const memberCount = members.filter(m => (m.meetingPlanIds || []).includes(pl.id)).length;
                  const totalH = sumMeetingHours(pl.meetings || []);
                  return (
                    <MeetingPlanReadRow key={pl.id} plan={pl}
                      teamCount={teamCount} memberCount={memberCount} totalHours={totalH}
                      onClick={() => setEditingPlanId(pl.id)} />
                  );
                })}
              </ul>
            </>
      )}

      {/* ═══════════════ TEAMS ═══════════════ */}
      {section === 'teams' && (
        teams.length === 0
          ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('rv.noTeams') || '—'}</div>
          : <>
              <div className="res-row res-row-header res-row-team">
                <span />
                <span>Name</span>
                <span>Meeting-Pläne</span>
                <span style={{ textAlign: 'right' }}>Mitglieder</span>
              </div>
              <ul className="res-list">
                {teams.map(tm => (
                  <TeamReadRow
                    key={tm.id}
                    team={tm}
                    memberCount={memberCountForTeam(tm.id)}
                    meetingPlans={meetingPlans}
                    onClick={() => setEditingTeamId(tm.id)}
                    t={t}
                  />
                ))}
              </ul>
            </>
      )}

      {/* ═══════════════ MEMBERS ═══════════════ */}
      {section === 'members' && (<>
        {!members.length && !teams.length && (
          <div className="empty">
            <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
            {t('rv.noMembers')}
            <p>{t('rv.noMembersHint')}</p>
          </div>
        )}
        {[...teams, { id: '', name: t('noTeam'), color: 'var(--tx3)' }].map(tm => {
          const teamMembers = members.filter(m => (m.team || '') === tm.id);
          if (!teamMembers.length && tm.id === '') return null;
          return (
            <div key={tm.id || '__none__'} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${tm.color || 'var(--b)'}` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: tm.color || 'var(--tx2)' }}>{tm.name}</span>
                <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{teamMembers.length}</span>
                {tm.id && <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => onAdd(tm.id)}>+ {t('rv.addPerson')}</button>}
              </div>
              <div className="res-row res-row-member res-row-header">
                <span />
                <span>Name</span>
                <span>Team</span>
                <span>Meeting-Pläne</span>
                <span style={{ textAlign: 'right' }}>Cap · Urlaub</span>
                <span style={{ textAlign: 'right' }}>Verfügbar</span>
              </div>
              <ul className="res-list">
                {teamMembers.map(m => (
                  <MemberReadRow
                    key={m.id}
                    member={m}
                    teams={teams}
                    shortMap={shortMap}
                    meetingPlans={meetingPlans}
                    onClick={() => setEditingMemberId(m.id)}
                    t={t}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </>)}

      {/* ═══════════════ VACATIONS ═══════════════ */}
      {section === 'vacations' && (<>
        <p className="helper" style={{ marginBottom: 10 }}>{t('rv.vacHint')}</p>
        {vacations.length === 0
          ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>—</div>
          : vacYears.map(year => (
              <div key={year} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--b)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--tx2)' }}>{year}</span>
                  <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{vacsByYear[year].length}</span>
                </div>
                <div className="res-row res-row-vac res-row-header">
                  <span />
                  <span>Person</span>
                  <span>Zeitraum</span>
                  <span>Notiz</span>
                  <span />
                </div>
                <ul className="res-list">
                  {vacsByYear[year].map(v => {
                    const origIdx = vacations.indexOf(v);
                    const mem = members.find(m => m.id === v.person);
                    const team = mem ? teams.find(tm => tm.id === mem.team) : null;
                    const range = [v.from, v.to].filter(Boolean).join(' – ') || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.vacDateRange')}</span>;
                    return (
                      <li key={origIdx} className="res-row res-row-vac" onClick={() => setEditingVacIdx(origIdx)}>
                        <span className="res-avatar" style={{ background: team?.color || 'var(--ac)' }}>
                          {initials(mem?.name || v.person || '?')}
                        </span>
                        <span className="res-row-name">{mem?.name || v.person || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.choosePerson')}</span>}</span>
                        <span className="res-row-meta">{range}</span>
                        <span className="res-row-meta" style={{ opacity: .7, fontStyle: 'italic', fontFamily: 'var(--font)' }}>{v.note || ''}</span>
                        <span />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
      </>)}

      {/* ═══════════════ MODALS ═══════════════ */}
      {editingTeam && (
        <TeamEditModal
          team={editingTeam}
          idx={editingTeamIdx}
          meetingPlans={meetingPlans}
          onUpd={onTeamUpd}
          onDel={onTeamDel}
          onClose={() => setEditingTeamId(null)}
          t={t}
        />
      )}
      {editingMember && (
        <MemberEditModal
          member={editingMember}
          teams={teams}
          shortMap={shortMap}
          meetingPlans={meetingPlans}
          onUpd={onUpd}
          onClone={onClone}
          onDel={id => { onDel(id); setEditingMemberId(null); }}
          onClose={() => setEditingMemberId(null)}
          t={t}
        />
      )}
      {editingVacIdx != null && vacations[editingVacIdx] && (
        <VacationEditModal
          vacation={vacations[editingVacIdx]}
          members={members}
          onUpd={patch => onVac(vacations.map((x, j) => j === editingVacIdx ? { ...x, ...patch } : x))}
          onDel={() => { onVac(vacations.filter((_, j) => j !== editingVacIdx)); setEditingVacIdx(null); }}
          onClose={() => setEditingVacIdx(null)}
          t={t}
        />
      )}
      {editingPlan && (
        <MeetingPlanEditModal
          plan={editingPlan}
          onUpd={p => onMeetingPlansUpd(meetingPlans.map(x => x.id === p.id ? p : x))}
          onDel={pid => onMeetingPlansUpd(meetingPlans.filter(x => x.id !== pid))}
          onClose={() => setEditingPlanId(null)}
        />
      )}
    </div>
  );
}

/* ─── VacationEditModal ───────────────────────────────────────────────── */
function VacationEditModal({ vacation, members, onUpd, onDel, onClose, t }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{t('rv.editVacation')}</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose} title={t('rv.close')}>×</button>
        </div>
        <div className="field">
          <label>{t('rv.person')}</label>
          <SearchSelect
            value={vacation.person}
            options={members.map(m => ({ id: m.id, label: m.name || m.id }))}
            onSelect={val => onUpd({ person: val })}
            placeholder={t('rv.choosePerson')}
          />
        </div>
        <div className="frow">
          <div className="field">
            <label>{t('rv.vacFrom')}</label>
            <LazyInput type="date" value={vacation.from || ''} onCommit={val => onUpd({ from: val })} />
          </div>
          <div className="field">
            <label>{t('rv.vacTo')}</label>
            <LazyInput type="date" value={vacation.to || ''} onCommit={val => onUpd({ to: val })} />
          </div>
        </div>
        <div className="field">
          <label>{t('rv.note')}</label>
          <LazyInput value={vacation.note || ''} onCommit={val => onUpd({ note: val })} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-danger btn-xs" onClick={onDel}>{t('rv.remove')}</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={onClose}>{t('rv.close')}</button>
        </div>
      </div>
    </div>
  );
}
