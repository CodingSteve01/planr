import { localDate } from '../../../utils/date.js';
import { fmtDateDE } from '../../../utils/briefing/briefingDates.js';
import { QueueItemRow } from './QueueItemRow.jsx';
import { useT } from '../../../i18n.jsx';

export function QueuesSection({
  personCards,
  vacationsInHorizon,
  iMap,
  members,
  shortMap,
  now,
  cpSet,
  cpLabels,
  memberFullName,
  onOpenItem,
  onUpdate,
}) {
  const { t } = useT();

  // Initials from name
  const initials = name => {
    const words = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words.length === 1
      ? words[0].slice(0, 2).toUpperCase()
      : words
          .map(w => w[0])
          .join('')
          .toUpperCase();
  };

  return (
    <>
      <div className="section-h">{t('bv.queues')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {personCards.map(card => {
          const myVacs = vacationsInHorizon.filter(v => v.person === card.personId);
          const renderItem = s => (
            <QueueItemRow
              key={s.id}
              s={s}
              personId={card.personId}
              iMap={iMap}
              members={members}
              shortMap={shortMap}
              now={now}
              cpSet={cpSet}
              cpLabels={cpLabels}
              memberFullName={memberFullName}
              onOpenItem={onOpenItem}
              onUpdate={onUpdate}
            />
          );
          return (
            <div
              key={card.personId}
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--b)',
                borderRadius: 'var(--r)',
                padding: '12px 14px',
                borderLeft: `3px solid ${card.teamColor}`,
              }}
            >
              {/* Person header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: card.teamColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {initials(card.name)}
                </div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{card.name}</span>
                {card.teamName && <span style={{ fontSize: 12, color: card.teamColor, fontWeight: 500 }}>{card.teamName}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
                  {card.now.length + card.next.length} {t('bv.tasks')}
                </span>
              </div>

              {myVacs.map((v, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--am)', marginBottom: 6, fontFamily: 'var(--mono)' }}>
                  {t('bv.onVacation')}: {fmtDateDE(localDate(v.from))}–{fmtDateDE(localDate(v.to))}
                  {v.note && ` · ${v.note}`}
                </div>
              ))}

              {card.now.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--gr)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                      marginBottom: 3,
                    }}
                  >
                    {t('bv.now')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: card.next.length ? 8 : 0 }}>
                    {card.now.map(renderItem)}
                  </div>
                </>
              )}
              {card.next.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--tx3)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                      marginBottom: 3,
                    }}
                  >
                    {t('bv.next')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{card.next.map(renderItem)}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
