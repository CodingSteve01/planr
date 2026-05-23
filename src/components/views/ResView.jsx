import { useState, useEffect, useMemo, memo } from "react";
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { LazyInput } from '../shared/LazyInput.jsx';
import { buildMemberShortMap } from '../../App.jsx';
import { useT } from '../../i18n.jsx';
import { deriveCap, capBreakdown, FTE_HOURS, sumMeetingHours, memberAtDate } from '../../utils/capacity.js';
import { iso, localDate } from '../../utils/date.js';

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

        {/* Time-shifted capacity changes — schedulable cap/weeklyHours
            overrides effective from a given date onward. Scheduler picks
            the latest entry whose `from` is on or before each task's start. */}
        <CapChangesField member={member} onUpd={onUpd} t={t} />

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
function MeetingPlanReadRow({ plan, teamCount, memberCount, totalHours, onClick, t }) {
  return (
    <tr onClick={onClick}>
      <td className="res-td-avatar"><span className="res-dot" style={{ background: 'var(--ac)' }} /></td>
      <td className="res-row-name">{plan.name || t('rv.planUnnamed')}</td>
      <td className="res-row-meta">
        {t('rv.planTermCount', (plan.meetings || []).length, totalHours.toFixed(2))}
      </td>
      <td className="res-row-meta" style={{ textAlign: 'right' }}>{t('rv.planAssignCount', teamCount, memberCount)}</td>
    </tr>
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
function TeamReadRow({ team, memberCount, meetingPlans = [], teamLockCount = 0, onClick, t }) {
  const plans = (team.meetingPlanIds || [])
    .map(id => meetingPlans.find(p => p.id === id))
    .filter(Boolean);
  return (
    <tr onClick={onClick}>
      <td className="res-td-avatar"><span className="res-dot" style={{ background: team.color || 'var(--ac)' }} /></td>
      <td className="res-row-name">
        {team.name || team.id}
        {teamLockCount > 0 && (
          <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, border: '1px solid var(--am)', background: 'rgba(245,158,11,.10)', color: 'var(--am)' }}
            data-htip={t('rv.teamLockTip', teamLockCount)}>⚞⚟ {teamLockCount}</span>
        )}
      </td>
      <td>
        <span className="res-plan-tags">
          {plans.map(p => (
            <span key={p.id} className="res-plan-tag res-plan-tag-team" title="Meeting-Plan (Team-weit)">{p.name}</span>
          ))}
        </span>
      </td>
      <td className="res-row-meta" style={{ textAlign: 'right' }}>{memberCount} {t('rv.members')}</td>
    </tr>
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

function MemberReadRow({ member, teams, shortMap, meetingPlans = [], scheduled = [], weeks = [], onClick, t }) {
  const team = teams.find(t => t.id === member.team);
  const cap = Math.round(deriveCap(member, { plans: meetingPlans, teams }) * 100);
  const vac = member.vac ?? 25;
  // Weekly utilisation: sum scheduled effort assigned to this member per
  // week, divided by their weekly budget (cap × 5 person-days). Peaks
  // above 100% surface as a red chip — exactly what the no-dep-bypass
  // is meant to make visible.
  const dailyCap = deriveCap(member, { plans: meetingPlans, teams });
  const weeklyBudget = dailyCap * 5;
  let peakPct = 0, peakWi = -1;
  if (weeklyBudget > 0 && weeks.length) {
    const perWeek = new Array(weeks.length).fill(0);
    for (const s of scheduled) {
      const onPerson = s.personId === member.id || (s.assign || []).includes(member.id);
      if (!onPerson) continue;
      if (typeof s.startWi !== 'number' || s.startWi < 0) continue;
      const span = Math.max(1, (s.endWi - s.startWi + 1));
      const weekly = (s.effort || 0) / span;
      for (let w = s.startWi; w <= s.endWi && w < perWeek.length; w++) {
        if (w >= 0) perWeek[w] += weekly;
      }
    }
    for (let w = 0; w < perWeek.length; w++) {
      const pct = (perWeek[w] / weeklyBudget) * 100;
      if (pct > peakPct) { peakPct = pct; peakWi = w; }
    }
  }
  peakPct = Math.round(peakPct);
  const peakWeek = peakWi >= 0 && weeks[peakWi] ? weeks[peakWi] : null;
  const peakLabel = peakWeek?.mon ? `KW${weekNum(peakWeek.mon)}` : '';
  const overbookSeverity = peakPct >= 150 ? 're' : peakPct >= 110 ? 'am' : null;
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
    <tr onClick={onClick} style={{ opacity: offboarded ? 0.5 : 1 }}>
      <td className="res-td-avatar"><Avatar member={member} teams={teams} /></td>
      <td className="res-row-name">
        {member.name || member.id}
        {shortMap[member.id] && (
          <span className="res-row-short" data-htip={t('rv.shortHint')}>
            {shortMap[member.id]}
          </span>
        )}
        {offboarded && (
          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--re)', color: '#fff' }}
            data-htip={t('rv.offboardedOn', member.end)}>{t('rv.offboarded')}</span>
        )}
        {offboardingSoon && (
          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--am)', color: '#fff' }}
            data-htip={t('rv.leavingOn', member.end)}>{t('rv.leavingSoon')}</span>
        )}
      </td>
      <td>
        {team ? (
          <span className="res-team-badge" style={{ borderColor: team.color, color: team.color }}>
            {team.name}
          </span>
        ) : null}
      </td>
      <td>
        <span className="res-plan-tags">
          {planObjs.map(p => (
            <span key={p.id}
              className={`res-plan-tag${teamPlanIds.has(p.id) ? ' res-plan-tag-team' : ''}`}>
              {p.name}
            </span>
          ))}
        </span>
      </td>
      <td className="res-row-meta" style={{ textAlign: 'right' }}>
        {cap}% · {vac}d
        {overbookSeverity && (
          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                         background: `var(--${overbookSeverity})`, color: overbookSeverity === 'am' ? '#1a1a1a' : '#fff' }}
            data-htip={`Peak weekly load: ${peakPct}% in ${peakLabel}. Person is overbooked there.`}>
            ⚠ {peakPct}%
          </span>
        )}
      </td>
      <td className="res-row-meta" style={{ textAlign: 'right' }}>{dates || ''}</td>
    </tr>
  );
}

