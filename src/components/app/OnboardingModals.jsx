import { Icon } from '../shared/Icon.jsx';
import { Tour } from '../shared/Tour.jsx';

export function OnboardingModals({ view, handlers, NEW_FEATURES, TOUR_STEPS, _t }) {
  const { setTourStep, showNewFeat, tourStep } = view;
  const { closeTour, dismissNewFeat, startTour } = handlers;
  return (
    <>
      {/* ── Onboarding tour ── */}
      {tourStep !== null && (
        <Tour
          steps={TOUR_STEPS}
          step={tourStep}
          onNext={() => setTourStep(s => Math.min(s + 1, TOUR_STEPS.length - 1))}
          onPrev={() => setTourStep(s => Math.max(s - 1, 0))}
          onSkip={closeTour}
        />
      )}

      {/* ── New-feature popover (one-time, existing users) ── */}
      {showNewFeat && tourStep === null && (
        <div className="new-feat-backdrop fade" onClick={dismissNewFeat}>
          <div className="new-feat-card fade" onClick={e => e.stopPropagation()}>
            <div className="new-feat-title">
              <span style={{ display: 'inline-flex', color: 'var(--st-done)' }}>
                <Icon name="sparkle" size={16} />
              </span>
              {_t('new.title')}
            </div>
            <ul className="new-feat-list">
              {NEW_FEATURES.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <div className="new-feat-foot" style={{ gap: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 12, color: 'var(--tx3)' }}
                onClick={() => {
                  dismissNewFeat();
                  startTour();
                }}
              >
                {_t('tour.restartTour')} →
              </button>
              <button className="btn btn-pri btn-sm" onClick={dismissNewFeat}>
                {_t('new.dismiss')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
