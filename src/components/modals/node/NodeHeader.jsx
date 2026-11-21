import { Icon } from '../../shared/Icon.jsx';
import { SBadge } from '../../shared/Badges.jsx';
import { SL } from '../../../constants.js';
import { CriticalPathBadge } from '../../shared/CriticalPathBadge.jsx';

export function NodeHeader({
  t,
  lang,
  f,
  s,
  node,
  ancestors,
  cpLabels,
  focusRequest,
  handleNavigate,
  isCp,
  isDirty,
  isLeaf,
  onDockSide,
  onNavigate,
  timeline,
}) {
  return (
    <>
      {ancestors.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--tx3)',
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ancestors.map((a, i) => (
            <span key={a.id}>
              {i > 0 && <span style={{ color: 'var(--b3)' }}> › </span>}
              <button
                type="button"
                onClick={() => handleNavigate(a.id)}
                data-htip={`${a.id} — ${a.name}`}
                style={{
                  appearance: 'none',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: 'inherit',
                  cursor: onNavigate ? 'pointer' : 'default',
                  font: 'inherit',
                }}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{a.id}</span>{' '}
                {a.name?.length > 25 ? a.name.slice(0, 23) + '…' : a.name}
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>{node.id}</span>
        {/* The item says what it is on every tab, not only on the one that
            happens to hold the name field. */}
        <span
          data-testid="nm-title"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--tx)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: '0 1 auto',
            maxWidth: '100%',
          }}
        >
          {f.name || node.name}
        </span>
        {isLeaf && <SBadge s={node.status} />}
        {!isLeaf && (
          <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 11 }}>
            {SL[f.status] || f.status}
          </span>
        )}
        {isCp && <CriticalPathBadge id={node.id} labels={cpLabels} />}
        {/* When it lands, on every tab: the commonest thing looked up. */}
        {timeline?.period && (
          <span data-testid="nm-lands" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
            {timeline.period.start.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')} →{' '}
            {timeline.period.end.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')}
          </span>
        )}
        {f.pinnedStart && (
          <span
            className="badge bo"
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => s('pinnedStart', '')}
            data-htip={t('p.clear')}
          >
            <Icon name="pin" size={10} />
            {f.pinnedStart}
            <Icon name="x" size={10} />
          </span>
        )}
        {/* The panel's dock button sends the editor here; without this the way back is
            a trip through Settings, which is a one-way door with extra steps. */}
        {onDockSide && (
          <button
            className="btn btn-ghost btn-icon sm"
            style={{ marginLeft: 'auto' }}
            data-htip={t('set.dockSideTip')}
            data-testid="editor-dock-side"
            aria-label={t('set.dockSideTip')}
            onClick={() => {
              if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
              onDockSide();
            }}
          >
            <Icon name="panelRight" size={13} />
          </button>
        )}
      </div>

      {/* Opened from a handoff bar: the bar was one stage of this task, and
          what the dialog edits is the whole task. Above the tabs, because it
          is true on every one of them — it used to sit on Workflow, where the
          click never sent anybody, and pointed at a handoff section that is
          switched off. */}
      {isLeaf && focusRequest?.section === 'handoff' && (
        <div
          data-testid="nm-handoff-hint"
          style={{
            margin: '0 0 10px',
            padding: '4px 8px',
            background: 'rgba(168,85,247,.10)',
            borderLeft: '2px solid rgba(168,85,247,.6)',
            fontSize: 11,
            color: 'var(--tx2)',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="swap" size={11} />
          {t('nm.handoffHint', (focusRequest.handoffStage ?? 0) + 1)}
        </div>
      )}
    </>
  );
}
