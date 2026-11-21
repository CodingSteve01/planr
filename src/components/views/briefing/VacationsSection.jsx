import { localDate } from '../../../utils/date.js';
import { fmtDateDE, weeksBetween } from '../../../utils/briefing/briefingDates.js';
import { useT } from '../../../i18n.jsx';

export function VacationsSection({ vacationsInHorizon, members, teams, personFilter }) {
  const { t } = useT();
  return (
    <>
      <div className="section-h">{t('bv.vacations')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {vacationsInHorizon.map((v, i) => {
          const member = members.find(m => m.id === v.person);
          if (!member) return null;
          if (personFilter && member.id !== personFilter) return null;
          const tm = teams.find(t => t.id === member.team);
          const wks = weeksBetween(localDate(v.from), localDate(v.to));
          return (
            <div
              key={i}
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--b)',
                borderRadius: 'var(--r)',
                padding: '8px 12px',
                borderLeft: `3px solid ${tm?.color || 'var(--ac)'}`,
              }}
            >
              <span style={{ fontWeight: 600 }}>{member.name}</span>
              <span style={{ color: 'var(--tx3)', marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 12 }}>
                {fmtDateDE(localDate(v.from))}–{fmtDateDE(localDate(v.to))}
              </span>
              {wks > 0 && <span style={{ color: 'var(--tx3)', marginLeft: 6, fontSize: 11 }}>({wks}w)</span>}
              {v.note && <span style={{ color: 'var(--tx3)', marginLeft: 8, fontSize: 12 }}>{v.note}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
