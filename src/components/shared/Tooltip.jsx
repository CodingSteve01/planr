import { iso } from '../../utils/date.js';
import { phaseAssigneeLabel, phaseTeamLabel } from '../../utils/phases.js';
import { useT } from '../../i18n.jsx';

export function Tip({ item, x, y, teams, members, tree }) {
  const { t } = useT();
  if (!item) return null;
  // Position: offset right+below cursor, clamp to viewport
  const ttW = 280, ttH = 360; // approximate max dimensions
  const pad = 8;
  let sx = x + 16; // right of cursor
  let sy = y + 18; // below cursor
  // Clamp right edge
  if (sx + ttW > window.innerWidth - pad) sx = x - ttW - 8;
  // Clamp bottom edge
  if (sy + ttH > window.innerHeight - pad) sy = Math.max(pad, window.innerHeight - ttH - pad);
  // Clamp left/top
  sx = Math.max(pad, sx);
  sy = Math.max(pad, sy);
  // Resolve team name
  const teamName = item.team && teams
    ? (teams.find(tm => tm.id === item.team)?.name || item.team)
    : item.team;
  // Resolve all assignee names (multi-assignee support)
  const assignNames = (() => {
    const ids = item.assign || [];
    if (ids.length > 0 && members) {
      return ids.map(id => members.find(m => m.id === id)?.name || id).join(', ');
    }
    return item.person || null;
  })();
  // Resolve dep names
  const depList = item.deps && tree
    ? (typeof item.deps === 'string' ? item.deps.split(', ') : Array.isArray(item.deps) ? item.deps : [])
        .map(d => { const n = tree.find(r => r.id === d); return n ? `${d} (${n.name})` : d; })
    : null;

  return <div className="tt" style={{ left: sx, top: sy }}>
    <div className="tt-title">{item.id} — {item.name}</div><hr className="tt-sep" />
    {assignNames && <div className="tt-row"><span>{t('tt.assigned')}</span><b>{assignNames}</b></div>}
    {teamName && <div className="tt-row"><span>{t('tt.team')}</span><b>{teamName}</b></div>}
    {item.best > 0 && <div className="tt-row"><span>{t('tt.bestCase')}</span><b>{item.best}d</b></div>}
    {item.effort > 0 && <div className="tt-row"><span>{t('tt.realistic')}</span><b>{item.effort?.toFixed(1)}d</b></div>}
    {item.startD && <div className="tt-row"><span>{t('tt.start')}</span><b>{iso(item.startD)}</b></div>}
    {item.endD && <div className="tt-row"><span>{t('tt.end')}</span><b>{iso(item.endD)}</b></div>}
    {/* Duration breakdown — shown when item has both an estimate and scheduling data */}
    {item.best > 0 && item.calDays > 0 && (() => {
      const node = tree ? tree.find(r => r.id === item.id) : null;
      const factor = node?.factor || item.factor || 1.5;
      const effort = item.effort ?? (item.best * factor);
      const vacDed = item.vacDed ?? 0;
      const vacDays = vacDed > 0 ? Math.round(effort * vacDed / 100) : 0;
      const capPct = item.capPct ?? 100;
      return <>
        <hr className="tt-sep" />
        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>{t('tt.durBreakdown')}</div>
          <div style={{ marginLeft: 4, marginBottom: 1 }}>
            {t('tt.durBest')}: <b style={{ color: 'var(--tx2)' }}>{item.best}d × {factor} = {effort?.toFixed(1)}d</b>
          </div>
          <div style={{ marginLeft: 4, marginBottom: 1 }}>
            {t('tt.durCal')}: <b style={{ color: 'var(--tx2)' }}>{item.calDays}d</b>
          </div>
          {vacDays > 0 && <div style={{ marginLeft: 4, marginBottom: 1 }}>
            {t('tt.durVac')}: <b style={{ color: 'var(--am)' }}>+{vacDays}d</b>
          </div>}
          {capPct < 100 && <div style={{ marginLeft: 4, marginBottom: 1 }}>
            {t('tt.durCap')}: <b style={{ color: 'var(--am)' }}>{capPct}%</b>
          </div>}
          {item.startD && <div style={{ marginLeft: 4 }}>
            {t('tt.durStart')}: <b style={{ color: 'var(--tx2)' }}>{iso(item.startD)}</b>
          </div>}
        </div>
      </>;
    })()}
    {depList && depList.length > 0 && <><hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)' }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{t('tt.deps')}</div>
      {depList.map(d => <div key={d} style={{ marginLeft: 4 }}>{d}</div>)}
    </div></>}
    {item.isCp && <div className="tt-row"><span>{t('tt.cp')}</span><b style={{ color: 'var(--re)' }}>{t('tt.cpYes')}</b></div>}
    {item.note && <><hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)', fontStyle: 'italic' }}>{item.note}</div></>}
    {item.phases?.length > 0 && <><hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)' }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{t('ph.phases')}</div>
      {item.phases.map(ph => <div key={ph.id} style={{ marginLeft: 4 }}>
        {ph.status === 'done' ? '✓' : ph.status === 'wip' ? '◐' : '○'} {ph.name}
        {ph.effortPct ? ` · ${ph.effortPct}%` : ''}
        {phaseTeamLabel(ph, teams) ? ` — ${phaseTeamLabel(ph, teams)}` : ''}
        {phaseAssigneeLabel(ph, members) ? ` · ${phaseAssigneeLabel(ph, members)}` : ''}
      </div>)}
    </div></>}
    <hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)' }}>{t('tt.dblClick')}</div>
  </div>;
}
