import { scrollAdjustment } from '../treeEdit.js';
import { layoutScale } from './layout.js';

// Keep the cursor on screen.
//
// This used to ask whether the row was inside the WINDOW
// (`rect.top >= 0 && rect.bottom <= innerHeight`). The tree does not
// scroll the window — it scrolls a container that starts well below the
// top of the page, under the topbar, the tab bar and the sub-toolbar. So
// a row that had scrolled up behind that chrome still reported `top >= 0`
// and counted as visible: moving the cursor up, it simply disappeared and
// nothing scrolled. Measured: container top at y=160, cursor row at y=36.
//
// It also used `block: 'nearest'`, which does the least scrolling that
// technically works and leaves the row glued to the very edge with no
// context after it.
//
// So: measure against the scroll container, allow for whatever is sticky
// at its top (the table head), and leave a row's worth of room on either
// side so you can see where you are going.
export const ROW_MARGIN = 34;

export function scrollParentOf(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) return node;
    node = node.parentElement;
  }
  return null;
}

export function keepRowInView(row) {
  if (!row) return;
  const box = scrollParentOf(row);
  if (!box) {
    row.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    return;
  }
  const rowRect = row.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  // The table head sticks to the top of the scroller; anything under it is
  // as invisible as anything above the scroller itself.
  const headRect = box.querySelector('.tree-tbl thead')?.getBoundingClientRect();
  const delta = scrollAdjustment({
    rowTop: rowRect.top,
    rowBottom: rowRect.bottom,
    boxTop: boxRect.top,
    boxBottom: boxRect.bottom,
    headBottom: headRect?.bottom ?? null,
    margin: ROW_MARGIN,
  });
  // The rects are in zoomed pixels, scrollTop is in the box's own.
  if (delta) box.scrollTop += delta / layoutScale(box);
}
