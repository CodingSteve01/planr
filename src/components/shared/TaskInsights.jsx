import { useMemo } from 'react';
import { isLeafNode, leafNodes, re } from '../../utils/scheduler.js';
import { iso, diffDays, localDate } from '../../utils/date.js';
import { resolveUri } from '../../utils/customFields.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { useT } from '../../i18n.jsx';

const S_DOT = { open: '○', wip: '◐', done: '✓' };
const S_COLOR = { open: 'var(--tx3)', wip: 'var(--am)', done: 'var(--gr)' };
const CONF_DOT = { committed: '●', estimated: '◐', exploratory: '○' };
const CONF_COLOR = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };
const PH_DOT = { done: '✓', wip: '◐', open: '○' };
const PH_COLOR = { done: 'var(--gr)', wip: 'var(--am)', open: 'var(--tx3)' };

function KVRow({ label, children, style }) {
  return (
    <div style={{ display: 'contents' }}>
      <span style={{ fontSize: 11, color: 'var(--tx3)', paddingRight: 8, alignSelf: 'start', paddingTop: 2, ...style }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--tx)', ...style }}>{children}</span>
    </div>
  );
}

function SectionDivider({ label, onClick, editLabel }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      data-htip={clickable ? editLabel : undefined}
      style={{
        gridColumn: '1 / -1',
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
        color: 'var(--tx3)', marginTop: 10, marginBottom: 2,
        borderBottom: '1px solid var(--b)', paddingBottom: 3,
        cursor: clickable ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: 4,
        userSelect: 'none',
      }}
      onMouseEnter={clickable ? e => { e.currentTarget.querySelector('.sec-edit-icon').style.opacity = '1'; } : undefined}
      onMouseLeave={clickable ? e => { e.currentTarget.querySelector('.sec-edit-icon').style.opacity = '0'; } : undefined}
    >
      <span>{label}</span>
      {clickable && <span className="sec-edit-icon" style={{ opacity: 0, fontSize: 9, color: 'var(--ac)', transition: 'opacity .15s' }}>✎</span>}
    </div>
  );
}

