import { useMemo } from 'react';
import { useT } from '../../i18n.jsx';
import { buildDemoProject } from '../../utils/demoProject.js';
import { treeStats } from '../../utils/scheduler.js';
import { renderRoadmapSvg } from '../../utils/roadmap.js';

export function Onboard({ onCreate, onLoad, onLoadDemo, fRef }) {
  const { t } = useT();

  // Inline Metro preview — uses the actual renderer with the demo tree.
  const previewSvg = useMemo(() => {
    try {
      const demo = buildDemoProject(t);
      const stats = treeStats(demo.tree);
      return renderRoadmapSvg({ tree: demo.tree, scheduled: [], stats });
    } catch {
      return '';
    }
  }, [t]);

  const FEATURES = [
    ['🌳', t('ob.feat.tree'), t('ob.feat.tree.desc')],
    ['📅', t('ob.feat.auto'), t('ob.feat.auto.desc')],
    ['🚆', t('ob.feat.metro'), t('ob.feat.metro.desc')],
    ['🧭', t('ob.feat.horizons'), t('ob.feat.horizons.desc')],
    ['⚡', t('ob.feat.cp'), t('ob.feat.cp.desc')],
    ['🕸', t('ob.feat.net'), t('ob.feat.net.desc')],
    ['🎯', t('ob.feat.focus'), t('ob.feat.focus.desc')],
  ];

  return (
    <div className="onboard">
      <div className="onboard-card fade">
        <div className="onboard-logo">Planr<span style={{ color: 'var(--ac)' }}>.</span></div>
        <div className="onboard-sub">{t('ob.sub')}</div>

        {previewSvg && (
          <div className="ob-preview">
            <div className="ob-preview-label">{t('ob.preview.label')}</div>
            <div className="ob-preview-svg" dangerouslySetInnerHTML={{ __html: previewSvg }} />
          </div>
        )}

        <div className="feat-grid">
          {FEATURES.map(([icon, title, desc]) => (
            <div key={title} className="feat">
              <span className="feat-icon">{icon}</span>
              <div className="feat-text"><strong>{title}</strong><span>{desc}</span></div>
            </div>
          ))}
        </div>
        <div className="ob-actions">
          <button className="ob-btn ob-pri" onClick={onCreate}>{t('ob.newProject')}</button>
          {onLoadDemo && (
            <button className="ob-btn ob-sec" onClick={onLoadDemo}>{t('ob.tryDemo')}</button>
          )}
          <div className="ob-div">{t('ob.or')}</div>
          <button className="ob-btn ob-sec" onClick={() => fRef.current?.click()}>{t('ob.loadProject')}</button>
        </div>
      </div>
    </div>
  );
}
