import { useMemo, useState } from 'react';
import { deriveCap, memberAtDate } from '../../utils/capacity.js';
import { iso, localDate } from '../../utils/date.js';
import { useT } from '../../i18n.jsx';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function Avatar({ member, teams }) {
  const team = (teams || []).find(t => t.id === member?.team);
  const bg = team?.color || 'var(--ac)';
  return (
    <span className="res-avatar" style={{ background: bg }}>
      {initials(member?.name || member?.id)}
    </span>
  );
}

function weekNum(d) {
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

export function buildResourceLoadMatrix({ members, teams, vacations, meetingPlans, scheduled, weeks }) {
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
    // Effort gets distributed only over days the person is actually working —
    // vacation days inside the bar stretch the calendar duration but don't
    // contribute to load. Without this, a 10d task with a 5d vacation in the
    // middle looked over-booked when in reality the person just took longer.
    const effort = Math.max(0, item.effort || item.best || 0);
    personIds.forEach(personId => {
      const rows = ensure(personId);
      const taskLoadByWeek = new Map();
      const member = memberById[personId];
      const personSlots = [];
      (weeks || []).forEach((week, wi) => {
        (week.wds || []).forEach(date => {
          if (date < start || date > end) return;
          if (!isActiveMemberDay(member, date)) return;
          if (onVacation(personId, date)) return;
          personSlots.push({ wi, date });
        });
      });
      if (!personSlots.length) return;
      const loadPerSlot = effort / personSlots.length;
      personSlots.forEach(({ wi }) => {
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

export function ResourceLoadMatrix({ members, teams, weeks, vacations, meetingPlans, scheduled }) {
  const { t } = useT();
  const loadByPerson = useMemo(
    () => buildResourceLoadMatrix({ members, teams, vacations, meetingPlans, scheduled, weeks }),
    [members, teams, vacations, meetingPlans, scheduled, weeks],
  );
  const teamById = Object.fromEntries((teams || []).map(team => [team.id, team]));
  const weekCols = weeks || [];
  const [overloadOnly, setOverloadOnly] = useState(() => {
    try { return localStorage.getItem('planr_load_overload_only') === 'true'; } catch { return false; }
  });
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem('planr_load_sort') || 'overload'; } catch { return 'overload'; }
  });
  const persistOverloadOnly = (v) => { setOverloadOnly(v); try { localStorage.setItem('planr_load_overload_only', String(v)); } catch {} };
  const persistSortMode = (v) => { setSortMode(v); try { localStorage.setItem('planr_load_sort', v); } catch {} };
  const peakByMember = useMemo(() => {
    const m = {};
    (members || []).forEach(member => {
      const cells = loadByPerson[member.id] || [];
      let peak = 0;
      for (const c of cells) if (c.percent > peak) peak = c.percent;
      m[member.id] = peak;
    });
    return m;
  }, [members, loadByPerson]);
  const overloads = (members || []).reduce((sum, member) => (
    sum + (loadByPerson[member.id] || []).filter(cell => cell.percent > 110).length
  ), 0);
  const overloadedMemberCount = (members || []).filter(m => (peakByMember[m.id] || 0) > 110).length;
  const orderedMembers = useMemo(() => {
    const list = (members || []).slice();
    if (sortMode === 'overload') {
      list.sort((a, b) => (peakByMember[b.id] || 0) - (peakByMember[a.id] || 0)
        || (a.name || a.id).localeCompare(b.name || b.id));
    } else if (sortMode === 'team') {
      list.sort((a, b) => (teamById[a.team]?.name || '').localeCompare(teamById[b.team]?.name || '')
        || (a.name || a.id).localeCompare(b.name || b.id));
    } else {
      list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    }
    return overloadOnly ? list.filter(m => (peakByMember[m.id] || 0) > 110) : list;
  }, [members, sortMode, overloadOnly, peakByMember, teamById]);
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
        {overloadedMemberCount > 0 && (
          <button
            type="button"
            className="badge bc"
            onClick={() => persistOverloadOnly(!overloadOnly)}
            data-htip={t('rv.loadOnlyOverloadedTip') || 'Show only people with peak load > 110%'}
            style={{ fontSize: 10, padding: '2px 7px', cursor: 'pointer', border: overloadOnly ? '1px solid var(--re)' : '', background: overloadOnly ? 'var(--re)' : '', color: overloadOnly ? '#fff' : '' }}>
            ⚠ {overloadedMemberCount} {t('rv.loadOverPeople') || 'overbooked'}{overloadOnly ? ' · only' : ''}
          </button>
        )}
        <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center', fontSize: 10, color: 'var(--tx3)' }}>
          <span>{t('rv.loadSortBy') || 'sort'}:</span>
          {[
            ['overload', t('rv.loadSortOverload') || 'overload'],
            ['team', t('rv.loadSortTeam') || 'team'],
            ['name', t('rv.loadSortName') || 'name'],
          ].map(([k, label]) => (
            <button key={k} type="button"
              className={`btn btn-xs ${sortMode === k ? 'btn-pri' : 'btn-sec'}`}
              style={{ padding: '1px 6px', fontSize: 10 }}
              onClick={() => persistSortMode(k)}>{label}</button>
          ))}
        </span>
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
            {orderedMembers.map(member => {
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
