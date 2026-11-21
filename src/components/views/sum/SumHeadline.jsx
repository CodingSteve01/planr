import { iso } from '../../../utils/date.js';
import { useT } from '../../../i18n.jsx';
import { MIN_VISIBLE_PROGRESS_DELTA_PCT, progressDeltaLabel, progressPctLabel } from '../../../utils/progress.js';

// The one big figure, the forecast and movement beside it, and the progress
// bar with its past and future stripes.
export function SumHeadline({
  currentPct,
  futureOverallDeltaLabel,
  futureOverallProg,
  futureOverallTip,
  futurePct,
  overallDelta,
  pastOverallProg,
  pastPct,
  prog,
  showFutureStripe,
  showPastStripe,
  sinceDate,
  tR,
}) {
  const { t } = useT();
  return (
    <>
      {/* One figure carries the view. It used to be a 28px number at the head
        of a row of eight chips, all the same size and each with its own
        colour, so nothing said which of them was the answer. Everything else
        ranks under it: the forecast beside it because it is the same
        quantity, the rest in cards below because they are different ones. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            data-testid="overview-progress"
            style={{ fontFamily: 'var(--font-display)', fontSize: 58, lineHeight: 1, letterSpacing: '-.015em', color: 'var(--tx)' }}
          >
            {progressPctLabel(prog)}
            <span style={{ fontSize: 28, color: 'var(--tx3)', marginLeft: 2 }}>%</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{t('s.progressCaption', Math.round(tR))}</span>
        </div>

        {futureOverallProg != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span
                data-testid="overview-plan"
                data-htip={futureOverallTip}
                style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 500, color: 'var(--tx2)', cursor: 'help' }}
              >
                {progressPctLabel(futureOverallProg)}%
              </span>
              {futureOverallDeltaLabel && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--st-done)',
                    background: 'var(--st-done-soft)',
                    borderRadius: 3,
                    padding: '1px 5px',
                  }}
                >
                  {futureOverallDeltaLabel}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{t('s.planLabel')}</span>
          </div>
        )}

        {overallDelta != null && Math.abs(overallDelta) >= MIN_VISIBLE_PROGRESS_DELTA_PCT && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 6 }}>
            <span
              data-htip={t('diff.tipPastNow', progressPctLabel(pastOverallProg), iso(sinceDate), progressPctLabel(prog))}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 19,
                fontWeight: 500,
                color: overallDelta >= 0 ? 'var(--st-done)' : 'var(--st-risk)',
                cursor: 'help',
              }}
            >
              {progressDeltaLabel(overallDelta)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
              {t('diff.since')} {iso(sinceDate)}
            </span>
          </div>
        )}
        {overallDelta != null && Math.abs(overallDelta) < MIN_VISIBLE_PROGRESS_DELTA_PCT && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 6 }}>
            <span
              data-htip={t('diff.noMovement')}
              style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 500, color: 'var(--tx3)', cursor: 'help' }}
            >
              ±0%
            </span>
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
              {t('diff.since')} {iso(sinceDate)}
            </span>
          </div>
        )}
      </div>
      <div className="prog-wrap" style={{ height: 8, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
        <div className="prog-fill" style={{ width: `${currentPct}%`, position: 'absolute', inset: '0 auto 0 0', zIndex: 1 }} />
        {showPastStripe && (
          <div
            data-htip={t('diff.tipPastNow', progressPctLabel(pastPct), iso(sinceDate), progressPctLabel(currentPct))}
            style={{
              position: 'absolute',
              left: `${pastPct}%`,
              width: `${currentPct - pastPct}%`,
              top: 0,
              bottom: 0,
              zIndex: 2,
              background: 'repeating-linear-gradient(115deg, var(--diff) 0 7px, color-mix(in srgb, var(--diff) 45%, var(--bg2)) 7px 13px)',
              opacity: 0.95,
              cursor: 'help',
            }}
          />
        )}
        {showFutureStripe && (
          <div
            data-htip={futureOverallTip}
            style={{
              position: 'absolute',
              left: `${currentPct}%`,
              width: `${futurePct - currentPct}%`,
              top: 0,
              bottom: 0,
              zIndex: 2,
              background: 'repeating-linear-gradient(115deg, var(--ac) 0 7px, color-mix(in srgb, var(--ac) 45%, var(--bg2)) 7px 13px)',
              opacity: 0.95,
              cursor: 'help',
            }}
          />
        )}
        {/* Past-progress marker: thin vertical line on the bar showing where
          progress sat at the cutoff. Makes the gained delta tangible. */}
        {showPastStripe && (
          <div
            data-htip={t('diff.tipPastNow', progressPctLabel(pastPct), iso(sinceDate), progressPctLabel(currentPct))}
            style={{
              position: 'absolute',
              left: `${pastPct}%`,
              top: -2,
              bottom: -2,
              width: 2,
              background: 'var(--diff)',
              opacity: 0.9,
              cursor: 'help',
              zIndex: 3,
            }}
          />
        )}
      </div>
    </>
  );
}
