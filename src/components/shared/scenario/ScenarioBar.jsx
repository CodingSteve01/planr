import { useRef, useState } from 'react';
import { Icon } from '../Icon.jsx';
import { useT } from '../../../i18n.jsx';
import { changeCountLabel, conflictLabel } from '../../../utils/scenarioUi/format.js';
import { useFmt } from './useFmt.js';
import { usePopover } from './usePopover.js';

// ── the bar that says you are not in the plan ───────────────────────────────

export function scenarioHeadline(t, fmt, totals, changeCount) {
  if (!changeCount) return t('scn.barEmpty');
  if (!totals) return '';
  const ends = [];
  if (totals.later) ends.push(t('scn.barLater', totals.later, fmt.shift(totals.maxLater)));
  if (totals.earlier) ends.push(t('scn.barEarlier', totals.earlier, fmt.shift(totals.maxEarlier)));
  const parts = [];
  // First how wide it reaches, then how far: a project whose end holds while
  // half its tasks slip is affected, and the bar must not read as if it were not.
  if (totals.affected > (totals.later || 0) + (totals.earlier || 0)) parts.push(t('scn.barAffected', totals.affected));
  if (ends.length) parts.push(`${t('scn.barEnds')} ${ends.join(', ')}`);
  if (totals.newlyLate) parts.push(t('scn.barNewlyLate', totals.newlyLate));
  if (totals.rescued) parts.push(t('scn.barRescued', totals.rescued));
  if (!parts.length) parts.push(totals.itemsMoved ? t('scn.barItemsOnly', totals.itemsMoved) : t('scn.barNoShift'));
  return parts.join(' · ');
}

export function ScenarioBar({
  scenario,
  changeCount,
  comparison,
  conflicts,
  onRename,
  onDuplicate,
  onCompare,
  onApply,
  onDelete,
  onLeave,
}) {
  const { t } = useT();
  const fmt = useFmt();
  const [editing, setEditing] = useState(null);
  const [more, setMore] = useState(false);
  const moreRef = useRef(null);
  usePopover(more, setMore, moreRef);
  if (!scenario) return null;
  const totals = comparison?.totals;
  const commit = () => {
    if (editing != null && editing.trim() && editing.trim() !== scenario.name) onRename(scenario.id, editing);
    setEditing(null);
  };
  const tone = totals?.newlyLate ? 'var(--st-risk)' : undefined;
  const menuItem = (id, icon, label, run, danger) => (
    <button
      type="button"
      className={`scn-more-item${danger ? ' danger' : ''}`}
      data-testid={`scenario-${id}`}
      onClick={() => {
        setMore(false);
        run();
      }}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
  // The wrapper is the size container: an Obsidian pane is narrow while the
  // window is wide, so the bar answers to its own width, not the viewport's.
  return (
    <div className="scn-bar-wrap">
      <div className="scn-bar" data-testid="scenario-bar" role="region" aria-label={t('scn.label')}>
        <span className="scn-bar-tag">
          <Icon name="branch" size={13} />
          {t('scn.label')}
        </span>
        {editing == null ? (
          <button
            type="button"
            className="scn-bar-name"
            data-testid="scenario-bar-name"
            onClick={() => setEditing(scenario.name)}
            aria-label={`${t('scn.renameTip')}: ${scenario.name}`}
            data-htip={t('scn.renameTip')}
          >
            {scenario.name}
          </button>
        ) : (
          <input
            autoFocus
            className="scn-bar-input"
            value={editing}
            aria-label={t('scn.rename')}
            data-testid="scenario-bar-input"
            onChange={e => setEditing(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(null);
              }
            }}
          />
        )}
        <button
          type="button"
          className="scn-bar-summary"
          data-testid="scenario-bar-summary"
          onClick={onCompare}
          data-htip={t('scn.compareTip')}
          aria-live="polite"
        >
          <span className="scn-bar-count">{changeCountLabel(t, changeCount)}</span>
          <span className="scn-bar-impact" style={tone ? { color: tone } : undefined}>
            {scenarioHeadline(t, fmt, totals, changeCount)}
          </span>
        </button>
        {conflicts > 0 && (
          <button
            type="button"
            className="scn-bar-warn"
            data-testid="scenario-bar-conflicts"
            onClick={onCompare}
            data-htip={t('scn.conflictTip')}
          >
            <Icon name="alert" size={12} />
            {conflictLabel(t, conflicts)}
          </button>
        )}
        <span className="sp" />
        <button type="button" className="btn btn-sec btn-xs scn-wide" data-testid="scenario-compare" onClick={onCompare}>
          {t('scn.compare')}
        </button>
        <button
          type="button"
          className="btn btn-xs scn-apply"
          data-testid="scenario-apply"
          disabled={!changeCount}
          onClick={onApply}
          data-htip={t('scn.applyTip')}
        >
          <span className="scn-wide">{t('scn.apply')}</span>
          <span className="scn-narrow">{t('scn.applyShort')}</span>
        </button>
        <span className="vsep" />
        {/* The way out is never the control that gets clipped: it keeps its place
        and its label at every width. */}
        <button type="button" className="btn btn-sec btn-xs" data-testid="scenario-leave" onClick={onLeave} data-htip={t('scn.leaveTip')}>
          {t('scn.leave')}
        </button>
        <span ref={moreRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            className={`btn btn-ghost btn-xs${more ? ' on' : ''}`}
            data-testid="scenario-more"
            aria-haspopup="menu"
            aria-expanded={more}
            aria-label={t('scn.more')}
            data-htip={t('scn.more')}
            onClick={() => setMore(m => !m)}
          >
            <Icon name="more" size={14} />
          </button>
          {more && (
            <div className="layer-popover scn-more" data-testid="scenario-more-menu">
              {menuItem('rename', 'pencil', t('scn.rename'), () => setEditing(scenario.name))}
              {menuItem('duplicate', 'copy', t('scn.duplicate'), () => onDuplicate(scenario.id))}
              {menuItem('discard', 'trash', t('scn.deleteThis'), () => onDelete(scenario.id), true)}
            </div>
          )}
        </span>
      </div>
    </div>
  );
}

// What just happened, where the bar was, with the way back.
export function ScenarioNotice({ notice, onUndo, onClose }) {
  const { t } = useT();
  if (!notice) return null;
  const text =
    notice.kind === 'applied'
      ? t('scn.noticeApplied', notice.name, changeCountLabel(t, notice.changes))
      : t('scn.noticeDeleted', notice.name);
  return (
    <div className="scn-notice-bar" data-testid="scenario-notice" role="status">
      <Icon name={notice.kind === 'applied' ? 'check' : 'trash'} size={13} />
      <span className="scn-notice-text">{text}</span>
      <button type="button" className="btn btn-sec btn-xs" data-testid="scenario-notice-undo" onClick={onUndo}>
        {t('scn.noticeUndo')}
      </button>
      <span className="sp" />
      <button type="button" className="scn-icon-btn" aria-label={t('close')} onClick={onClose}>
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
