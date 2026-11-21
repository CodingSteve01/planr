export const ATTN_TONE = { overdue: 'var(--re)', drift: 'var(--ac)', atRisk: 'var(--am)', blocked: 'var(--am)', unestimated: 'var(--tx3)' };
export const ATTN_ICON = { overdue: 'clock', drift: 'swap', atRisk: 'alert', blocked: 'ban', unestimated: 'help' };
// Kinds in the order a briefing wants them, and how many of each to show
// before the rest go behind a toggle.
export const ATTN_ORDER = ['overdue', 'drift', 'atRisk', 'blocked', 'unestimated'];
export const ATTN_PREVIEW = 5;
export const REASON_KEY = {
  overdue: 'bv.overdue',
  late: 'bv.lateEnd',
  exploratoryClose: 'bv.exploratoryDeadline',
  blocked: 'bv.attn.blocked',
  unestimated: 'bv.attn.unestimated',
  drift: 'bv.attn.drift',
};
