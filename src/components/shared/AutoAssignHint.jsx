import { iso } from '../../utils/date.js';
import { useT } from '../../i18n.jsx';

/**
 * AutoAssignHint — shows the scheduler's auto-assign suggestion for unassigned tasks.
 * Reused in QuickEdit, NodeModal, and PlanReview.
 *
 * Props:
 *   node      — the tree node (needs .id, .assign)
 *   scheduled — full scheduled array (to find the auto-assign entry)
 *   members   — all members (to resolve personId → name)
 *   onAccept  — callback({assign, team}) when user clicks "Accept"
 */
export function AutoAssignHint({ node, scheduled, members, onAccept }) {
  const { t } = useT();
  if (!node || (node.assign || []).length > 0) return null;
  const sc = scheduled?.find(s => s.id === node.id);
  if (!sc?.autoAssigned || !sc.personId) return null;
  const m = members?.find(x => x.id === sc.personId);
  if (!m) return null;

  // Quiet, like the `~Name` marker everywhere else. This is the schedule
  // telling you what it worked out, not a warning — and a dashed amber box
  // was reading as one, in a dialog where amber otherwise means "look here".
  return <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', fontSize: 11, marginBottom: 6 }}>
    <span style={{ color: 'var(--tx3)', flexShrink: 0, fontStyle: 'italic' }}>{t('aa.suggestion')}</span>
    <span style={{ fontWeight: 600 }}>{m.name}</span>
    <span style={{ fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{iso(sc.startD)} — {iso(sc.endD)}</span>
    <button className="btn btn-pri btn-xs" style={{ marginLeft: 'auto', flexShrink: 0 }}
      onClick={() => onAccept({ assign: [sc.personId], team: m.team || node.team })}>{t('aa.accept')}</button>
  </div>;
}
