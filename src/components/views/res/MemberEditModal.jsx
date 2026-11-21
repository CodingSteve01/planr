import { useEffect } from 'react';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { LazyInput } from '../../shared/LazyInput.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { PlannedChanges, useDescribeChange } from '../../shared/Effective.jsx';
import { memberTeams, withTeams } from '../../../utils/memberTeams.js';
import { DatedHint } from './DatedHint.jsx';
import { CapacityField } from './CapacityFields.jsx';
import { Avatar } from './ReadRows.jsx';

export { MemberEditModal };

/* ─── MemberTeamsField ────────────────────────────────────────────────── */
// Which team pools the person is eligible for. Deliberately no percentage per
// team: the split falls out of the scheduled tasks (see the Members list).
// The first team is the primary one (avatar colour, default for new tasks).
function MemberTeamsField({ member, teams, onUpd, t }) {
  const ids = memberTeams(member);
  return (
    <div>
      {ids.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {ids.map((tid, i) => (
            <span
              key={tid}
              className="tag"
              style={i === 0 && ids.length > 1 ? { fontWeight: 600 } : undefined}
              data-htip={i === 0 && ids.length > 1 ? t('rv.primaryTeam') : undefined}
            >
              {teams.find(tm => tm.id === tid)?.name || tid}
              <span
                className="tag-x"
                onClick={() =>
                  onUpd(
                    withTeams(
                      member,
                      ids.filter(id => id !== tid),
                    ),
                  )
                }
              >
                <Icon name="x" size={9} />
              </span>
            </span>
          ))}
        </div>
      )}
      <SearchSelect
        options={teams.filter(tm => !ids.includes(tm.id)).map(tm => ({ id: tm.id, label: tm.name || tm.id }))}
        onSelect={tid => tid && onUpd(withTeams(member, [...ids, tid]))}
        placeholder={ids.length ? t('rv.addTeam') : t('rv.chooseTeam')}
      />
    </div>
  );
}

/* ─── MemberEditModal ─────────────────────────────────────────────────── */
function MemberEditModal({ member, teams, shortMap, meetingPlans = [], autoFocusName = false, onUpd, onClone, onDel, onClose, t }) {
  const describe = useDescribeChange(meetingPlans);
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      {/* Wide and in two columns. At 560px with everything stacked the
          dialog ran to 1100px tall — a strip you scrolled through, with the
          labels in one narrow column and 150px inputs in another, so a role
          was cut off at "Senior Full-Stack-D". The person on the left, the
          capacity (the part that grows with meetings) on the right, the two
          scheduled-change lists side by side underneath: roughly 4:3. */}
      <div className="modal member-modal" data-testid="member-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar member={member} teams={teams} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {member.name || member.id}
              {shortMap[member.id] && (
                <span className="res-row-short" data-htip={t('rv.shortHint')}>
                  {shortMap[member.id]}
                </span>
              )}
            </span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose} title={t('rv.close')}>
            <Icon name="x" size={11} />
          </button>
        </div>

        <div className="member-cols">
          <div className="member-fields">
            <label className="mf mf-wide">
              {t('rv.fullName')}
              <LazyInput
                autoFocus={autoFocusName}
                data-testid="rv-new-member-name"
                value={member.name || ''}
                onCommit={v => onUpd({ ...member, name: v })}
              />
            </label>
            <div className="mf mf-wide">
              <span className="mf-l">{t('rv.teams')}</span>
              <MemberTeamsField member={member} teams={teams} onUpd={onUpd} t={t} />
            </div>
            <label className="mf mf-wide">
              {t('rv.role')}
              <LazyInput value={member.role || ''} onCommit={v => onUpd({ ...member, role: v })} placeholder={t('rv.rolePlaceholder')} />
            </label>
            <label className="mf">
              {t('rv.vacDays')}
              <LazyInput type="number" min="0" max="40" value={member.vac || 25} onCommit={v => onUpd({ ...member, vac: v })} />
            </label>
            <label className="mf">
              {t('rv.startDate')}
              <LazyInput type="date" value={member.start || ''} onCommit={v => onUpd({ ...member, start: v })} />
            </label>
            <label className="mf">
              {t('rv.endDate')}
              <LazyInput type="date" value={member.end || ''} onCommit={v => onUpd({ ...member, end: v })} />
            </label>
          </div>
          {/* Capacity is a compound field — the meetings list and the
              breakdown are what make this dialog tall, so it gets a column. */}
          <div className="member-cap">
            <CapacityField member={member} onUpd={onUpd} t={t} meetingPlans={meetingPlans} teams={teams} />
          </div>
        </div>

        {/* Time-shifted capacity changes — schedulable cap/weeklyHours
            overrides effective from a given date onward. Scheduler picks
            the latest entry whose `from` is on or before each task's start. */}
        <DatedHint />
        <PlannedChanges kind="members" id={member.id} describe={describe} />

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-danger"
            onClick={() => {
              onDel(member.id);
              onClose();
            }}
          >
            {t('rv.remove')}
          </button>
          {onClone && (
            <button
              className="btn btn-sec"
              onClick={() => {
                onClone(member);
                onClose();
              }}
              data-htip={t('rv.clone')}
            >
              {t('rv.clone')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={onClose}>
            {t('rv.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
