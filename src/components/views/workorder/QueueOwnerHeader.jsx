import { useT } from '../../../i18n.jsx';

// The owner's line above their queue: who, how many, how many are picked, and
// the mark that says the order is a stored one, with the way back.
export function QueueOwnerHeader({ label, owner, ordered, picked, sorted, onQueueReset }) {
  const { t } = useT();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: '2px solid var(--b)',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: label.team ? 2 : 8, background: label.color || 'var(--ac)', flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label.name}</span>
      {label.team && <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{t('wo.unassigned')}</span>}
      <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{ordered.length}</span>
      {(() => {
        // Multi-select is the tree's, and just as invisible here as it was
        // there: the rows highlight and nothing says a move takes all of
        // them. Only shown from two — one picked row is just the cursor.
        const mine = ordered.filter(id => picked.has(id)).length;
        if (mine < 2) return null;
        return (
          <span
            data-testid="wo-picked"
            data-htip={t('wo.pickedTip')}
            style={{
              fontSize: 10,
              color: 'var(--ac)',
              background: 'var(--ac2)',
              border: '1px solid var(--ac)',
              borderRadius: 3,
              padding: '0 5px',
              fontWeight: 600,
            }}
          >
            {t('wo.picked', mine)}
          </span>
        );
      })()}
      {sorted && (
        <>
          <span
            style={{
              fontSize: 10,
              color: 'var(--tx2)',
              background: 'var(--bg3)',
              border: '1px solid var(--b2)',
              borderRadius: 3,
              padding: '0 5px',
            }}
            data-htip={t('g.queueSortedTip')}
          >
            {t('g.queueSorted')}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            data-testid={`queue-reset-${owner}`}
            data-htip={t('g.queueReset')}
            onClick={() => onQueueReset?.(owner)}
            style={{ padding: '1px 6px', fontSize: 11 }}
          >
            {t('g.queueReset')}
          </button>
        </>
      )}
    </div>
  );
}
