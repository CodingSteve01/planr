import { activateOnPress } from '../../app/shell.js';

export function TabBar({ view, handlers, TABS, _t, activeTabRef, tabBarRef }) {
  const { setTab, tab, tabFades } = view;
  const { syncTabFades } = handlers;
  return (
    <div className="tab-bar-wrap">
      <div className="tab-bar" role="tablist" aria-label={_t('tab.barLabel')} ref={tabBarRef} onScroll={syncTabFades}>
        {TABS.map(t => (
          <div
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            ref={tab === t.id ? activeTabRef : undefined}
            className={`tab${tab === t.id ? ' on' : ''}`}
            onMouseDown={e => activateOnPress(e, () => setTab(t.id))}
            onClick={e => {
              if (e.detail === 0) setTab(t.id);
            }}
          >
            {t.label}
            {t.isNew && <span className="badge-new">{_t('tour.newBadge')}</span>}
          </div>
        ))}
        <div style={{ flex: 1, minWidth: 16 }} />
      </div>
      <div className={`tab-bar-fade l${tabFades.l ? ' on' : ''}`} />
      <div className={`tab-bar-fade r${tabFades.r ? ' on' : ''}`} />
    </div>
  );
}
