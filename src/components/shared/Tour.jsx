import { useEffect, useCallback } from 'react';
import { useT } from '../../i18n.jsx';

/**
 * Planr onboarding tour — lightweight custom step overlay.
 *
 * Props:
 *   steps   — array of { icon, title, body } (resolved from i18n in App.jsx)
 *   step    — current step index (0-based)
 *   onNext  — () => void
 *   onPrev  — () => void
 *   onSkip  — () => void  (persists dismissed state)
 */
export function Tour({ steps, step, onNext, onPrev, onSkip }) {
  const { t } = useT();

  // Close on Escape
  const onKey = useCallback(e => {
    if (e.key === 'Escape') onSkip();
  }, [onSkip]);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (!steps?.length) return null;

  const current = steps[step] || steps[0];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div className="tour-backdrop fade" onClick={onSkip}>
      <div className="tour-card fade" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('tour.aria')}>
        {/* Progress bar */}
        <div className="tour-progress">
          <div className="tour-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Step counter */}
        <div className="tour-counter">
          {t('tour.step', step + 1, steps.length)}
        </div>

        {/* Content */}
        <div className="tour-icon">{current.icon}</div>
        <h2 className="tour-title">{current.title}</h2>
        <p className="tour-body">{current.body}</p>

        {/* Dot indicators */}
        <div className="tour-dots">
          {steps.map((_, i) => (
            <span key={i} className={`tour-dot${i === step ? ' on' : ''}`} />
          ))}
        </div>

        {/* Actions */}
        <div className="tour-actions">
          <button className="btn btn-ghost btn-sm tour-skip" onClick={onSkip}>
            {t('tour.skip')}
          </button>
          <div className="tour-nav">
            {!isFirst && (
              <button className="btn btn-sec btn-sm" onClick={onPrev}>
                {t('back')}
              </button>
            )}
            <button className="btn btn-pri btn-sm tour-next" onClick={isLast ? onSkip : onNext}>
              {isLast ? t('tour.finish') : t('next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
