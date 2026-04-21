import { useT } from '../../i18n.jsx';
import { FeatureCarousel } from '../shared/FeatureCarousel.jsx';

export function Onboard({ onCreate, onLoad, onLoadDemo, fRef }) {
  const { t } = useT();

  const FEATURES = [
    ['🌳', t('ob.feat.tree'), t('ob.feat.tree.desc'), t('ob.feat.tree.htip')],
    ['📅', t('ob.feat.auto'), t('ob.feat.auto.desc'), t('ob.feat.auto.htip')],
    ['🚆', t('ob.feat.metro'), t('ob.feat.metro.desc'), t('ob.feat.metro.htip')],
    ['🧭', t('ob.feat.horizons'), t('ob.feat.horizons.desc'), t('ob.feat.horizons.htip')],
    ['⚡', t('ob.feat.cp'), t('ob.feat.cp.desc'), t('ob.feat.cp.htip')],
    ['🕸', t('ob.feat.net'), t('ob.feat.net.desc'), t('ob.feat.net.htip')],
    ['🎯', t('ob.feat.focus'), t('ob.feat.focus.desc'), t('ob.feat.focus.htip')],
  ];

  return (
    <div className="onboard">
      <div className="onboard-card fade">
        {/* ── Hero ── */}
        <div className="ob-hero">
          <div className="ob-hero-text">
            <div className="ob-logo">Planr<span className="ob-logo-dot">.</span></div>
            <div className="ob-tagline">{t('ob.tagline')}</div>
            <div className="ob-sub">{t('ob.sub')}</div>
            <div className="ob-cta">
              <button className="ob-btn ob-btn-pri" onClick={onCreate}>
                <span>{t('ob.newProject')}</span>
                <span className="ob-btn-arrow">→</span>
              </button>
              {onLoadDemo && (
                <button className="ob-btn ob-btn-ghost" onClick={onLoadDemo}>
                  {t('ob.tryDemo')}
                </button>
              )}
            </div>
            <button className="ob-link" onClick={() => fRef.current?.click()}>
              {t('ob.loadProject')}
            </button>
          </div>

          <FeatureCarousel />
        </div>

        {/* ── Feature chips ── */}
        <div className="ob-feat-row">
          {FEATURES.map(([icon, title, desc, htip]) => (
            <div key={title} className="ob-chip" data-htip={htip || desc}>
              <span className="ob-chip-icon">{icon}</span>
              <span className="ob-chip-label">{title}</span>
            </div>
          ))}
        </div>

        {/* ── Footer credit ── */}
        <div className="ob-foot">
          <span>{t('ob.foot.offline')}</span>
          <span className="ob-foot-sep">·</span>
          <span>{t('ob.foot.nobackend')}</span>
          <span className="ob-foot-sep">·</span>
          <span>{t('ob.foot.formats')}</span>
        </div>
      </div>
    </div>
  );
}
