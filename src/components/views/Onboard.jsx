import { useT } from '../../i18n.jsx';
import { Icon } from '../shared/Icon.jsx';
import { FeatureCarousel } from '../shared/FeatureCarousel.jsx';

export function Onboard({ onCreate, onLoad, onLoadDemo, onJiraImport, fRef }) {
  const { t } = useT();

  // 4 unique-selling features promoted to hero tiles (below the hero row).
  // Less visual noise than 10 chips, emphasizes what sets Planr apart.
  const HERO_FEATURES = [
    ['swap', t('ob.feat.offboard'), t('ob.feat.offboard.desc'), t('ob.feat.offboard.htip')],
    ['calculator', t('ob.feat.cap'), t('ob.feat.cap.desc'), t('ob.feat.cap.htip')],
    ['train', t('ob.feat.metro'), t('ob.feat.metro.desc'), t('ob.feat.metro.htip')],
    ['bolt', t('ob.feat.cp'), t('ob.feat.cp.desc'), t('ob.feat.cp.htip')],
  ];
  // Supporting features as a compact chip row under the hero tiles.
  const CHIPS = [
    ['calendar', t('ob.feat.auto'), t('ob.feat.auto.htip')],
    ['list', t('ob.feat.tree'), t('ob.feat.tree.htip')],
    ['compass', t('ob.feat.horizons'), t('ob.feat.horizons.htip')],
    ['doc', t('ob.feat.export'), t('ob.feat.export.htip')],
    ['network', t('ob.feat.net'), t('ob.feat.net.htip')],
    ['target', t('ob.feat.focus'), t('ob.feat.focus.htip')],
    ['save', t('ob.feat.offline'), t('ob.feat.offline.htip')],
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
                <span className="ob-btn-arrow"><Icon name="chevronRight" size={12} /></span>
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
            {/* The third way in, and for most people the real one: the work is
                already in a Jira project and nobody retypes two hundred
                tickets to try a planner. */}
            {onJiraImport && (
              <button className="ob-link" data-testid="onboard-jira-import" onClick={onJiraImport}>
                {t('ob.jiraImport')}
              </button>
            )}
          </div>

          <FeatureCarousel />
        </div>

        {/* ── Hero feature tiles (4 unique-selling) ── */}
        <div className="ob-tiles">
          {HERO_FEATURES.map(([icon, title, desc, htip]) => (
            <div key={title} className="ob-tile" data-htip={htip}>
              <div className="ob-tile-icon"><Icon name={icon} size={26} strokeWidth={1.5} /></div>
              <div className="ob-tile-title">{title}</div>
              <div className="ob-tile-desc">{desc}</div>
            </div>
          ))}
        </div>

        {/* ── Supporting feature chips ── */}
        <div className="ob-feat-row">
          {CHIPS.map(([icon, title, htip]) => (
            <div key={title} className="ob-chip" data-htip={htip}>
              <span className="ob-chip-icon"><Icon name={icon} size={14} /></span>
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
