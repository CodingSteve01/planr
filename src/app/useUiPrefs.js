import { useEffect, useRef, useState } from 'react';
import { isEmbedded } from '../utils/embedHost.js';
import { SIDE_DOCK_MIN_WIDTH } from './shell.js';
import { store, storedFlag, storedText } from './storage.js';

function storedUiScale() {
  const fallback = isEmbedded() ? 110 : 100;
  try {
    return Number(localStorage.getItem('planr_ui_scale')) || fallback;
  } catch {
    return fallback;
  }
}

// Where the item editor lives. A 360px column beside the tree is a gift on
// a wide screen and a theft on a narrow one, so "auto" measures and picks —
// and it measures the app, not the window: inside Obsidian the leaf can be
// narrow while the window is wide.
function useEditorDock() {
  const [editorDock, _setEditorDock] = useState(() => storedText('planr_editor_dock', 'auto'));
  const setEditorDock = v => {
    _setEditorDock(v);
    store('planr_editor_dock', v);
  };
  const [narrow, setNarrow] = useState(false);
  const appRef = useRef(null);
  useEffect(() => {
    const el = appRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < SIDE_DOCK_MIN_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const editorAsDialog = editorDock === 'dialog' || (editorDock === 'auto' && narrow);
  return { editorDock, setEditorDock, appRef, editorAsDialog };
}

// UI scale. Planr's density is deliberate — 11px rows are canon — but a
// dense grid designed for a 27" screen is unreadable in a workspace pane,
// and Obsidian's own zoom would blow up Obsidian with it. `zoom` reflows
// rather than stretching, so a scaled Planr is still a crisp Planr.
//
// It goes on the element the popups are portalled into, not on .app: a
// portal that lands outside the zoomed subtree would render at 100% beside
// a 125% app. utils/embedHost.js measures the factor back out for anything
// that positions itself from mouse or rect coordinates.
// The default depends on where Planr is: 100% in a browser window, which is
// the width the density was drawn for, and 125% inside a host, where the app
// lives in a pane beside everything else. One number could not be right for
// both — 125% in a full browser window is enormous.
function useUiScale(portalRoot) {
  const [uiScale, _setUiScale] = useState(storedUiScale);
  const setUiScale = v => {
    _setUiScale(v);
    store('planr_ui_scale', String(v));
  };
  useEffect(() => {
    const el = portalRoot;
    if (!el) return;
    el.style.zoom = uiScale === 100 ? '' : String(uiScale / 100);
    return () => {
      el.style.zoom = '';
    };
  }, [uiScale, portalRoot]);
  return { uiScale, setUiScale };
}

// The shell's own preferences: none of them is part of the plan file, all of
// them survive a reload.
export function useUiPrefs(portalRoot) {
  const dock = useEditorDock();
  const scale = useUiScale(portalRoot);
  // Off by default. Everything that distracts is opt-in: the id is the
  // tool's spine when you are wiring dependencies, and five dotted segments
  // in front of every name the rest of the time.
  const [showTreeIds, _setShowTreeIds] = useState(() => storedFlag('planr_tree_ids'));
  const setShowTreeIds = v => {
    _setShowTreeIds(v);
    store('planr_tree_ids', String(v));
  };
  return { ...dock, ...scale, showTreeIds, setShowTreeIds };
}

// Plan mode's project lens (RoadmapLens.jsx) — a calendar-style roadmap for
// one project, shown beside the Gantt. Both bits of state are local to the
// shell (not the plan file): which project is focused, and whether the
// panel is open at all. Persisted so the choice survives a reload.
export function useRoadmapFocus() {
  const [ganttRoadmapFocus, _setGanttRoadmapFocus] = useState(() => storedText('planr_gantt_roadmap_focus'));
  const setGanttRoadmapFocus = id => {
    _setGanttRoadmapFocus(id);
    store('planr_gantt_roadmap_focus', id || '');
  };
  return [ganttRoadmapFocus, setGanttRoadmapFocus];
}