export function TaskInsights({ node, tree, members, teams, scheduled, cpSet, stats, confidence = {}, confReasons = {}, customFields: projectCustomFields, onOpenItem, onEditSection }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  const sec = onEditSection ? id => () => onEditSection(id) : () => undefined;

  const customFields = projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS;

  const isLeaf = isLeafNode(tree, node.id);
  const isRoot = !node.id.includes('.');
  const sc = scheduled?.find(s => s.id === node.id);
  const isCp = cpSet?.has(node.id);

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

  // Schedule
  const startDate = sc?.startD || (node.pinnedStart ? localDate(node.pinnedStart) : null);
  const endDate = sc?.endD || null;
  const calDays = (startDate && endDate) ? diffDays(startDate, endDate) : null;

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

  return (
    <div style={{ fontSize: 12 }}>
      {/* Status + progress header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: statusColor, fontSize: 13 }}>
          {S_DOT[status]} {t(status)}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx2)' }}>{progPct}%</span>
        <div style={{ flex: '1 1 80px', height: 5, background: 'var(--bg4)', borderRadius: 3, minWidth: 60 }}>
          <div style={{ width: `${progPct}%`, height: '100%', background: progPct >= 100 ? 'var(--gr)' : 'var(--am)', borderRadius: 3 }} />
        </div>
        <span style={{ color: confColor, fontSize: 11, fontFamily: 'var(--mono)' }}>{confDot} {confLabel}</span>
        {isCp && <span className="badge b-cp">⚡ CP</span>}
      </div>

      {/* Main KV grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '5px 0' }}>

        {/* Timing section */}
        {(startDate || endDate) && <>
          <SectionDivider label={t('ins.timing')} onClick={sec('timing')} editLabel={editLabel} />
          {startDate && endDate && (
            <KVRow label={t('ins.period')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                {iso(startDate)} → {iso(endDate)}
              </span>
              {calDays != null && (
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx3)' }}>
                  ({calDays} {t('ins.calDays')})
                </span>
              )}
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
        </>}

        {/* Effort section — leaf only */}
        {isLeaf && (node.best > 0) && <>
          <SectionDivider label={t('ins.effort')} onClick={sec('effort')} editLabel={editLabel} />
          <KVRow label={t('ins.effortBest')}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{effortBest}d</span>
            <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--tx3)' }}>× {node.factor || 1.5} = </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--am)' }}> {effort?.toFixed(1)}d</span>
          </KVRow>
          {sc?.capacityFraction != null && (
            <KVRow label={t('ins.capacity')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{Math.round(sc.capacityFraction * 100)}%</span>
            </KVRow>
          )}
        </>}

        {/* Parent: aggregate section */}
        {!isLeaf && leafCount > 0 && <>
          <SectionDivider label={t('ins.subtasks')} />
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
        </>}

        {/* People section */}
        {(assignees.length > 0 || team) && <>
          <SectionDivider label={t('ins.people')} onClick={sec('people')} editLabel={editLabel} />
          {assignees.length > 0 && (
            <KVRow label={t('ins.assignees')}>
              <span>{assignees.map(m => m.name).join(', ')}</span>
            </KVRow>
          )}
          {team && (
            <KVRow label={t('ins.team')}>
              <span style={{ color: team.color || 'var(--tx)', fontWeight: 500 }}>{team.name}</span>
            </KVRow>
          )}
        </>}

        {/* Phases section — leaf only, if phases exist */}
        {isLeaf && node.phases?.length > 0 && (() => {
          const currentPhaseIdx = node.phases.findIndex(p => p.status !== 'done');
          return <>
            <SectionDivider label={t('ins.phases')} onClick={sec('phases')} editLabel={editLabel} />
            {node.phases.map((ph, idx) => {
              const isCurrent = idx === currentPhaseIdx;
              const dot = PH_DOT[ph.status] || '○';
              const color = PH_COLOR[ph.status] || 'var(--tx3)';
              const pct = ph.effortPct != null ? ph.effortPct : null;
              return (
                <div key={ph.id || idx} style={{ display: 'contents' }}>
                  <span style={{ fontSize: 11, color: 'var(--tx3)', paddingRight: 8, alignSelf: 'start', paddingTop: 2 }} />
                  <span style={{ fontSize: 11, color: isCurrent ? 'var(--tx)' : 'var(--tx2)', fontWeight: isCurrent ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color }}>{dot}</span>
                    <span>{ph.name || ph.id}</span>
                    {pct != null && <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{pct}%</span>}
                    {isCurrent && <span style={{ fontSize: 9, color: 'var(--ac)', marginLeft: 2 }}>←</span>}
                  </span>
                </div>
              );
            })}
          </>;
        })()}

        {/* Dependencies section */}
        {(preds.length > 0 || succs.length > 0) && <>
          <SectionDivider label={t('ins.deps')} onClick={sec('dependencies')} editLabel={editLabel} />
          {preds.length > 0 && (
            <KVRow label={t('qe.predecessors')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {preds.map(p => (
                  <span key={p.id} style={{ cursor: onOpenItem ? 'pointer' : 'default' }}
                    onClick={() => onOpenItem?.(p.id)}>
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
                    onClick={() => onOpenItem?.(s.id)}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)' }}>{s.id}</span>
                    <span style={{ marginLeft: 4, color: S_COLOR[s.status] }}>{S_DOT[s.status]}</span>
                    <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--tx2)' }}>{s.name}</span>
                  </span>
                ))}
              </div>
            </KVRow>
          )}
        </>}

        {/* Custom fields with values */}
        {filledCustomFields.length > 0 && <>
          <SectionDivider label={t('cf.fieldValues')} onClick={sec('customFields')} editLabel={editLabel} />
          {filledCustomFields.map(cf => {
            const val = (node.customValues || {})[cf.id];
            const url = cf.type === 'uri' ? resolveUri(cf, val) : null;
            return (
              <KVRow key={cf.id} label={cf.name}>
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontSize: 11 }}>{val}</a>
                  : <span style={{ fontSize: 11 }}>{val}</span>
                }
              </KVRow>
            );
          })}
        </>}
      </div>
    </div>
  );
}
