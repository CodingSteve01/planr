import { progressPctLabel } from '../../../utils/progress.js';
import { useT } from '../../../i18n.jsx';
import { activatable, S_DOT, S_LABEL } from './InsightParts.jsx';

// Name + description — clickable, jumps to Details tab
export function InsightNameBlock({ node, onEditSection }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  const detailsClick = onEditSection ? () => onEditSection('details') : undefined;
  return (
    <div
      onClick={detailsClick}
      {...activatable(detailsClick)}
      data-htip={detailsClick ? editLabel : undefined}
      style={{
        padding: '6px 8px',
        margin: '0 -8px 8px',
        borderRadius: 'var(--r)',
        cursor: detailsClick ? 'pointer' : 'default',
        transition: 'background .12s',
      }}
      onMouseEnter={
        detailsClick
          ? e => {
              e.currentTarget.style.background = 'rgba(108,160,255,.07)';
            }
          : undefined
      }
      onMouseLeave={
        detailsClick
          ? e => {
              e.currentTarget.style.background = 'transparent';
            }
          : undefined
      }
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.25, marginBottom: 4 }}>
        {node.name || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('qe.name')}</span>}
      </div>
      {(node.description || node.note) && (
        <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{node.description || node.note}</div>
      )}
      {node.description && node.note && node.note !== node.description && (
        <div style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.4, marginTop: 4, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
          {node.note}
        </div>
      )}
    </div>
  );
}

// Status + progress header — clickable, jumps to Details tab
export function InsightStatusBlock({ status, statusColor, progPct, confColor, confDot, confLabel, onEditSection }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  return (
    <div
      onClick={onEditSection ? () => onEditSection('status') : undefined}
      {...activatable(onEditSection ? () => onEditSection('status') : null)}
      data-htip={onEditSection ? editLabel : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        flexWrap: 'wrap',
        padding: '6px 8px',
        margin: '0 -8px 8px',
        borderRadius: 'var(--r)',
        cursor: onEditSection ? 'pointer' : 'default',
        transition: 'background .12s',
      }}
      onMouseEnter={
        onEditSection
          ? e => {
              e.currentTarget.style.background = 'rgba(108,160,255,.07)';
            }
          : undefined
      }
      onMouseLeave={
        onEditSection
          ? e => {
              e.currentTarget.style.background = 'transparent';
            }
          : undefined
      }
    >
      <span style={{ fontWeight: 700, color: statusColor, fontSize: 13 }}>
        {S_DOT[status]} {t(S_LABEL[status] || status)}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx2)' }}>{progressPctLabel(progPct)}%</span>
      <div style={{ flex: '1 1 80px', height: 5, background: 'var(--bg4)', borderRadius: 3, minWidth: 60 }}>
        <div style={{ width: `${progPct}%`, height: '100%', background: progPct >= 99.95 ? 'var(--gr)' : 'var(--am)', borderRadius: 3 }} />
      </div>
      <span style={{ color: confColor, fontSize: 12, fontFamily: 'var(--mono)' }}>
        {confDot} {confLabel}
      </span>
    </div>
  );
}
