// Pure layout helpers of the tree view: row depth, the sticky stack's offsets, the UI scale,
// and whether a key target is a text entry.
export function depth(id) {
  return id.split('.').length;
}

// Text entry, as far as a keyboard shortcut is concerned. Checkboxes and the
// like are excluded deliberately: arrows there are navigation, not editing.
const NON_TEXT_INPUT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/**
 * Where each element of a sticky stack starts, and where the next thing after
 * it starts. Given the heights of the bars that stick above a table head, top
 * to bottom, returns one offset per bar plus a final one for the head.
 *
 * A missing bar counts as nothing, so the same call works whether or not the
 * selection bar is on screen.
 */
export function stickyTops(heights) {
  const tops = [];
  let acc = 0;
  for (const h of heights) {
    tops.push(acc);
    acc += h > 0 ? h : 0;
  }
  tops.push(acc);
  return tops;
}

/**
 * How many screen pixels one of the element's own CSS pixels comes to.
 *
 * The UI scale setting puts `zoom` on the app root, and under `zoom`
 * getBoundingClientRect() answers in zoomed pixels while `top`, `scrollTop`
 * and friends are read in the element's own. offsetWidth is the one length
 * that stays unzoomed, so the ratio of the two is the factor. Widths, not
 * heights: offsetWidth is rounded to a whole pixel, and over the width of the
 * tree that rounding stays far below a pixel of error.
 */
export function layoutScale(el) {
  const w = el?.offsetWidth;
  const r = w ? el.getBoundingClientRect().width / w : 1;
  return r > 0 && Number.isFinite(r) ? r : 1;
}

// Anything that is editing rather than navigating. A structural shortcut
// pressed here belongs to the control: ⌘⇧←/→ selects to the line's edge in a
// text field, ⌥←/→ walks by word, ↑/↓ picks a value in a combobox.
export function isTypingTarget(el) {
  if (!el || typeof el !== 'object') return false;
  if (el.isContentEditable) return true;
  if (el.getAttribute?.('role') === 'combobox') return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUT.has(String(el.type || 'text').toLowerCase());
}
