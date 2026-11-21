import { resolveToLeafIds } from '../../../utils/scheduler.js';
import { CL, CC } from '../../../utils/review/confidenceMarks.js';
import { CriticalPathBadge } from '../../shared/CriticalPathBadge.jsx';
import { useT } from '../../../i18n.jsx';

export function BlockedSection({ blockedItems, iMap, teams, tree, doneSet, cpLabels, onOpenItem }) {
  const { t } = useT();
  return (
    <>
      {blockedItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('p.noBlocked')}</div>
      )}
      {blockedItems.map(r => {
        const node = iMap[r.id];
        if (!node) return null;
        const team = teams.find(tm => tm.id === r.team);
        // Find what blocks this item
        const parts = r.id.split('.');
        const ancestors = [];
        for (let i = 1; i < parts.length; i++) ancestors.push(parts.slice(0, i).join('.'));
        const allDeps = [...new Set([...(node.deps || []), ...ancestors.flatMap(a => iMap[a]?.deps || [])])];
        const blockers = allDeps.filter(d => !resolveToLeafIds(tree, d).every(dl => doneSet.has(dl))).map(d => iMap[d]?.name || d);
        return (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              borderBottom: '1px solid var(--b)',
              cursor: 'pointer',
              fontSize: 12,
            }}
            onClick={() => onOpenItem?.(r.id)}
            data-htip={blockers.length ? `${t('p.waitingFor')}: ${blockers.join(', ')}` : undefined}
          >
            <span style={{ fontSize: 11, color: CC[r.conf] }}>{CL[r.conf]}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>
              {r.id}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            {r.isCp && <CriticalPathBadge id={r.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
            <span
              style={{
                fontSize: 10,
                color: 'var(--am)',
                flexShrink: 0,
                maxWidth: 150,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('pr.waitingOn', blockers.length)}
            </span>
            {team && <span style={{ fontSize: 10, color: team.color, flexShrink: 0 }}>{team.name}</span>}
          </div>
        );
      })}
    </>
  );
}
