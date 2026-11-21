import { Icon } from '../../shared/Icon.jsx';
import { isLeafNode } from '../../../utils/scheduler.js';
import { ATTN_TONE, ATTN_ICON, ATTN_ORDER, ATTN_PREVIEW, REASON_KEY } from '../../../utils/briefing/briefingMarks.js';
import { StatusCycleButton } from './StatusCycleButton.jsx';
import { useT } from '../../../i18n.jsx';

export function AttentionSection({
  attentionItems,
  attnCounts,
  expandedAttn,
  setExpandedAttn,
  iMap,
  tree,
  onOpenItem,
  onUpdate,
  applyJiraDiffs,
}) {
  const { t } = useT();
  return (
    <>
      {/* ══════ Attention — one ranked list, not five chips ══════ */}
      <div className="section-h" style={{ marginTop: 0 }}>
        {t('bv.attention')}
        {attentionItems.length > 0 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', marginLeft: 6 }}>
            {['overdue', 'drift', 'atRisk', 'blocked', 'unestimated']
              .filter(k => attnCounts[k])
              .map(k => `${attnCounts[k]} ${t(k === 'atRisk' ? 'bv.attn.atRisk' : `bv.attn.${k}`)}`)
              .join(' · ')}
          </span>
        )}
      </div>
      {attentionItems.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '8px 0', marginBottom: 18 }}>{t('bv.attn.empty')}</div>
      ) : (
        <div style={{ marginBottom: 18 }}>
          {/* Grouped, not one flat run. Ordered by kind it already was, but
              thirty-five rows in a column with no breaks reads as one problem
              thirty-five items long. Each kind is its own short block with its
              count, and only the first few show — an unestimated backlog is a
              standing fact, not five separate things to look at this morning. */}
          {ATTN_ORDER.filter(kind => attentionItems.some(i => i.kind === kind)).map(kind => {
            const group = attentionItems.filter(i => i.kind === kind);
            const open = expandedAttn.has(kind);
            // An unestimated backlog is a standing fact, not today's news, so
            // it shows fewer — but not none: a group you cannot see at all is
            // a group you forget exists.
            const limit = kind === 'unestimated' ? 3 : ATTN_PREVIEW;
            const shown = open ? group : group.slice(0, limit);
            const hidden = group.length - shown.length;
            return (
              <div key={kind} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 4px' }}>
                  <span style={{ color: ATTN_TONE[kind], display: 'inline-flex' }}>
                    <Icon name={ATTN_ICON[kind]} size={12} />
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--tx2)' }}>
                    {t(kind === 'atRisk' ? 'bv.attn.atRisk' : `bv.attn.${kind}`)}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{group.length}</span>
                  {(hidden > 0 || open) && (
                    <button
                      className="btn btn-sec btn-xs"
                      style={{ marginLeft: 'auto', padding: '1px 6px', fontSize: 10 }}
                      onClick={() =>
                        setExpandedAttn(prev => {
                          const n = new Set(prev);
                          n.has(kind) ? n.delete(kind) : n.add(kind);
                          return n;
                        })
                      }
                    >
                      {open ? t('rm.showLess') : t('rm.showMore', hidden)}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {shown.map((item, i) => {
                    const node = iMap[item.id];
                    const leaf = node ? isLeafNode(tree, node.id) : false;
                    return (
                      <div
                        key={`${item.kind}:${item.id}:${i}`}
                        data-testid={`bv-attn-${item.kind}-${item.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '5px 8px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: 'var(--bg3)',
                          borderLeft: `3px solid ${ATTN_TONE[item.kind]}`,
                        }}
                        onClick={() => onOpenItem?.(item.id)}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 10,
                            color: 'var(--ac)',
                            fontWeight: 600,
                            flexShrink: 0,
                            minWidth: 70,
                          }}
                        >
                          {item.id}
                        </span>
                        <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.name}
                        </span>
                        {item.reason && REASON_KEY[item.reason] && REASON_KEY[item.reason] !== REASON_KEY[item.kind] && (
                          <span style={{ fontSize: 11, color: ATTN_TONE[item.kind], flexShrink: 0 }}>{t(REASON_KEY[item.reason])}</span>
                        )}
                        {item.kind === 'drift' && (
                          <button
                            className="btn btn-pri btn-xs"
                            style={{ padding: '2px 6px', fontSize: 10, flexShrink: 0 }}
                            onClick={e => {
                              e.stopPropagation();
                              applyJiraDiffs([item], new Set([item.id]));
                            }}
                            data-htip={t('js.applyTip')}
                          >
                            {t('bv.attn.apply')} → {t(item.target)}
                          </button>
                        )}
                        {item.date && item.kind !== 'drift' && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>{item.date}</span>
                        )}
                        {leaf && item.kind !== 'drift' && node && <StatusCycleButton node={node} onUpdate={onUpdate} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
