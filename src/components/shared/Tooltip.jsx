import { iso, localDate } from '../../utils/date.js';
import { phaseAssigneeLabel, phaseTeamLabel } from '../../utils/phases.js';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { CriticalPathBadge } from './CriticalPathBadge.jsx';
import { useT } from '../../i18n.jsx';

function MetaChip({ label, value, tone = 'default' }) {
  const color = tone === 'danger' ? 'var(--re)'
    : tone === 'warn' ? 'var(--am)'
    : 'var(--tx)';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 8px',
      borderRadius: 999,
      background: 'var(--bg3)',
      border: '1px solid var(--b)',
      fontSize: 10,
      lineHeight: 1.2,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--tx3)' }}>{label}</span>
      <span style={{ color, fontFamily: 'var(--mono)', fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function SectionTitle({ label }) {
  return (
    <div style={{
      fontSize: 9,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.08em',
      color: 'var(--tx3)',
      marginBottom: 5,
    }}>
      {label}
    </div>
  );
}

export function Tip({ item, x, y, teams, members, tree, scheduled = [], cpLabels = {} }) {
  const { t } = useT();
  if (!item) return null;

  const ttW = 320;
  const ttH = 420;
  const pad = 8;
  let sx = x + 16;
  let sy = y + 18;
  if (sx + ttW > window.innerWidth - pad) sx = x - ttW - 8;
  if (sy + ttH > window.innerHeight - pad) sy = Math.max(pad, window.innerHeight - ttH - pad);
  sx = Math.max(pad, sx);
  sy = Math.max(pad, sy);

  const teamName = item.team && teams
    ? (teams.find(tm => tm.id === item.team)?.name || item.team)
    : item.team;
  const assignNames = (() => {
    const ids = item.assign || [];
    if (ids.length > 0 && members) {
      return ids.map(id => members.find(m => m.id === id)?.name || id).join(', ');
    }
    return item.person || null;
  })();
  const depList = item.deps && tree
    ? (typeof item.deps === 'string' ? item.deps.split(', ') : Array.isArray(item.deps) ? item.deps : [])
      .map(d => {
        const n = tree.find(r => r.id === d);
        return n ? `${d} (${n.name})` : d;
      })
    : null;

  const node = tree ? tree.find(r => r.id === item.id) : null;
  const timeline = tree ? summarizeNodeTimeline(tree, scheduled, node || item.id) : null;
  const factor = node?.factor || item.factor || 1.5;
  const effort = item.effort ?? (item.best > 0 ? item.best * factor : 0);
  const capPct = item.capPct ?? 100;
  const vacDays = item.vacDays ?? (item.vacDed > 0 ? Math.round(effort * item.vacDed / 100) : 0);
  const holidaysInWindow = item.holidaysInWindow ?? 0;
  const actualStart = timeline?.actual?.start || (item.status === 'done'
    ? (item.startD || (node?.completedStart ? localDate(node.completedStart) : (node?.completedAt ? localDate(node.completedAt) : null)))
    : null);
  const actualEnd = timeline?.actual?.end || (item.status === 'done'
    ? (node?.completedAt ? localDate(node.completedAt) : (item.endD || (node?.completedEnd ? localDate(node.completedEnd) : actualStart)))
    : null);
  const periodStart = timeline?.period?.start || (item.status === 'done' ? null : item.startD);
  const periodEnd = timeline?.period?.end || (item.status === 'done' ? null : item.endD);
  const plannedStart = actualStart ? (timeline?.planned?.start || null) : null;
  const plannedEnd = actualEnd ? (timeline?.planned?.end || null) : null;
  const hasDistinctPlanned = !!(actualStart && actualEnd && plannedStart && plannedEnd
    && (plannedStart.getTime() !== actualStart.getTime() || plannedEnd.getTime() !== actualEnd.getTime()));
  const displayStart = actualStart || periodStart;
  const displayEnd = actualEnd || periodEnd;
  const calDays = displayStart && displayEnd
    ? Math.max(1, Math.round((displayEnd - displayStart) / 864e5) + 1)
    : item.calDays || 0;
  const workingDaysInWindow = item.workingDaysInWindow ?? (calDays > 0 ? Math.max(0, calDays - vacDays - holidaysInWindow) : null);
  const statusLabel = item.status === 'done' ? t('tv.statusDone') : item.status === 'wip' ? t('tv.statusWip') : t('tv.statusOpen');
  const statusColor = item.status === 'done' ? 'var(--gr)' : item.status === 'wip' ? 'var(--am)' : 'var(--tx3)';
  const statusDot = item.status === 'done' ? '✓' : item.status === 'wip' ? '◐' : '○';
  const timingChips = [
    item._summaryCount ? { label: t('tv.items'), value: String(item._summaryCount) } : null,
    item._doneCount > 0 ? { label: t('tv.statusDone'), value: String(item._doneCount) } : null,
    calDays > 0 ? { label: t('tt.durCal'), value: `${calDays}d` } : null,
    workingDaysInWindow != null ? { label: t('tt.workingDays'), value: `${workingDaysInWindow}d` } : null,
    holidaysInWindow > 0 ? { label: t('tt.holidaysInWindow'), value: `${holidaysInWindow}d`, tone: 'danger' } : null,
    vacDays > 0 ? { label: t('tt.vacDays'), value: `${vacDays}d`, tone: 'warn' } : null,
    capPct < 100 ? { label: t('tt.durCap'), value: `${capPct}%` } : null,
  ].filter(Boolean);

  return (
    <div className="tt" style={{ left: sx, top: sy }}>
      <div className="tt-title">{item.id} — {item.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ color: statusColor, fontWeight: 700, fontSize: 11 }}>{statusDot} {statusLabel}</span>
        {item.isCp && <CriticalPathBadge id={item.id} labels={cpLabels} compact />}
        {assignNames && <span style={{ color: 'var(--tx2)', fontSize: 10 }}>{assignNames}</span>}
        {teamName && <span style={{ color: 'var(--tx3)', fontSize: 10 }}>· {teamName}</span>}
      </div>

      {(displayStart || displayEnd || hasDistinctPlanned || timeline?.deadline || item.pinnedStart || node?.decideBy) && (
        <>
          <SectionTitle label={t('ins.timing')} />
          {actualStart && actualEnd && (
            <div style={{ fontSize: 11, color: 'var(--tx)', marginBottom: 6 }}>
              <span style={{ color: 'var(--tx3)', marginRight: 6 }}>{t('ins.actual')}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{iso(actualStart)} → {iso(actualEnd)}</span>
            </div>
          )}
          {!actualStart && periodStart && periodEnd && (
            <div style={{ fontSize: 11, color: 'var(--tx)', marginBottom: 6 }}>
              <span style={{ color: 'var(--tx3)', marginRight: 6 }}>{t('ins.period')}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{iso(periodStart)} → {iso(periodEnd)}</span>
              {calDays > 0 && <span style={{ marginLeft: 6, color: 'var(--tx3)', fontSize: 10 }}>({calDays} {t('ins.calDays')})</span>}
            </div>
          )}
          {hasDistinctPlanned && (
            <div style={{ fontSize: 11, color: 'var(--tx)', marginBottom: 6 }}>
              <span style={{ color: 'var(--tx3)', marginRight: 6 }}>{t('ins.planned')}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{iso(plannedStart)} → {iso(plannedEnd)}</span>
            </div>
          )}
          {timeline?.deadline && (
            <div style={{ fontSize: 11, color: 'var(--tx)', marginBottom: 6 }}>
              <span style={{ color: 'var(--tx3)', marginRight: 6 }}>{t('qe.affectsDeadline')}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{iso(timeline.deadline.start)} → {iso(timeline.deadline.end)}</span>
              <span style={{ marginLeft: 6, color: 'var(--tx3)', fontSize: 10 }}>({timeline.deadline.leafCount}/{timeline.leafCount} {t('ins.leaves')})</span>
            </div>
          )}
          {item.pinnedStart && <div style={{ fontSize: 10, color: 'var(--tx2)', marginBottom: 4 }}>📌 {item.pinnedStart}</div>}
          {node?.decideBy && <div style={{ fontSize: 10, color: 'var(--tx2)', marginBottom: 4 }}>⏰ {node.decideBy}</div>}
          {timingChips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {timingChips.map(chip => <MetaChip key={chip.label} label={chip.label} value={chip.value} tone={chip.tone} />)}
            </div>
          )}
        </>
      )}

      {item.best > 0 && (
        <>
          <hr className="tt-sep" />
          <SectionTitle label={t('ins.effort')} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px 8px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--tx3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('ins.effortBest')}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{item.best}d</span>
            <span style={{ fontSize: 10, color: 'var(--tx3)' }}>× {factor} =</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--am)' }}>{effort?.toFixed(1)}d</span>
          </div>
        </>
      )}

      {depList && depList.length > 0 && (
        <>
          <hr className="tt-sep" />
          <SectionTitle label={t('tt.deps')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: 'var(--tx2)' }}>
            {depList.map(d => <div key={d}>{d}</div>)}
          </div>
        </>
      )}

      {item.note && (
        <>
          <hr className="tt-sep" />
          <div style={{ fontSize: 10, color: 'var(--tx3)', fontStyle: 'italic', lineHeight: 1.45 }}>{item.note}</div>
        </>
      )}

      {item.segments && item.segments.length > 1 && (
        <>
          <hr className="tt-sep" />
          <SectionTitle label="Handoff-Kette" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'var(--tx2)' }}>
            {item.segments.map((seg, si) => (
              <div key={si} style={{ color: seg.unscheduled ? 'var(--re)' : seg.handoff ? 'var(--tx2)' : 'var(--tx)' }}>
                {seg.unscheduled ? '⚠' : seg.handoff ? '↳' : '●'}{' '}
                <span style={{ fontWeight: 600 }}>{seg.personName}</span>
                {' · '}
                <span style={{ fontFamily: 'var(--mono)' }}>{seg.effort.toFixed(1)}d</span>
                {' · '}
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{iso(seg.startD)} → {iso(seg.endD)}</span>
                {seg.offboarded && <span style={{ color: 'var(--am)', marginLeft: 4 }}>offboarded</span>}
              </div>
            ))}
          </div>
          {item.truncatedByOffboard && (
            <div style={{ fontSize: 10, color: 'var(--re)', marginTop: 4, fontWeight: 600 }}>
              ⚠ {item.truncatedByOffboard.remainingEffort.toFixed(1)} PT offen — Nachbesetzung nötig nach {item.truncatedByOffboard.offboardDate}
            </div>
          )}
        </>
      )}

      {item.phases?.length > 0 && (
        <>
          <hr className="tt-sep" />
          <SectionTitle label={t('ph.phases')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'var(--tx2)' }}>
            {item.phases.map(ph => (
              <div key={ph.id}>
                {ph.status === 'done' ? '✓' : ph.status === 'wip' ? '◐' : '○'} {ph.name}
                {ph.effortPct ? ` · ${ph.effortPct}%` : ''}
                {phaseTeamLabel(ph, teams) ? ` — ${phaseTeamLabel(ph, teams)}` : ''}
                {phaseAssigneeLabel(ph, members) ? ` · ${phaseAssigneeLabel(ph, members)}` : ''}
              </div>
            ))}
          </div>
        </>
      )}

      {!item._summary && <>
        <hr className="tt-sep" />
        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{t('tt.dblClick')}</div>
      </>}
    </div>
  );
}
