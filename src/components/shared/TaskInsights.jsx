import { useMemo } from 'react';
import { isLeafNode, leafNodes, re } from '../../utils/scheduler.js';
import { iso, diffDays, localDate } from '../../utils/date.js';
import { resolveUri } from '../../utils/customFields.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { AutoAssignBadge } from './AutoAssignBadge.jsx';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { useT } from '../../i18n.jsx';

const S_DOT = { open: '○', wip: '◐', done: '✓' };
const S_COLOR = { open: 'var(--tx3)', wip: 'var(--am)', done: 'var(--gr)' };
const S_LABEL = { open: 'tv.statusOpen', wip: 'tv.statusWip', done: 'tv.statusDone' };
const CONF_DOT = { committed: '●', estimated: '◐', exploratory: '○' };
const CONF_COLOR = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };
const PH_DOT = { done: '✓', wip: '◐', open: '○' };
const PH_COLOR = { done: 'var(--gr)', wip: 'var(--am)', open: 'var(--tx3)' };

function KVRow({ label, children, style }) {
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--tx3)', paddingRight: 8, alignSelf: 'start', paddingTop: 2, ...style }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--tx)', ...style }}>{children}</span>
    </>
  );
}

function StatChip({ label, value, tone = 'default' }) {
  const toneColor = tone === 'danger' ? 'var(--re)'
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
      <span style={{ color: toneColor, fontFamily: 'var(--mono)', fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function Section({ label, onClick, editLabel, children }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      data-htip={clickable ? editLabel : undefined}
      style={{
        borderRadius: 'var(--r)',
        padding: '6px 8px',
        margin: '8px -8px 0',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background .12s',
      }}
      onMouseEnter={clickable ? e => { e.currentTarget.style.background = 'rgba(108,160,255,.07)'; } : undefined}
      onMouseLeave={clickable ? e => { e.currentTarget.style.background = 'transparent'; } : undefined}
    >
      <div style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
        color: clickable ? 'var(--tx2)' : 'var(--tx3)', marginBottom: 4,
        borderBottom: '1px solid var(--b)', paddingBottom: 3, userSelect: 'none',
      }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '4px 8px' }}>
        {children}
      </div>
    </div>
  );
}

