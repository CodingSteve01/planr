import { ALT, formatKey } from '../../../utils/shortcuts.js';

export function NodeTabBar({ nmTabs, activeNmTab, setNmTab, activateTab, focusActiveTab, tabBarRef }) {
  return (
    <div
      ref={tabBarRef}
      className="qe-tabs"
      role="tablist"
      style={{ margin: '0 -22px 14px', padding: '0 22px' }}
      onKeyDown={e => {
        const at = nmTabs.findIndex(x => x.id === activeNmTab);
        const to =
          e.key === 'ArrowRight'
            ? (at + 1) % nmTabs.length
            : e.key === 'ArrowLeft'
              ? (at - 1 + nmTabs.length) % nmTabs.length
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? nmTabs.length - 1
                  : -1;
        if (to < 0) return;
        e.preventDefault();
        setNmTab(nmTabs[to].id);
        focusActiveTab();
      }}
    >
      {nmTabs.map((x, i) => (
        <button
          key={x.id}
          role="tab"
          // One tab stop for the whole bar; the arrows move within it.
          tabIndex={activeNmTab === x.id ? 0 : -1}
          data-htip={i < 9 ? `${x.label} · ${formatKey(`${ALT}${i + 1}`)}` : undefined}
          aria-selected={activeNmTab === x.id}
          className={`qe-tab${activeNmTab === x.id ? ' active' : ''}`}
          data-testid={`nm-tab-${x.id}`}
          onMouseDown={e => activateTab(e, () => setNmTab(x.id))}
          onClick={e => {
            if (e.detail === 0) setNmTab(x.id);
          }}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}
