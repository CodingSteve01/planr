import { memberShades } from '../../../utils/teamShades.js';
import { useT } from '../../../i18n.jsx';

export function CapacitySection({ teamCapacity, scheduled }) {
  const { t } = useT();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
      {teamCapacity.map(tc => {
        // The card is about THIS team's open work, and every number on it adds
        // up to the bar: each member's share in their own dot colour, plus a
        // neutral remainder for work nobody is on. The dots are the bar's
        // legend, which is the whole reason they are there.
        const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
        const shades = memberShades(tc.color, tc.members.length, { dark: !isLight });
        const memberShares = tc.members.map((m, mi) => ({
          m,
          color: shades[mi] || tc.color,
          pt: (scheduled || [])
            .filter(r => r.status !== 'done' && !r.unscheduled && r.personId === m.id && (r.team || '') === (tc.id || ''))
            .reduce((acc, r) => acc + (r.effort || 0), 0),
        }));
        const staffedPt = memberShares.reduce((acc, x) => acc + x.pt, 0);
        const teamTotal = staffedPt + tc.unassignedPt;
        return (
          <div
            key={tc.name}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--b)',
              borderLeft: `3px solid ${tc.color}`,
              borderRadius: 'var(--r)',
              padding: '10px 12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: tc.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{tc.name}</span>
            </div>
            {memberShares.map(({ m, pt, color }) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{m.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{m.cap < 1 ? `${Math.round(m.cap * 100)}%` : ''}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx2)' }}>{pt.toFixed(0)} PT</span>
              </div>
            ))}
            {teamTotal > 0 && (
              <>
                <div
                  style={{
                    display: 'flex',
                    height: 6,
                    borderRadius: 3,
                    overflow: 'hidden',
                    background: 'var(--bg4)',
                    margin: '7px 0 4px',
                  }}
                >
                  {memberShares.map(
                    ({ m, pt, color }) => pt > 0 && <div key={m.id} style={{ width: `${(pt / teamTotal) * 100}%`, background: color }} />,
                  )}
                  {tc.unassignedPt > 0 && <div style={{ width: `${(tc.unassignedPt / teamTotal) * 100}%`, background: 'var(--b2)' }} />}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    fontFamily: 'var(--mono)',
                    color: 'var(--tx3)',
                  }}
                >
                  <span style={{ color: 'var(--tx2)' }}>
                    {teamTotal.toFixed(0)} PT {t('pr.open')}
                  </span>
                  {tc.unassignedPt > 0 && <span>{t('pr.ptOpen', tc.unassignedPt.toFixed(0), tc.unassignedCount)}</span>}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