export function TaskInsights({ node, tree, members, teams, scheduled, cpSet, stats, confidence = {}, confReasons = {}, customFields: projectCustomFields, onOpenItem, onEditSection, onPhaseToggle }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  const phaseToggleTip = t('ins.phaseToggle');
  const sec = onEditSection ? id => () => onEditSection(id) : () => undefined;

  const customFields = projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS;

  const isLeaf = isLeafNode(tree, node.id);
  const isRoot = !node.id.includes('.');
  const sc = scheduled?.find(s => s.id === node.id);
  const timeline = useMemo(() => summarizeNodeTimeline(tree, scheduled, node), [tree, scheduled, node]);

  // Progress
  const leafsUnder = useMemo(() => leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')), [tree, node.id]);
  const doneUnder = useMemo(() => leafsUnder.filter(l => l.status === 'done').length, [leafsUnder]);
  const wipUnder = useMemo(() => leafsUnder.filter(l => l.status === 'wip').length, [leafsUnder]);
  const openUnder = useMemo(() => leafsUnder.filter(l => l.status === 'open').length, [leafsUnder]);
  const leafCount = leafsUnder.length;

  const progPct = !isLeaf
    ? (leafCount ? Math.round(doneUnder / leafCount * 100) : 0)
    : (node.progress ?? (node.status === 'done' ? 100 : 0));

  const status = node.status || 'open';

  // Confidence
  const conf = confidence[node.id];
  const confLabel = conf ? t(`conf.${conf}`) : t('auto');
  const confDot = conf ? CONF_DOT[conf] : '—';
  const confColor = conf ? CONF_COLOR[conf] : 'var(--tx3)';

  // Effort
  const effort = isLeaf ? re(node.best || 0, node.factor || 1.5) : stats?.[node.id]?._r;
  const effortBest = isLeaf ? (node.best || 0) : stats?.[node.id]?._b;
  const capacityPct = sc?.capPct != null ? sc.capPct
    : sc?.capacityFraction != null ? Math.round(sc.capacityFraction * 100)
    : null;
  const effortStats = [
    sc?.calDays > 0 ? { label: t('tt.durCal'), value: `${sc.calDays}d` } : null,
    sc?.workingDaysInWindow != null ? { label: t('tt.workingDays'), value: `${sc.workingDaysInWindow}d` } : null,
    sc?.holidaysInWindow > 0 ? { label: t('tt.holidaysInWindow'), value: `${sc.holidaysInWindow}d`, tone: 'danger' } : null,
    sc?.vacDays > 0 ? { label: t('tt.vacDays'), value: `${sc.vacDays}d`, tone: 'warn' } : null,
    capacityPct != null && capacityPct < 100 ? { label: t('ins.capacity'), value: `${capacityPct}%` } : null,
  ].filter(Boolean);

  // Schedule
  const periodStartDate = timeline?.period?.start || (node.status === 'done'
    ? null
    : (sc?.startD || null));
  const periodEndDate = timeline?.period?.end || (node.status === 'done'
    ? null
    : (sc?.endD || null));
  const actualStartDate = timeline?.actual?.start || (node.status === 'done'
    ? (node.completedStart ? localDate(node.completedStart) : (node.completedAt ? localDate(node.completedAt) : null))
    : null);
  const actualEndDate = timeline?.actual?.end || (node.status === 'done'
    ? (node.completedAt ? localDate(node.completedAt) : (node.completedEnd ? localDate(node.completedEnd) : actualStartDate))
    : null);
  const plannedStartDate = actualStartDate ? (timeline?.planned?.start || null) : null;
  const plannedEndDate = actualEndDate ? (timeline?.planned?.end || null) : null;
  const hasDistinctPlanned = !!(actualStartDate && actualEndDate && plannedStartDate && plannedEndDate
    && (plannedStartDate.getTime() !== actualStartDate.getTime() || plannedEndDate.getTime() !== actualEndDate.getTime()));
  const calDays = (periodStartDate && periodEndDate) ? diffDays(periodStartDate, periodEndDate) : null;

  // Team
  const team = teams?.find(tm => tm.id === node.team);

  // Assignees
  const assignees = useMemo(() =>
    (node.assign || []).map(id => members?.find(m => m.id === id) || { id, name: id }),
    [node.assign, members]
  );

  // Deps: predecessors
  const preds = useMemo(() =>
    (node.deps || []).map(id => {
      const n = tree.find(r => r.id === id);
      return { id, name: n?.name || id, status: n?.status || 'open' };
    }),
    [node.deps, tree]
  );

  // Successors: items that list this node as a dep
  const succs = useMemo(() =>
    tree.filter(r => (r.deps || []).includes(node.id)).map(r => ({ id: r.id, name: r.name, status: r.status || 'open' })),
    [tree, node.id]
  );

  // Custom fields with values
  const filledCustomFields = useMemo(() =>
    customFields.filter(cf => (node.customValues || {})[cf.id]),
    [customFields, node.customValues]
  );

  const statusColor = S_COLOR[status] || 'var(--tx3)';

  const detailsClick = onEditSection ? () => onEditSection('details') : undefined;
  return (
    <div style={{ fontSize: 12 }}>
      {/* Name + description — clickable, jumps to Details tab */}
      <div
        onClick={detailsClick}
        data-htip={detailsClick ? editLabel : undefined}
        style={{
          padding: '6px 8px', margin: '0 -8px 8px', borderRadius: 'var(--r)',
          cursor: detailsClick ? 'pointer' : 'default', transition: 'background .12s',
        }}
        onMouseEnter={detailsClick ? e => { e.currentTarget.style.background = 'rgba(108,160,255,.07)'; } : undefined}
        onMouseLeave={detailsClick ? e => { e.currentTarget.style.background = 'transparent'; } : undefined}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.25, marginBottom: 4 }}>
          {node.name || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('qe.name')}</span>}
        </div>
        {(node.description || node.note) && (
          <div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
            {node.description || node.note}
          </div>
        )}
        {node.description && node.note && node.note !== node.description && (
          <div style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.4, marginTop: 4, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
            {node.note}
          </div>
        )}
      </div>

      {/* Status + progress header — clickable, jumps to Details tab */}
      <div
        onClick={onEditSection ? () => onEditSection('status') : undefined}
        data-htip={onEditSection ? editLabel : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap',
          padding: '6px 8px', margin: '0 -8px 8px', borderRadius: 'var(--r)',
          cursor: onEditSection ? 'pointer' : 'default', transition: 'background .12s',
        }}
        onMouseEnter={onEditSection ? e => { e.currentTarget.style.background = 'rgba(108,160,255,.07)'; } : undefined}
        onMouseLeave={onEditSection ? e => { e.currentTarget.style.background = 'transparent'; } : undefined}
      >
        <span style={{ fontWeight: 700, color: statusColor, fontSize: 13 }}>
          {S_DOT[status]} {t(S_LABEL[status] || status)}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx2)' }}>{progPct}%</span>
        <div style={{ flex: '1 1 80px', height: 5, background: 'var(--bg4)', borderRadius: 3, minWidth: 60 }}>
          <div style={{ width: `${progPct}%`, height: '100%', background: progPct >= 100 ? 'var(--gr)' : 'var(--am)', borderRadius: 3 }} />
        </div>
        <span style={{ color: confColor, fontSize: 11, fontFamily: 'var(--mono)' }}>{confDot} {confLabel}</span>
      </div>

      {/* Sections */}

      {/* Timing section */}
      {(periodStartDate || periodEndDate || actualStartDate || actualEndDate || timeline?.deadline || node.pinnedStart || node.decideBy) && (
        <Section label={t('ins.timing')} onClick={sec('timing')} editLabel={editLabel}>
          {actualStartDate && actualEndDate && (
            <KVRow label={t('ins.actual')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                {iso(actualStartDate)} → {iso(actualEndDate)}
              </span>
              {actualStartDate && actualEndDate && (
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx3)' }}>
                  ({diffDays(actualStartDate, actualEndDate)} {t('ins.calDays')})
                </span>
              )}
            </KVRow>
          )}
          {!actualStartDate && periodStartDate && periodEndDate && (
            <KVRow label={t('ins.period')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                {iso(periodStartDate)} → {iso(periodEndDate)}
              </span>
              {calDays != null && (
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx3)' }}>
                  ({calDays} {t('ins.calDays')})
                </span>
              )}
            </KVRow>
          )}
          {hasDistinctPlanned && (
            <KVRow label={t('ins.planned')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                {iso(plannedStartDate)} → {iso(plannedEndDate)}
              </span>
            </KVRow>
          )}
          {timeline?.deadline && (
            <KVRow label={t('qe.affectsDeadline')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                {iso(timeline.deadline.start)} → {iso(timeline.deadline.end)}
              </span>
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx3)' }}>
                ({timeline.deadline.leafCount}/{timeline.leafCount} {t('ins.leaves')})
              </span>
            </KVRow>
          )}
          {node.pinnedStart && (
            <KVRow label={t('ins.pinned')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>📌 {node.pinnedStart}</span>
            </KVRow>
          )}
          {node.decideBy && (
            <KVRow label={t('ins.decideBy')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: new Date(node.decideBy) < new Date() ? 'var(--re)' : 'var(--tx)' }}>
                {node.decideBy}
              </span>
            </KVRow>
          )}
        </Section>
      )}

      {/* Effort section — leaf only */}
      {isLeaf && (node.best > 0) && (
        <Section label={t('ins.effort')} onClick={sec('effort')} editLabel={editLabel}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px 8px',
              flexWrap: 'wrap',
              padding: '4px 0 2px',
            }}>
              <span style={{ color: 'var(--tx3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {t('ins.effortBest')}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{effortBest}d</span>
              <span style={{ fontSize: 10, color: 'var(--tx3)' }}>× {node.factor || 1.5} =</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--am)' }}>
                {effort?.toFixed(1)}d
              </span>
            </div>
            {effortStats.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {effortStats.map(stat => (
                  <StatChip key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Parent: aggregate section — no onClick, no hover */}
      {!isLeaf && leafCount > 0 && (
        <Section label={t('ins.subtasks')}>
          <KVRow label={t('ins.breakdown')}>
            <span>
              <span style={{ color: 'var(--gr)' }}>✓ {doneUnder}</span>
              <span style={{ color: 'var(--tx3)' }}> · </span>
              <span style={{ color: 'var(--am)' }}>◐ {wipUnder}</span>
              <span style={{ color: 'var(--tx3)' }}> · </span>
              <span>○ {openUnder}</span>
              <span style={{ color: 'var(--tx3)', fontSize: 10 }}> / {leafCount} {t('ins.leaves')}</span>
            </span>
          </KVRow>
          {(effortBest != null && effortBest > 0) && (
            <KVRow label={t('qe.realistic')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--am)' }}>{effort?.toFixed(0)}d</span>
              {effortBest > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginLeft: 4 }}>({effortBest?.toFixed(0)}d best)</span>}
            </KVRow>
          )}
        </Section>
      )}

      {/* People section — assignees + team in one row */}
      {(assignees.length > 0 || team || sc?.autoAssigned) && (
        <Section label={t('ins.people')} onClick={sec('people')} editLabel={editLabel}>
          <KVRow label={t('ins.assignees')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {(assignees.length > 0 || sc?.autoAssigned) && (
                <span>{assignees.length > 0 ? assignees.map(m => m.name).join(', ') : sc?.person}</span>
              )}
              {sc?.autoAssigned && (
                <AutoAssignBadge title={t('ins.autoAssignedTip')}>
                  {t('ins.autoAssigned')}
                </AutoAssignBadge>
              )}
              {team && (
                <>
                  <span style={{ color: 'var(--tx3)', fontSize: 10 }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: team.color || 'var(--b3)' }} />
                    <span style={{ color: 'var(--tx2)' }}>{team.name}</span>
                  </span>
                </>
              )}
            </span>
          </KVRow>
        </Section>
      )}

      {/* Phases section — leaf only, if phases exist */}
      {isLeaf && node.phases?.length > 0 && (() => {
        const currentPhaseIdx = node.phases.findIndex(p => p.status !== 'done');
        return (
          <Section label={t('ins.phases')} onClick={sec('phases')} editLabel={editLabel}>
            {node.phases.map((ph, idx) => {
              const isCurrent = idx === currentPhaseIdx;
              const dot = PH_DOT[ph.status] || '○';
              const color = PH_COLOR[ph.status] || 'var(--tx3)';
              const pct = ph.effortPct != null ? ph.effortPct : null;
              return (
                <KVRow key={ph.id || idx} label="">
                  <span style={{ fontSize: 11, color: isCurrent ? 'var(--tx)' : 'var(--tx2)', fontWeight: isCurrent ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span
                      style={{ color, cursor: onPhaseToggle ? 'pointer' : 'default', transition: 'transform .1s', display: 'inline-block' }}
                      data-htip={onPhaseToggle ? phaseToggleTip : undefined}
                      onClick={onPhaseToggle ? e => { e.stopPropagation(); onPhaseToggle(ph.id); } : undefined}
                      onMouseEnter={onPhaseToggle ? e => { e.currentTarget.style.transform = 'scale(1.4)'; } : undefined}
                      onMouseLeave={onPhaseToggle ? e => { e.currentTarget.style.transform = 'scale(1)'; } : undefined}
                    >{dot}</span>
                    <span>{ph.name || ph.id}</span>
                    {pct != null && <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{pct}%</span>}
                    {isCurrent && <span style={{ fontSize: 9, color: 'var(--ac)', marginLeft: 2 }}>←</span>}
                  </span>
                </KVRow>
              );
            })}
          </Section>
        );
      })()}

      {/* Dependencies section */}
      {(preds.length > 0 || succs.length > 0) && (
        <Section label={t('ins.deps')} onClick={sec('dependencies')} editLabel={editLabel}>
          {preds.length > 0 && (
            <KVRow label={t('qe.predecessors')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {preds.map(p => (
                  <span key={p.id} style={{ cursor: onOpenItem ? 'pointer' : 'default' }}
                    onClick={e => { e.stopPropagation(); onOpenItem?.(p.id); }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)' }}>{p.id}</span>
                    <span style={{ marginLeft: 4, color: S_COLOR[p.status] }}>{S_DOT[p.status]}</span>
                    <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--tx2)' }}>{p.name}</span>
                  </span>
                ))}
              </div>
            </KVRow>
          )}
          {succs.length > 0 && (
            <KVRow label={t('qe.successors')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {succs.map(s => (
                  <span key={s.id} style={{ cursor: onOpenItem ? 'pointer' : 'default' }}
                    onClick={e => { e.stopPropagation(); onOpenItem?.(s.id); }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)' }}>{s.id}</span>
                    <span style={{ marginLeft: 4, color: S_COLOR[s.status] }}>{S_DOT[s.status]}</span>
                    <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--tx2)' }}>{s.name}</span>
                  </span>
                ))}
              </div>
            </KVRow>
          )}
        </Section>
      )}

      {/* Custom fields with values */}
      {filledCustomFields.length > 0 && (
        <Section label={t('cf.fieldValues')} onClick={sec('customFields')} editLabel={editLabel}>
          {filledCustomFields.map(cf => {
            const val = (node.customValues || {})[cf.id];
            const url = cf.type === 'uri' ? resolveUri(cf, val) : null;
            return (
              <KVRow key={cf.id} label={cf.name}>
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} style={{ color: 'var(--ac)', fontSize: 11 }}>{val}</a>
                  : <span style={{ fontSize: 11 }}>{val}</span>
                }
              </KVRow>
            );
          })}
        </Section>
      )}
    </div>
  );
}
