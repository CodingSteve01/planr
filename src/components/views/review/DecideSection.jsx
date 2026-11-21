import { re } from '../../../utils/scheduler.js';
import { iso } from '../../../utils/date.js';
import { hasChain, chainShorts, chainTooltip } from '../../../utils/handoff.js';
import { CL, CC, CN } from '../../../utils/review/confidenceMarks.js';
import { PersonChip } from '../../shared/PersonChip.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { CriticalPathBadge } from '../../shared/CriticalPathBadge.jsx';
import { useT } from '../../../i18n.jsx';

export function DecideSection({ readyItems, teams, iMap, sMap, members, confReasons, cpLabels, shortMap, onOpenItem, acceptAuto }) {
  const { t } = useT();
  const reasonText = r =>
    ({
      'manual': t('pr.reasonManual'),
      'done': t('pr.reasonDone'),
      'auto:person+estimate': t('pr.reasonPersonEstimate'),
      'auto:no-person': t('pr.reasonNoPerson'),
      'auto:high-risk': t('pr.reasonHighRisk'),
      'auto:no-estimate': t('pr.reasonNoEstimate'),
      'inherited': t('pr.reasonInherited'),
    })[r] || r;
  const memberShort = id => {
    const m = members.find(x => x.id === id);
    if (!m) return '?';
    const w = (m.name || '').trim().split(/\s+/);
    return w.length === 1
      ? w[0].slice(0, 2).toUpperCase()
      : w
          .map(x => x[0])
          .join('')
          .toUpperCase();
  };
  const memberFullName = id => members.find(x => x.id === id)?.name || id || '?';
  return (
    <>
      {readyItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('p.allAssigned')}</div>
      )}
      {(() => {
        const byTeam = {};
        readyItems.forEach(r => {
          const tk = r.team || '__none';
          if (!byTeam[tk]) byTeam[tk] = [];
          byTeam[tk].push(r);
        });
        return Object.entries(byTeam).map(([tk, items]) => {
          const team = teams.find(tm => tm.id === tk);
          return (
            <div key={tk} style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                  paddingBottom: 4,
                  borderBottom: `2px solid ${team?.color || 'var(--b)'}`,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: team?.color || 'var(--tx2)' }}>{team?.name || t('noTeam')}</span>
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                  {items.length} · {items.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0).toFixed(0)} PT
                </span>
              </div>
              {items.map(r => {
                const node = iMap[r.id];
                const sc = sMap[r.id];
                const hasAuto = sc?.autoAssigned && sc.personId && !(node?.assign || []).length;
                const autoM = hasAuto ? members.find(x => x.id === sc.personId) : null;
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
                  >
                    <span style={{ fontSize: 11, color: CC[r.conf], flexShrink: 0 }}>{CL[r.conf]}</span>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        color: 'var(--ac)',
                        fontWeight: 600,
                        flexShrink: 0,
                        minWidth: 70,
                      }}
                    >
                      {r.id}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    {r.isCp && <CriticalPathBadge id={r.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
                    {/* Only the reasons that EXPLAIN something. "Manually set" is
                    true of nearly every row on a real plan, so as a badge it
                    was twenty identical marks down a column, saying nothing
                    and crowding out the two that do — "no person assigned",
                    "no estimate". A badge on every row is not a badge. The
                    full reason stays in the row's tooltip either way. */}
                    {!['manual', 'done', 'inherited'].includes(confReasons[r.id]) && (
                      <span
                        style={{
                          fontSize: 10,
                          color: CC[r.conf],
                          flexShrink: 0,
                          border: `1px dashed ${CC[r.conf]}`,
                          borderRadius: 3,
                          padding: '1px 4px',
                        }}
                      >
                        {reasonText(confReasons[r.id]) || CN[r.conf]}
                      </span>
                    )}
                    {r.best > 0 && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{r.best}T</span>
                    )}
                    {hasChain(sc) &&
                      (() => {
                        const primary = (node?.assign || []).map(memberShort).join('/') || memberShort(sc.personId);
                        return (
                          <PersonChip
                            chain
                            short={chainShorts(sc, shortMap, primary)}
                            title={chainTooltip(sc, memberFullName)}
                            style={{ flexShrink: 0 }}
                          />
                        );
                      })()}
                    {/* The schedule's suggestion was a `btn btn-pri` — the loudest
                    control in the app, on every row, for a person's initials.
                    It is the same quiet chip as everywhere else now, with a
                    small accept beside it: the initials identify, the button
                    acts, and only the button looks like one. */}
                    {hasAuto && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <PersonChip auto short={memberShort(sc.personId)} title={`${autoM.name}: ${iso(sc.startD)} — ${iso(sc.endD)}`} />
                        <button
                          type="button"
                          className="btn btn-sec btn-xs"
                          style={{ padding: '1px 5px', display: 'inline-flex', alignItems: 'center' }}
                          onClick={e => {
                            e.stopPropagation();
                            acceptAuto(node);
                          }}
                          aria-label={t('aa.accept')}
                          data-htip={t('aa.accept')}
                        >
                          <Icon name="check" size={11} />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        });
      })()}
    </>
  );
}
