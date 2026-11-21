import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon.jsx';
import { useT } from '../../../i18n.jsx';
import { usePortalRoot } from '../../../utils/embedHost.js';
import { SCENARIO_NEW_EVENT } from '../../../utils/events.js';
import { changeCountLabel, conflictLabel, storedCount } from '../../../utils/scenarioUi/format.js';
import { usePopover } from './usePopover.js';

const MENU_WIDTH = 300;

// ── the switch in the top bar ───────────────────────────────────────────────

export function ScenarioSwitch({ scenarios, activeId, activeChanges, onSwitch, onCreate, onRename, onDelete, onDuplicate }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null); // name of the scenario being created
  const [renaming, setRenaming] = useState(null); // { id, name }
  const ref = useRef(null);
  const portalRoot = usePortalRoot();
  const [flipped, setFlipped] = useState(false);
  const active = scenarios.find(s => s.id === activeId) || null;
  usePopover(open, setOpen, ref);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setRenaming(null);
      return;
    }
    // Nothing to choose between yet: opening the menu IS starting a scenario.
    if (!scenarios.length) setDraft(d => (d == null ? '' : d));
  }, [open, scenarios.length]);
  // Same measuring as the file menu: room up to the edge of the app's own box.
  useEffect(() => {
    if (!open) return;
    const box = ref.current?.getBoundingClientRect?.();
    if (!box) return;
    const root = portalRoot?.getBoundingClientRect ? portalRoot : null;
    const rootBox = root?.getBoundingClientRect();
    const rightEdge = Math.min(window.innerWidth || Infinity, rootBox?.width ? rootBox.right : Infinity);
    const scale = root?.offsetWidth ? rootBox.width / root.offsetWidth : 1;
    setFlipped(rightEdge - box.left < MENU_WIDTH * (scale > 0 ? scale : 1));
  }, [open, portalRoot]);
  // The palette's "New scenario…" opens this menu with the name field ready.
  useEffect(() => {
    const h = () => {
      setOpen(true);
      setDraft('');
    };
    window.addEventListener(SCENARIO_NEW_EVENT, h);
    return () => window.removeEventListener(SCENARIO_NEW_EVENT, h);
  }, []);

  const pick = id => {
    setOpen(false);
    onSwitch(id);
  };
  const create = () => {
    const name = draft;
    setOpen(false);
    onCreate(name || '');
  };
  const commitRename = () => {
    if (renaming?.name.trim()) onRename(renaming.id, renaming.name);
    setRenaming(null);
  };

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={`btn btn-xs scn-switch${active ? ' in' : ''}${open ? ' on' : ''}`}
        data-testid="scenario-switch"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active ? t('scn.switchLabelIn', active.name) : t('scn.switchLabel')}
        onClick={() => setOpen(o => !o)}
        data-htip={active ? t('scn.switchTipIn', active.name) : t('scn.switchTip')}
      >
        <Icon name="branch" size={13} />
        <span className="scn-switch-name">{active ? active.name : t('scn.plan')}</span>
        {!active && scenarios.length > 0 && <span className="scn-switch-count">{scenarios.length}</span>}
        <Icon name="chevronDown" size={11} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('scn.menuLabel')}
          data-testid="scenario-menu"
          className="layer-popover scn-menu"
          style={flipped ? { right: 0 } : { left: 0 }}
        >
          <button
            type="button"
            aria-pressed={!active}
            className={`scn-menu-row${!active ? ' on' : ''}`}
            data-testid="scenario-pick-plan"
            onClick={() => pick(null)}
          >
            <span className="scn-menu-check">{!active && <Icon name="check" size={13} />}</span>
            <span className="scn-menu-text">
              <span className="scn-menu-name">{t('scn.plan')}</span>
              <span className="scn-menu-sub">{t('scn.planSub')}</span>
            </span>
          </button>
          {scenarios.length > 0 && <div className="scn-menu-head">{t('scn.scenarios')}</div>}
          {scenarios.map(s => {
            const isActive = s.id === activeId;
            const count = isActive ? activeChanges : storedCount(s);
            if (renaming?.id === s.id) {
              return (
                <div key={s.id} className="scn-menu-row editing">
                  <span className="scn-menu-check" />
                  <input
                    autoFocus
                    className="scn-menu-input"
                    value={renaming.name}
                    data-testid="scenario-rename-input"
                    aria-label={t('scn.rename')}
                    onChange={e => setRenaming({ id: s.id, name: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    // Clicking away is not "save": a half-typed name stays unsaved.
                    onBlur={() => setRenaming(null)}
                  />
                  <button type="button" className="btn btn-pri btn-xs" onMouseDown={e => e.preventDefault()} onClick={commitRename}>
                    {t('save')}
                  </button>
                </div>
              );
            }
            return (
              <div key={s.id} className={`scn-menu-row${isActive ? ' on' : ''}`}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  className="scn-menu-main"
                  data-testid={`scenario-pick-${s.id}`}
                  onClick={() => pick(s.id)}
                >
                  <span className="scn-menu-check">{isActive && <Icon name="check" size={13} />}</span>
                  <span className="scn-menu-text">
                    <span className="scn-menu-name">{s.name}</span>
                    <span className="scn-menu-sub">
                      {changeCountLabel(t, count)}
                      {s.lost ? ` · ${conflictLabel(t, s.lost)}` : ''}
                    </span>
                  </span>
                </button>
                <span className="scn-menu-actions">
                  <button
                    type="button"
                    className="scn-icon-btn"
                    aria-label={`${t('scn.rename')}: ${s.name}`}
                    data-htip={t('scn.rename')}
                    data-testid={`scenario-rename-${s.id}`}
                    onClick={() => setRenaming({ id: s.id, name: s.name })}
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                  <button
                    type="button"
                    className="scn-icon-btn"
                    aria-label={`${t('scn.duplicate')}: ${s.name}`}
                    data-htip={t('scn.duplicate')}
                    data-testid={`scenario-duplicate-${s.id}`}
                    onClick={() => {
                      setOpen(false);
                      onDuplicate(s.id);
                    }}
                  >
                    <Icon name="copy" size={12} />
                  </button>
                  {/* The scenario on screen is deleted from its own bar, where what
                that means (you leave it) is visible. */}
                  {!isActive && (
                    <button
                      type="button"
                      className="scn-icon-btn"
                      aria-label={`${t('scn.delete')}: ${s.name}`}
                      data-htip={t('scn.deleteTip')}
                      data-testid={`scenario-delete-${s.id}`}
                      onClick={() => onDelete(s.id)}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          <div className="scn-menu-foot">
            {scenarios.length === 0 && <p className="scn-menu-hint">{t('scn.hint')}</p>}
            {draft == null ? (
              <button type="button" className="scn-menu-row add" data-testid="scenario-new" onClick={() => setDraft('')}>
                <span className="scn-menu-check">
                  <Icon name="plus" size={13} />
                </span>
                <span className="scn-menu-text">
                  <span className="scn-menu-name">{t('scn.new')}</span>
                  <span className="scn-menu-sub">{active ? t('scn.newSubIn') : t('scn.newSub')}</span>
                </span>
              </button>
            ) : (
              <div className="scn-menu-row editing">
                <span className="scn-menu-check">
                  <Icon name="plus" size={13} />
                </span>
                <input
                  autoFocus
                  className="scn-menu-input"
                  value={draft}
                  placeholder={t('scn.namePlaceholder')}
                  data-testid="scenario-new-input"
                  aria-label={t('scn.new')}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') create();
                    if (e.key === 'Escape') {
                      if (scenarios.length) setDraft(null);
                      else setOpen(false);
                    }
                  }}
                />
                <button type="button" className="btn btn-pri btn-xs" data-testid="scenario-new-ok" onClick={create}>
                  {t('scn.create')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