function weekNum(d) {
  // ISO week number — Mon-based.
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + 4 - (x.getDay() || 7));
  const yearStart = new Date(x.getFullYear(), 0, 1);
  return Math.ceil((((x - yearStart) / 86400000) + 1) / 7);
}

function loadTone(percent) {
  if (!Number.isFinite(percent) || percent <= 0) return { bg: 'rgba(148,163,184,.08)', fg: 'var(--tx3)', bd: 'rgba(148,163,184,.22)' };
  if (percent < 50) return { bg: 'rgba(59,130,246,.16)', fg: '#93c5fd', bd: 'rgba(59,130,246,.45)' };
  if (percent < 90) return { bg: 'rgba(16,185,129,.18)', fg: '#86efac', bd: 'rgba(16,185,129,.50)' };
  if (percent <= 110) return { bg: 'rgba(245,158,11,.24)', fg: '#fbbf24', bd: 'rgba(245,158,11,.60)' };
  return { bg: 'rgba(239,68,68,.30)', fg: '#fca5a5', bd: 'rgba(239,68,68,.78)' };
}

function buildResourceLoadMatrix({ members, teams, vacations, meetingPlans, scheduled, weeks }) {
  const result = {};
  const memberById = Object.fromEntries((members || []).map(m => [m.id, m]));
  const vacByPerson = {};
  (vacations || []).forEach(v => {
    if (!v?.person || !v.from || !v.to) return;
    (vacByPerson[v.person] ||= []).push(v);
  });
  const isActiveMemberDay = (member, date) => {
    if (!member) return false;
    const d = date instanceof Date ? date : localDate(date);
    if (member.start && d < localDate(member.start)) return false;
    if (member.end && d > localDate(member.end)) return false;
    return true;
  };
  const onVacation = (personId, date) => {
    const d = date instanceof Date ? date : localDate(date);
    return (vacByPerson[personId] || []).some(v => d >= localDate(v.from) && d <= localDate(v.to));
  };
  const ensure = personId => {
    if (result[personId]) return result[personId];
    result[personId] = (weeks || []).map((week, wi) => ({
      wi,
      kw: week.kw || weekNum(week.mon),
      start: week.mon ? iso(week.mon) : '',
      availability: 0,
      load: 0,
      percent: 0,
      tasks: [],
    }));
    return result[personId];
  };

  (members || []).forEach(member => {
    const rows = ensure(member.id);
    (weeks || []).forEach((week, wi) => {
      let availability = 0;
      (week.wds || []).forEach(date => {
        if (!isActiveMemberDay(member, date) || onVacation(member.id, date)) return;
        availability += Math.max(0, deriveCap(memberAtDate(member, date), { plans: meetingPlans, teams }));
      });
      rows[wi].availability = availability;
    });
  });

  (scheduled || []).forEach(item => {
    if (!item.startD || !item.endD) return;
    const personIds = [...new Set([item.personId, ...(item.assign || [])].filter(id => memberById[id]))];
    if (!personIds.length) return;
    const start = item.startD instanceof Date ? item.startD : localDate(item.startD);
    const end = item.endD instanceof Date ? item.endD : localDate(item.endD);
    const slots = [];
    (weeks || []).forEach((week, wi) => {
      (week.wds || []).forEach(date => {
        if (date >= start && date <= end) slots.push({ wi, date });
      });
    });
    if (!slots.length) return;
    const effort = Math.max(0, item.effort || item.best || 0);
    const loadPerSlot = effort / Math.max(1, slots.length);
    personIds.forEach(personId => {
      const rows = ensure(personId);
      const taskLoadByWeek = new Map();
      slots.forEach(({ wi }) => {
        rows[wi].load += loadPerSlot;
        taskLoadByWeek.set(wi, (taskLoadByWeek.get(wi) || 0) + loadPerSlot);
      });
      taskLoadByWeek.forEach((load, wi) => {
        rows[wi].tasks.push({
          id: item.treeId || item.id,
          name: item.name || item.id,
          load,
          status: item.status || 'open',
          start: item.startD ? iso(item.startD) : '',
          end: item.endD ? iso(item.endD) : '',
        });
      });
    });
  });

  Object.values(result).forEach(rows => rows.forEach(row => {
    row.percent = row.availability > 0
      ? Math.round((row.load / row.availability) * 100)
      : row.load > 0 ? 999 : 0;
    row.tasks.sort((a, b) => b.load - a.load || a.id.localeCompare(b.id, undefined, { numeric: true }));
  }));
  return result;
}

function htmlEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ResourceLoadMatrix({ members, teams, weeks, loadByPerson, t }) {
  const teamById = Object.fromEntries((teams || []).map(team => [team.id, team]));
  const weekCols = weeks || [];
  const overloads = (members || []).reduce((sum, member) => (
    sum + (loadByPerson[member.id] || []).filter(cell => cell.percent > 110).length
  ), 0);
  const legend = [
    [25, t('rv.loadLegendUnder')],
    [70, t('rv.loadLegendOk')],
    [100, t('rv.loadLegendFull')],
    [125, t('rv.loadLegendOver')],
  ];
  const fmtDays = value => `${(Math.round((Number(value) || 0) * 10) / 10).toFixed(1).replace(/\.0$/, '')}d`;
  const cellTip = (member, cell) => {
    const tasks = cell.tasks.length
      ? cell.tasks.slice(0, 12).map(task => {
          const status = task.status ? ` · ${htmlEsc(task.status)}` : '';
          const dates = task.start || task.end ? ` · ${htmlEsc(task.start)}→${htmlEsc(task.end)}` : '';
          return `<div style="margin-top:3px"><b>${htmlEsc(task.id)}</b> ${htmlEsc(task.name)}<span style="opacity:.75"> · ${fmtDays(task.load)}${status}${dates}</span></div>`;
        }).join('')
      : `<div style="margin-top:4px;opacity:.75">${htmlEsc(t('rv.loadNoTasks'))}</div>`;
    const more = cell.tasks.length > 12 ? `<div style="margin-top:3px;opacity:.75">+${cell.tasks.length - 12}</div>` : '';
    const capLabel = cell.availability > 0 ? fmtDays(cell.availability) : htmlEsc(t('rv.loadUnavailable'));
    return `html:<div><b>${htmlEsc(t('rv.loadPersonWeekTip', member.name || member.id, cell.kw, cell.start))}</b><br/>${htmlEsc(t('rv.loadPlanned'))}: ${fmtDays(cell.load)} · ${htmlEsc(t('rv.loadCapacity'))}: ${capLabel} · ${cell.percent}%<br/><div style="margin-top:6px;color:var(--tx2)">${htmlEsc(t('rv.loadTasks'))}</div>${tasks}${more}</div>`;
  };

  if (!(members || []).length || !weekCols.length) {
    return (
      <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>
        —
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="helper" style={{ margin: 0, flex: '1 1 320px' }}>{t('rv.loadHint')}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: overloads > 0 ? 'var(--re)' : 'var(--tx3)' }}>
          {t('rv.loadOverCount', overloads)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {legend.map(([pct, label]) => {
          const tone = loadTone(pct);
          return (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--tx3)' }}>
              <span style={{ width: 18, height: 9, borderRadius: 2, background: tone.bg, border: `1px solid ${tone.bd}` }} />
              {label}
            </span>
          );
        })}
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--b)', borderRadius: 'var(--r)', background: 'var(--bg2)' }}>
        <table className="res-table" style={{ minWidth: Math.max(820, 168 + weekCols.length * 86), borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg2)', minWidth: 170 }}>
                {t('rv.person')}
              </th>
              {weekCols.map((week, wi) => (
                <th key={`${week.mon || ''}-${wi}`} style={{ width: 86, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{t('rv.loadWeek')} {week.kw || weekNum(week.mon)}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>{week.mon ? iso(week.mon).slice(5) : ''}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(members || []).map(member => {
              const team = teamById[member.team];
              const cells = loadByPerson[member.id] || [];
              return (
                <tr key={member.id}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg2)', minWidth: 170 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <Avatar member={member} teams={teams} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.name || member.id}
                        </div>
                        <div style={{ fontSize: 10, color: team?.color || 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {team?.name || t('noTeam')}
                        </div>
                      </div>
                    </div>
                  </td>
                  {weekCols.map((week, wi) => {
                    const cell = cells[wi] || { availability: 0, load: 0, percent: 0, tasks: [], kw: week.kw || weekNum(week.mon), start: week.mon ? iso(week.mon) : '' };
                    const tone = loadTone(cell.percent);
                    const overloaded = cell.percent > 110;
                    const empty = cell.load <= 0;
                    return (
                      <td key={`${member.id}-${wi}`} style={{ padding: 3, minWidth: 86 }}>
                        <div
                          data-htip={cellTip(member, cell)}
                          style={{
                            minHeight: 38,
                            borderRadius: 4,
                            border: `1px solid ${tone.bd}`,
                            background: tone.bg,
                            color: tone.fg,
                            padding: '4px 5px',
                            cursor: 'help',
                            boxShadow: overloaded ? 'inset 0 0 0 1px rgba(239,68,68,.45)' : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 11 }}>
                              {cell.percent}%
                            </span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: empty ? 'var(--tx3)' : 'inherit', opacity: empty ? .75 : .9 }}>
                              {cell.tasks.length || ''}
                            </span>
                          </div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, marginTop: 3, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
                            {fmtDays(cell.load)} / {cell.availability > 0 ? fmtDays(cell.availability) : '0d'}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────── */
function ResViewImpl({ members, teams, vacations, meetingPlans = [], teamFilter = '', personFilter = '', tree = [], scheduled = [], weeks = [], onMeetingPlansUpd, onUpd, onAdd, onClone, onDel, onVac, onTeamUpd, onTeamAdd, onTeamDel }) {
  const { t } = useT();
  const shortMap = buildMemberShortMap(members);

  const [section, setSection] = useState('members');
  const [editingTeamId, setEditingTeamId]     = useState(null);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editingVacIdx, setEditingVacIdx]     = useState(null);
  const [editingPlanId, setEditingPlanId]     = useState(null);
  const editingPlan = editingPlanId != null ? meetingPlans.find(p => p.id === editingPlanId) : null;

  // Apply the global topbar filters. personFilter pins to one member; the
  // visible team set narrows to that member's team. teamFilter pins the team
  // and the member set narrows to that team. Filters intersect.
  const fMembers = members.filter(m => {
    if (personFilter && m.id !== personFilter) return false;
    if (teamFilter && (m.team || '') !== teamFilter) return false;
    return true;
  });
  const visibleMemberIds = new Set(fMembers.map(m => m.id));
  const fTeams = teams.filter(tm => {
    if (teamFilter && tm.id !== teamFilter) return false;
    if (personFilter) {
      const p = members.find(x => x.id === personFilter);
      if (p && p.team !== tm.id) return false;
    }
    return true;
  });
  const fVacations = vacations.filter(v => !personFilter && !teamFilter ? true : visibleMemberIds.has(v.person));
  const fMeetingPlans = (personFilter || teamFilter)
    ? meetingPlans.filter(p => {
        const onTeam = fTeams.some(tm => (tm.meetingPlanIds || []).includes(p.id));
        const onMember = fMembers.some(m => (m.meetingPlanIds || []).includes(p.id));
        return onTeam || onMember;
      })
    : meetingPlans;

  const memberCountForTeam = tid => fMembers.filter(m => m.team === tid).length;

  const editingTeam   = editingTeamId   != null ? teams.find(tm => tm.id === editingTeamId)   : null;
  const editingTeamIdx = editingTeam    != null ? teams.indexOf(editingTeam)                   : -1;
  const editingMember = editingMemberId != null ? members.find(m => m.id === editingMemberId)  : null;

  // Local vacation filters — narrow on top of the global topbar filters.
  // Persisted across tab switches so a long vacation list stays focused on
  // the slice the user is currently triaging.
  const [vacMember, setVacMember] = useState(() => { try { return localStorage.getItem('planr_vac_member') || ''; } catch { return ''; } });
  const [vacYear, setVacYear] = useState(() => { try { return localStorage.getItem('planr_vac_year') || ''; } catch { return ''; } });
  useEffect(() => { try { localStorage.setItem('planr_vac_member', vacMember); } catch { /* ignore */ } }, [vacMember]);
  useEffect(() => { try { localStorage.setItem('planr_vac_year', vacYear); } catch { /* ignore */ } }, [vacYear]);

  /* sort vacations: latest first within year */
  const sortedVacs = [...fVacations]
    .filter(v => !vacMember || v.person === vacMember)
    .filter(v => !vacYear || (v.from || '').slice(0, 4) === vacYear)
    .sort((a, b) => (a.from || '') < (b.from || '') ? 1 : -1);
  const vacsByYear = sortedVacs.reduce((acc, v) => {
    const y = (v.from || '').slice(0, 4) || '—';
    (acc[y] ||= []).push(v);
    return acc;
  }, {});
  const vacYears = Object.keys(vacsByYear).sort((a, b) => b.localeCompare(a));
  // All available years across the unfiltered set so the year dropdown
  // doesn't shrink as the user narrows the list.
  const allVacYears = [...new Set(fVacations.map(v => (v.from || '').slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  // Drop stale filter values when the underlying option is gone.
  useEffect(() => { if (vacMember && !fMembers.some(m => m.id === vacMember)) setVacMember(''); }, [fMembers, vacMember]);
  useEffect(() => { if (vacYear && !allVacYears.includes(vacYear)) setVacYear(''); }, [allVacYears, vacYear]);

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
          ['plans', `${t('rv.plans')} (${fMeetingPlans.length})`],
          ['teams', `${t('rv.teams')} (${fTeams.length})`],
          ['members', `${t('rv.members')} (${fMembers.length})`],
          ['vacations', `${t('rv.vacations')} (${fVacations.length})`],
        ].map(([k, l]) =>
          <button key={k} className={`btn btn-xs ${section === k ? 'btn-pri' : 'btn-sec'}`}
            style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSection(k)}>{l}</button>)}
        <div style={{ flex: 1 }} />
        {section === 'teams' && <button className="btn btn-sec btn-sm" onClick={onTeamAdd}>{t('rv.addTeam')}</button>}
        {section === 'vacations' && <button className="btn btn-sec btn-sm" onClick={addVacation}>{t('rv.addVacation')}</button>}
        {section === 'plans' && <button className="btn btn-sec btn-sm" onClick={() => {
          const id = 'mp_' + Math.random().toString(36).slice(2, 8);
          onMeetingPlansUpd([...meetingPlans, { id, name: t('rv.newPlan'), meetings: [] }]);
          setEditingPlanId(id);
        }}>{t('rv.addPlan')}</button>}
      </div>

      {/* ═══════════════ MEETING-PLÄNE ═══════════════ */}
      {section === 'plans' && (
        fMeetingPlans.length === 0
          ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>
              {t('rv.plansEmpty')}
            </div>
          : (
              <table className="res-table">
                <colgroup>
                  <col style={{ width: 30 }} />
                  <col />
                  <col style={{ width: '40%' }} />
                  <col style={{ width: 200 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th />
                    <th>{t('rv.name')}</th>
                    <th>{t('rv.appointments')}</th>
                    <th style={{ textAlign: 'right' }}>{t('rv.assigns')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fMeetingPlans.map(pl => {
                    const teamCount = fTeams.filter(tm => (tm.meetingPlanIds || []).includes(pl.id)).length;
                    const memberCount = fMembers.filter(m => (m.meetingPlanIds || []).includes(pl.id)).length;
                    const totalH = sumMeetingHours(pl.meetings || []);
                    return (
                      <MeetingPlanReadRow key={pl.id} plan={pl}
                        teamCount={teamCount} memberCount={memberCount} totalHours={totalH}
                        onClick={() => setEditingPlanId(pl.id)} t={t} />
                    );
                  })}
                </tbody>
              </table>
            )
      )}

      {/* ═══════════════ TEAMS ═══════════════ */}
      {section === 'teams' && (
        fTeams.length === 0
          ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('rv.noTeams') || '—'}</div>
          : (
              <table className="res-table">
                <colgroup>
                  <col style={{ width: 30 }} />
                  <col style={{ width: 220 }} />
                  <col />
                  <col style={{ width: 120 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th />
                    <th>{t('rv.name')}</th>
                    <th>{t('rv.plans')}</th>
                    <th style={{ textAlign: 'right' }}>{t('rv.members')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fTeams.map(tm => {
                    // Count leaves locked to this team so users see at a
                    // glance which teams have whole-team-blocking work in
                    // the pipeline.
                    const lockCount = (tree || []).filter(r => r.teamLock && r.team === tm.id && r.status !== 'done').length;
                    return (
                      <TeamReadRow
                        key={tm.id}
                        team={tm}
                        memberCount={memberCountForTeam(tm.id)}
                        meetingPlans={meetingPlans}
                        teamLockCount={lockCount}
                        onClick={() => setEditingTeamId(tm.id)}
                        t={t}
                      />
                    );
                  })}
                </tbody>
              </table>
            )
      )}

      {/* ═══════════════ MEMBERS ═══════════════ */}
      {section === 'members' && (<>
        {!fMembers.length && !fTeams.length && (
          <div className="empty">
            <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
            {t('rv.noMembers')}
            <p>{t('rv.noMembersHint')}</p>
          </div>
        )}
        {[...fTeams, { id: '', name: t('noTeam'), color: 'var(--tx3)' }].map(tm => {
          const teamMembers = fMembers.filter(m => (m.team || '') === tm.id);
          if (!teamMembers.length && tm.id === '') return null;
          if (teamFilter && tm.id && tm.id !== teamFilter) return null;
          return (
            <div key={tm.id || '__none__'} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${tm.color || 'var(--b)'}` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: tm.color || 'var(--tx2)' }}>{tm.name}</span>
                <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{teamMembers.length}</span>
                {tm.id && <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => onAdd(tm.id)}>+ {t('rv.addPerson')}</button>}
              </div>
              <table className="res-table">
                <colgroup>
                  <col style={{ width: 30 }} />
                  <col style={{ width: '32%' }} />
                  <col style={{ width: 120 }} />
                  <col />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 140 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th />
                    <th>{t('rv.name')}</th>
                    <th>{t('rv.team')}</th>
                    <th>{t('rv.plans')}</th>
                    <th style={{ textAlign: 'right' }} data-htip={t('rv.capVacTip')}>{t('rv.capVac')}</th>
                    <th style={{ textAlign: 'right' }} data-htip={t('rv.windowTip')}>{t('rv.window')}</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map(m => (
                    <MemberReadRow
                      key={m.id}
                      member={m}
                      teams={teams}
                      shortMap={shortMap}
                      meetingPlans={meetingPlans}
                      scheduled={scheduled}
                      weeks={weeks}
                      onClick={() => setEditingMemberId(m.id)}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </>)}

      {/* ═══════════════ VACATIONS ═══════════════ */}
      {section === 'vacations' && (<>
        <p className="helper" style={{ marginBottom: 10 }}>{t('rv.vacHint')}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ width: 200 }}>
            <SearchSelect value={vacMember}
              options={fMembers.map(m => ({ id: m.id, label: m.name || m.id }))}
              onSelect={setVacMember}
              placeholder={t('tv.allPeople')}
              allowEmpty emptyLabel={t('tv.allPeople')} />
          </div>
          <select value={vacYear} onChange={e => setVacYear(e.target.value)}
            style={{ padding: '5px 8px', fontSize: 11, background: 'var(--bg3)', color: 'var(--tx)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', minWidth: 100 }}>
            <option value="">{t('rv.allYears')}</option>
            {allVacYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {(vacMember || vacYear) && (
            <button className="btn btn-ghost btn-xs" onClick={() => { setVacMember(''); setVacYear(''); }}
              data-htip={t('rv.clearFilters')}
              style={{ padding: '2px 7px', fontSize: 11 }}>×</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
            {sortedVacs.length} / {fVacations.length}
          </span>
        </div>
        {sortedVacs.length === 0
          ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>—</div>
          : vacYears.map(year => (
              <div key={year} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--b)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--tx2)' }}>{year}</span>
                  <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{vacsByYear[year].length}</span>
                </div>
                <table className="res-table">
                  <colgroup>
                    <col style={{ width: 30 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 180 }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th />
                      <th>{t('rv.person')}</th>
                      <th>{t('rv.period')}</th>
                      <th>{t('rv.note')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacsByYear[year].map(v => {
                      const origIdx = vacations.indexOf(v);
                      const mem = members.find(m => m.id === v.person);
                      const team = mem ? teams.find(tm => tm.id === mem.team) : null;
                      const range = [v.from, v.to].filter(Boolean).join(' – ') || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.vacDateRange')}</span>;
                      return (
                        <tr key={origIdx} onClick={() => setEditingVacIdx(origIdx)}>
                          <td className="res-td-avatar">
                            <span className="res-avatar" style={{ background: team?.color || 'var(--ac)' }}>
                              {initials(mem?.name || v.person || '?')}
                            </span>
                          </td>
                          <td className="res-row-name">{mem?.name || v.person || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.choosePerson')}</span>}</td>
                          <td className="res-row-meta">{range}</td>
                          <td className="res-row-meta" style={{ opacity: .7, fontStyle: 'italic', fontFamily: 'var(--font)' }}>{v.note || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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

// ─── CapChangesField ─────────────────────────────────────────────────────────
// Minimal timeline editor for scheduled capacity changes. Each row is an
// effective-from date plus optional cap % or weekly-hours override; the
// scheduler picks the latest entry on/before each task's start week. Add /
// remove inline, sorted by date.
function CapChangesField({ member, onUpd, t }) {
  const entries = Array.isArray(member.capChanges) ? member.capChanges : [];
  const update = (next) => {
    const sorted = [...next].filter(c => c && c.from)
      .sort((a, b) => a.from.localeCompare(b.from));
    onUpd({ ...member, capChanges: sorted });
  };
  const addRow = () => {
    const today = new Date().toISOString().slice(0, 10);
    update([...entries, { from: today, cap: member.cap ?? 1 }]);
  };
  return (
    <div style={{ marginTop: 14, padding: '8px 10px', border: '1px solid var(--b)', borderRadius: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>{t('rv.capPlanTitle')}</span>
        <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--tx3)' }}>{t('rv.capPlanHint')}</span>
        <button className="btn btn-sec btn-xs" style={{ marginLeft: 'auto', padding: '2px 7px', fontSize: 10 }}
          onClick={addRow}>+ {t('rv.capPlanAdd')}</button>
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 10, color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.capPlanEmpty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 90px 100px 28px', gap: 6, alignItems: 'center' }}>
              <input type="date" value={c.from || ''}
                onChange={e => { const next = [...entries]; next[i] = { ...c, from: e.target.value }; update(next); }}
                style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} />
              <input type="number" min="0" max="200" step="5" placeholder="%"
                value={typeof c.cap === 'number' ? Math.round(c.cap * 100) : ''}
                onChange={e => { const v = e.target.value === '' ? undefined : parseFloat(e.target.value) / 100; const next = [...entries]; next[i] = { ...c, cap: v }; update(next); }}
                style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} />
              <input type="number" min="0" max="80" step="0.5" placeholder="h/w"
                value={typeof c.weeklyHours === 'number' ? c.weeklyHours : ''}
                onChange={e => { const v = e.target.value === '' ? undefined : parseFloat(e.target.value); const next = [...entries]; next[i] = { ...c, weeklyHours: v }; update(next); }}
                style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} />
              <button className="btn btn-ghost btn-xs" onClick={() => { update(entries.filter((_, j) => j !== i)); }}
                style={{ color: 'var(--re)', padding: '0 4px', fontSize: 12 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const ResView = memo(ResViewImpl);
