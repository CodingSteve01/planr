import { localDate, diffDays } from '../../../utils/date.js';
import { hasChain, chainShorts, chainTooltip } from '../../../utils/handoff.js';
import { fmtDateDE } from '../../../utils/briefing/briefingDates.js';
import { CriticalPathBadge } from '../../shared/CriticalPathBadge.jsx';
import { StatusCycleButton } from './StatusCycleButton.jsx';
import { useT } from '../../../i18n.jsx';

export function QueueItemRow({ s, personId, iMap, members, shortMap, now, cpSet, cpLabels, memberFullName, onOpenItem, onUpdate }) {
  const { t } = useT();
  const isWip = s.status === 'wip';
  const nodeItem = iMap[s.treeId || s.id];
  const allAssign = nodeItem?.assign || [];
  const others = allAssign.filter(id => id !== personId).map(id => members.find(m => m.id === id)?.name || id);
  const hasDeadline = nodeItem?.decideBy;
  const isOverdue = hasDeadline && localDate(nodeItem.decideBy) < now;
  const isStartingSoon = !isWip && s.startD && diffDays(now, s.startD) <= 3 && s.startD >= now;
  const primary = allAssign.map(id => shortMap[id] || (id || '').slice(0, 2).toUpperCase()).join('/') || shortMap[personId];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        borderRadius: 4,
        cursor: 'pointer',
        background: isWip ? 'rgba(34,197,94,.08)' : 'var(--bg3)',
        border: `1px solid ${isWip ? 'var(--gr)' : 'var(--b2)'}`,
      }}
      onClick={() => onOpenItem?.(s.id)}
    >
      {nodeItem && <StatusCycleButton node={nodeItem} onUpdate={onUpdate} />}
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>
        {s.id}
      </span>
      {cpSet?.has(s.id) && <CriticalPathBadge id={s.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
      {hasChain(s) && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--am)',
            fontFamily: 'var(--mono)',
            fontWeight: 600,
            flexShrink: 0,
            padding: '1px 5px',
            border: '1px solid var(--am)',
            borderRadius: 3,
          }}
          data-htip={chainTooltip(s, memberFullName)}
        >
          ⇄ {chainShorts(s, shortMap, primary)}
        </span>
      )}
      {others.length > 0 && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--tx3)',
            flexShrink: 0,
            maxWidth: 180,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {others.join(', ')}
        </span>
      )}
      {isStartingSoon && (
        <span style={{ fontSize: 11, color: 'var(--ac)', flexShrink: 0, fontFamily: 'var(--mono)' }}>
          {t('bv.startsSoon')} {fmtDateDE(s.startD)}
        </span>
      )}
      {hasDeadline && (
        <span style={{ fontSize: 11, color: isOverdue ? 'var(--re)' : 'var(--tx3)', flexShrink: 0, fontFamily: 'var(--mono)' }}>
          {isOverdue ? '! ' : ''}
          {nodeItem.decideBy}
        </span>
      )}
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>{s.effort?.toFixed(0)}d</span>
    </div>
  );
}
