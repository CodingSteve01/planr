import { useState, useEffect } from 'react';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { LazyInput } from '../shared/LazyInput.jsx';
import { buildMemberShortMap } from '../../App.jsx';
import { useT } from '../../i18n.jsx';

/* ─── helpers ─────────────────────────────────────────────────────────── */
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

/* ─── TeamEditModal ───────────────────────────────────────────────────── */
function TeamEditModal({ team, idx, onUpd, onDel, onClose, t }) {
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
function MemberEditModal({ member, teams, shortMap, onUpd, onClone, onDel, onClose, t }) {
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
            [t('rv.capacityPct'), <LazyInput type="number" min="0" max="100" step="5" value={Math.round((member.cap || 1) * 100)} onCommit={v => onUpd({ ...member, cap: v / 100 })} />],
            [t('rv.vacDays'),    <LazyInput type="number" min="0" max="40" value={member.vac || 25} onCommit={v => onUpd({ ...member, vac: v })} />],
            [t('rv.startDate'),  <LazyInput type="date" value={member.start || ''} onCommit={v => onUpd({ ...member, start: v })} />],
            [t('rv.endDate'),    <LazyInput type="date" value={member.end || ''} onCommit={v => onUpd({ ...member, end: v })} />],
          ].map(([l, c]) => (
            <div key={l} className="rf">
              <label>{l}</label>{c}
            </div>
          ))}
        </div>

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

/* ─── Teams ───────────────────────────────────────────────────────────── */
function TeamReadRow({ team, memberCount, onClick, t }) {
  return (
    <li className="res-row" onClick={onClick}>
      <span className="res-dot" style={{ background: team.color || 'var(--ac)' }} />
      <span className="res-row-name">{team.name || team.id}</span>
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

function MemberReadRow({ member, teams, shortMap, onClick, t }) {
  const team = teams.find(t => t.id === member.team);
  const cap = Math.round((member.cap || 1) * 100);
  const vac = member.vac ?? 25;
  const dates = [member.start, member.end].filter(Boolean).join(' – ');
  return (
    <li className="res-row" onClick={onClick}>
      <Avatar member={member} teams={teams} />
      <span className="res-row-name">
        {member.name || member.id}
        {shortMap[member.id] && (
          <span className="res-row-short" data-htip="Auto-generated short name (used in Markdown)">
            {shortMap[member.id]}
          </span>
        )}
      </span>
      {team && (
        <span className="res-team-badge" style={{ borderColor: team.color, color: team.color }}>
          {team.name}
        </span>
      )}
      <span className="res-row-meta">{cap}% · {vac}d</span>
      {dates && <span className="res-row-meta">{dates}</span>}
    </li>
  );
}

/* ─── Main component ──────────────────────────────────────────────────── */
export function ResView({ members, teams, vacations, onUpd, onAdd, onClone, onDel, onVac, onTeamUpd, onTeamAdd, onTeamDel }) {
  const { t } = useT();
  const shortMap = buildMemberShortMap(members);

  const [editingTeamId, setEditingTeamId]     = useState(null);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editingVacIdx, setEditingVacIdx]     = useState(null);

  const memberCountForTeam = tid => members.filter(m => m.team === tid).length;

  const editingTeam   = editingTeamId   != null ? teams.find(tm => tm.id === editingTeamId)   : null;
  const editingTeamIdx = editingTeam    != null ? teams.indexOf(editingTeam)                   : -1;
  const editingMember = editingMemberId != null ? members.find(m => m.id === editingMemberId)  : null;

  /* sort vacations by start date for display */
  const sortedVacs = [...vacations].sort((a, b) => (a.from || '') < (b.from || '') ? -1 : 1);

  return (
    <div>
      {/* ═══════════════ TEAMS ═══════════════ */}
      <section className="res-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div className="section-h" style={{ margin: 0 }}>{t('rv.teams')}</div>
          <button className="btn btn-sec btn-sm" onClick={onTeamAdd}>{t('rv.addTeam')}</button>
        </div>
        <ul className="res-list">
          {teams.map((tm, i) => (
            <TeamReadRow
              key={tm.id}
              team={tm}
              memberCount={memberCountForTeam(tm.id)}
              onClick={() => setEditingTeamId(tm.id)}
              t={t}
            />
          ))}
        </ul>
      </section>

      <hr className="divider" />

      {/* ═══════════════ MEMBERS ═══════════════ */}
      <section className="res-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div className="section-h" style={{ margin: 0 }}>{t('rv.members')}</div>
          {!teams.length && <button className="btn btn-sec btn-sm" onClick={() => onAdd()}>{t('rv.addPerson')}</button>}
        </div>
        {!members.length && !teams.length && (
          <div className="empty">
            <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
            {t('rv.noMembers')}
            <p>{t('rv.noMembersHint')}</p>
          </div>
        )}
        {/* Grouped by team — each group has its own "+ Add person to <team>" button */}
        {[...teams, { id: '', name: t('noTeam'), color: 'var(--tx3)' }].map(tm => {
          const teamMembers = members.filter(m => (m.team || '') === tm.id);
          if (!teamMembers.length && tm.id === '') return null;
          return (
            <div key={tm.id || '__none__'} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingLeft: 2 }}>
                <span className="res-dot" style={{ background: tm.color || 'var(--ac)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--tx2)' }}>{tm.name}</span>
                <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{teamMembers.length}</span>
                {tm.id && <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => onAdd(tm.id)}>+ {t('rv.addPerson')}</button>}
              </div>
              <ul className="res-list">
                {teamMembers.map(m => (
                  <MemberReadRow
                    key={m.id}
                    member={m}
                    teams={teams}
                    shortMap={shortMap}
                    onClick={() => setEditingMemberId(m.id)}
                    t={t}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <hr className="divider" />

      {/* ═══════════════ VACATIONS ═══════════════ */}
      <section className="res-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div className="section-h" style={{ margin: 0 }}>{t('rv.vacations')}</div>
          <button
            className="btn btn-sec btn-sm"
            onClick={() => {
              const newVacs = [...vacations, { person: members[0]?.id || '', from: '', to: '', note: '' }];
              onVac(newVacs);
              setEditingVacIdx(newVacs.length - 1);
            }}
          >
            {t('rv.addVacation')}
          </button>
        </div>
        <p className="helper" style={{ marginBottom: 10 }}>{t('rv.vacHint')}</p>
        {vacations.length > 0 && (
          <ul className="res-list">
            {sortedVacs.map(v => {
              const origIdx = vacations.indexOf(v);
              const mem = members.find(m => m.id === v.person);
              const team = mem ? teams.find(t => t.id === mem.team) : null;
              const range = [v.from, v.to].filter(Boolean).join(' – ') || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.vacDateRange')}</span>;
              return (
                <li key={origIdx} className="res-row" onClick={() => setEditingVacIdx(origIdx)}>
                  <span className="res-avatar" style={{ background: team?.color || 'var(--ac)', width: 22, height: 22, fontSize: 10 }}>
                    {initials(mem?.name || v.person || '?')}
                  </span>
                  <span className="res-row-name">{mem?.name || v.person || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('rv.choosePerson')}</span>}</span>
                  <span className="res-row-meta">{range}</span>
                  {v.note && <span className="res-row-meta" style={{ opacity: .7, fontStyle: 'italic', fontFamily: 'var(--font)' }}>{v.note}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ═══════════════ MODALS ═══════════════ */}
      {editingTeam && (
        <TeamEditModal
          team={editingTeam}
          idx={editingTeamIdx}
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
