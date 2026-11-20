import { useRef } from 'react';

// A pane that stops re-rendering while nobody can see it.
//
// Every tab you visit stays mounted behind the active one (`visitedTabs` in
// App.jsx), so switching back is instant and scroll position, zoom and
// sub-tab state survive. The cost was hidden in plain sight: each pane takes
// `tree` as a prop, so one keystroke in the tree re-rendered the Gantt, the
// roadmap and the network graph as well — all of them invisible.
//
// Measured at 1000 tasks: a keystroke cost 525 ms with only the tree open and
// 1287 ms after visiting four more tabs. Two and a half times the work for
// pixels nobody is looking at.
//
// React cannot pause a subtree, but it can be told there is nothing new: an
// element it has already rendered, handed back by identity, makes it bail out
// of that branch entirely. So while `active` is false this returns the last
// children it was given — the same object, not a copy — and the pane keeps its
// DOM, its state and its scroll while doing no work. The moment it is shown
// again it takes the current children, so what appears is never stale.
export function Frozen({ active, children }) {
  const held = useRef(children);
  if (active) held.current = children;
  return held.current;
}
