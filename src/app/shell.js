import { SK } from '../constants.js';
import { initialTab } from '../utils/modes.js';

// Which view a load starts on. A mode used to be decided here too, and had to
// be reconciled with the tab so the two agreed from the first paint; there is
// one thing to decide now.
export function initialShell() {
  let savedTab = null;
  try {
    savedTab = localStorage.getItem('planr_tab');
  } catch {
    /* ignore */
  }
  return { tab: initialTab(savedTab) };
}

export function loadLocalProject() {
  try {
    const s = localStorage.getItem(SK);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function isValidProjectData(value) {
  return value && Array.isArray(value.tree);
}

export function scheduleIdleWrite(work, timeout = 1000) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(work, { timeout });
  }
  return window.setTimeout(work, 0);
}

export function cancelIdleWrite(id) {
  if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(id);
    return;
  }
  clearTimeout(id);
}

export function activateOnPress(e, action) {
  if (e.button !== 0) return;
  e.preventDefault();
  action();
}

// Below this the side panel stops being help and starts being the thing in
// the way: 360px of editor against what is left of a work tree.
export const SIDE_DOCK_MIN_WIDTH = 1180;

// Glyphs for the `/` palette. Kept here beside TAB_IDS so a new tab is an
// obvious two-line change; an unlisted id falls back to a neutral marker
// rather than leaving a ragged gap in the column.
export const TAB_ICONS = {
  summary: 'target',
  briefing: 'sun',
  plan: 'pencil',
  tree: 'list',
  gantt: 'gantt',
  order: 'grip',
  roadmap: 'map',
  net: 'network',
  resources: 'users',
  holidays: 'beach',
  report: 'doc',
};
// Tabs that still carry the one-time "New!" badge (see NEW_FEATURES below).
export const NEW_BADGE_TAB_IDS = new Set(['summary', 'plan', 'gantt']);
// Views that answer to scope / quick filters / the review window / the
// archive. Resources, Holidays and Report are inputs and outputs — nothing in
// the filter bar reaches them, so it would be a control that does nothing.
export const FILTERED_TABS = new Set(['summary', 'tree', 'order', 'gantt', 'roadmap', 'net', 'plan', 'briefing']);
// The views that read the toolbar search. One list for showing the box and for
// ⌘F, because they drifted apart: the box sat on every filtered tab while only
// three views read it, so on the queue it filtered nothing and ⌘F fell through
// to the browser's find.
export const SEARCH_TABS = new Set(['tree', 'order', 'gantt', 'net']);
// The views that step through search matches one at a time (`searchIdx`).
// The tree only filters to its matches, so there is nothing to step through,
// and the ▲/▼ buttons and ⌘↑/⌘↓ did nothing there.
export const MATCH_STEP_TABS = new Set(['gantt', 'net']);
