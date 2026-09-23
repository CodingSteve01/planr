// One icon set, drawn rather than typed.
//
// The app used emoji and stray typographic glyphs as icons — 🗺 for the
// roadmap, 💾 for save, ✧ beside a menu entry. Three things are wrong with
// that and only the third is taste: an emoji renders from a different font on
// every machine, so it never matches the weight of the text next to it; it
// carries its own colour and ignores the one the row is painted in, so it
// cannot go quiet in a disabled control or bright in a selected one; and its
// size is set by the font rather than the layout, so it never lines up twice.
//
// These are stroke icons on a 24 unit grid, in `currentColor`, at the weight
// of the UI text. The typographic arrows the app uses in SHORTCUT HINTS and
// DATE RANGES (→, ⇧, ↵, ⌥) are text, not icons, and stay as they are.
import React from 'react';

// Each entry is the inside of the <svg>. Kept flat and alphabetical so a new
// icon is one obvious line.
const PATHS = {
  alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
  beach: <><path d="M12 21v-9" /><path d="M4 12a8 8 0 0 1 16 0Z" /><path d="M2 21h20" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  check: <path d="m4 12 5 5L20 6" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronUp: <path d="m5 15 7-7 7 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>,
  calculator: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></>,
  checkSquare: <><path d="M9 11.5 11.5 14 16 9" /><rect x="3.5" y="3.5" width="17" height="17" rx="3" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></>,
  download: <><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 21h16" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  gantt: <><path d="M4 7h8M4 12h12M4 17h6" /><path d="M3 3v18" /></>,
  // Indent/outdent move a row one level in or out of its parent. The bars are
  // the rows, the arrow is the direction the row travels.
  indent: <><path d="M11 6h10M11 12h10M11 18h10" /><path d="m3 9 3 3-3 3" /></>,
  outdent: <><path d="M11 6h10M11 12h10M11 18h10" /><path d="m6 9-3 3 3 3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>,
  grip: <><circle cx="9" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="15" cy="18" r="1.4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.5" /><path d="M12 17h.01" /></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></>,
  // Priority, the way every issue tracker draws it: chevrons pointing up for
  // "ahead of the rest", a level bar for the middle, down for "can wait".
  // The direction carries the meaning on its own, so it still reads when the
  // colour is taken away — which is the whole reason not to use four coloured
  // dots. Replaced ▲▲ / ▲ / ▬ / ▼, a text approximation of exactly this.
  prioCritical: <><path d="m6 12 6-6 6 6" /><path d="m6 18 6-6 6 6" /></>,
  prioHigh: <path d="m6 15 6-6 6 6" />,
  prioMedium: <><path d="M5 10h14" /><path d="M5 14h14" /></>,
  prioLow: <path d="m6 9 6 6 6-6" />,
  redo: <><path d="M20 9H9a5 5 0 0 0 0 10h6" /><path d="m20 9-4-4M20 9l-4 4" /></>,
  restart: <><path d="M5 5v14" /><path d="M20 5 9 12l11 7Z" /></>,
  swap: <><path d="M4 8h13m0 0-4-4m4 4-4 4" /><path d="M20 16H7m0 0 4-4m-4 4 4 4" /></>,
  link: <><path d="M10 13a4.5 4.5 0 0 0 6.4.4l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5" /><path d="M14 11a4.5 4.5 0 0 0-6.4-.4L5 13.2a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></>,
  map: <><path d="m9 4 6 3 5-2v14l-5 2-6-3-5 2V6Z" /><path d="M9 4v14M15 7v14" /></>,
  // Open the row in the full editor: the corners of a frame growing outward.
  maximize: <><path d="M9 3H3v6" /><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M15 21h6v-6" /></>,
  // The four reorder moves. Up and down are plain; first and last carry the
  // bar they stop at, so the pair reads as a set rather than four arrows.
  moveTop: <><path d="M4 4h16" /><path d="M12 20V9" /><path d="m7 14 5-5 5 5" /></>,
  moveUp: <><path d="M12 19V6" /><path d="m6 12 6-6 6 6" /></>,
  moveDown: <><path d="M12 5v13" /><path d="m6 12 6 6 6-6" /></>,
  moveBottom: <><path d="M4 20h16" /><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /></>,
  network: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="11" cy="18" r="2.5" /><path d="m8.2 7 7.4 .6M16.6 10.2 12.6 15.7M8.2 8.1l2 7.6" /></>,
  pencil: <><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14.5 6.5 3 3" /></>,
  // Where the editor sits: the pane it docks into is the filled side.
  panelLeft: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  panelRight: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  pin: <><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  save: <><path d="M5 3h11l3 3v15H5Z" /><path d="M8 3v6h8V3M8 21v-6h8v6" /></>,
  sparkle: <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.6 10.4 12.2 5 10.6 10.4 9Z" />,
  // Jump to either end of a horizontal order — the bar is the end it stops at.
  skipBack: <><path d="M5 5v14" /><path d="m19 5-9 7 9 7Z" /></>,
  skipForward: <><path d="M19 5v14" /><path d="m5 5 9 7-9 7Z" /></>,
  square: <rect x="3.5" y="3.5" width="17" height="17" rx="3" />,
  subtask: <path d="M5 4v9a3 3 0 0 0 3 3h11m0 0-4-4m4 4-4 4" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.3" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><path d="M9 7V4h6v3" /></>,
  train: <><rect x="6" y="3" width="12" height="13" rx="3" /><path d="M6 10h12" /><circle cx="9.5" cy="13" r="1" /><circle cx="14.5" cy="13" r="1" /><path d="m8 16-2 5M16 16l2 5" /></>,
  undo: <><path d="M4 9h11a5 5 0 0 1 0 10H9" /><path d="m4 9 4-4M4 9l4 4" /></>,
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 21h16" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16.5 5.3a3.2 3.2 0 0 1 0 5.4M17 14.6A6 6 0 0 1 21 20" /></>,
  x: <path d="m6 6 12 12M18 6 6 18" />,
};

export const ICON_NAMES = Object.keys(PATHS);

// `size` is the drawn box in px. Icons that sit in a line of text want the
// line's own size; icons in a button want its height minus its padding.
export function Icon({ name, size = 14, strokeWidth = 1.75, style, className, title }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, display: 'block', ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {body}
    </svg>
  );
}

export default Icon;
