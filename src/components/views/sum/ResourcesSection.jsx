import { useT } from '../../../i18n.jsx';

// Team effort - compact
export function ResourcesSection({ byT, members, onboard, teams, tR }) {
  const { t } = useT();
  return (
    <>
      {/* Team effort - compact */}
      <div className="section-h">{t('s.resources')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {/* People on the team TODAY. The raw list keeps everyone who ever was,
          so this used to count leavers beside a capacity figure they no longer
          contribute to. Departed members are named underneath rather than
          dropped silently. */}
        <div className="sum-card" style={{ minWidth: 80 }}>
          <div className="sum-v">{onboard}</div>
          <div className="sum-l">{t('s.people')}</div>
          {members.length > onboard && (
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{t('s.peopleLeft', members.length - onboard)}</div>
          )}
        </div>
        <div className="sum-card" style={{ minWidth: 80 }}>
          <div className="sum-v" style={{ color: 'var(--gr)' }}>
            {tR.toFixed(0)}
          </div>
          <div className="sum-l">{t('s.totalPt')}</div>
        </div>
        {Object.entries(byT)
          .sort()
          .map(([tk, d]) => {
            const team = teams.find(x => x.id === tk);
            return (
              <div key={tk} className="sum-card" style={{ minWidth: 100 }}>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 2 }}>{team?.name || tk}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: team?.color || 'var(--tx)' }}>
                  {d.pt.toFixed(0)} PT
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                  {d.t} {t('s.tasks')}
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
