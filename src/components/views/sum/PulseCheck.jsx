import { iso } from '../../../utils/date.js';
import { deadlineStatus } from '../../../utils/timeline.js';
import { useT } from '../../../i18n.jsx';

// Pulse Check — actionable warnings instead of static horizon explainer
export function PulseCheck({ confidence, goals, h1Date, h2Date, iMap, onNavigate, scheduled, timelineById, tree }) {
  const { t } = useT();
  const notDone = scheduled.filter(s => s.status !== 'done');
  const inH1 = notDone.filter(s => s.startD && s.startD <= h1Date);
  const inH2 = notDone.filter(s => s.startD && s.startD > h1Date && s.startD <= h2Date);
  const h1NoAssign = inH1.filter(s => !s.personId);
  const h1NoEstimate = inH1.filter(s => {
    const n = iMap[s.id];
    return !n?.best || n.best === 0;
  });
  const h2Exploratory = inH2.filter(s => confidence[s.id] === 'exploratory');
  const blockedNoOwner = notDone.filter(s => {
    if (s.personId) return false;
    const n = iMap[s.id];
    const deps = n?.deps || [];
    return deps.some(d => {
      const dt = tree.find(r => r.id === d);
      return dt && dt.status !== 'done';
    });
  });
  // Completed deadlines never count as a pulse-check warning — the work is
  // delivered, so there is no action left to take.
  const deadlinesAtRisk = goals.filter(g => g.type === 'deadline' && deadlineStatus(tree, scheduled, g, timelineById[g.id])?.isLate);
  const checks = [
    h1NoAssign.length > 0 && { warn: true, text: t('pc.h1NoPerson', h1NoAssign.length), items: h1NoAssign },
    h1NoEstimate.length > 0 && { warn: true, text: t('pc.h1NoEstimate', h1NoEstimate.length), items: h1NoEstimate },
    h2Exploratory.length > 0 && { warn: true, text: t('pc.h2Exploratory', h2Exploratory.length), items: h2Exploratory },
    blockedNoOwner.length > 0 && { warn: true, text: t('pc.blockedNoPerson', blockedNoOwner.length), items: blockedNoOwner },
    deadlinesAtRisk.length > 0 && { warn: true, text: t('pc.deadlinesAtRisk', deadlinesAtRisk.length), items: deadlinesAtRisk },
  ].filter(Boolean);
  const allClear = checks.length === 0;

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${allClear ? 'var(--gr)' : 'var(--am)'}`,
        borderRadius: 'var(--r)',
        padding: '12px 16px',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: checks.length ? 10 : 0 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: allClear ? 'var(--gr)' : 'var(--am)',
          }}
        >
          {t('pc.title')}
        </span>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
          <span style={{ color: 'var(--gr)' }}>H1 {iso(h1Date)}</span>
          <span style={{ color: 'var(--am)' }}>H2 {iso(h2Date)}</span>
        </div>
        <span
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)', cursor: 'pointer' }}
          onClick={() => onNavigate?.(null, 'plan')}
        >
          {t('s.openPlanReview')}
        </span>
      </div>
      {allClear && <div style={{ fontSize: 12, color: 'var(--gr)' }}>{t('pc.allClear')}</div>}
      {checks.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
          <span style={{ color: 'var(--am)', flexShrink: 0 }}>!</span>
          <span style={{ color: 'var(--tx)' }}>{c.text}</span>
          {c.items?.[0]?.id && (
            <span
              style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', cursor: 'pointer' }}
              onClick={() => onNavigate?.(c.items[0].id, 'tree')}
            >
              → {c.items[0].id}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
