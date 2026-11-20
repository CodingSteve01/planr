export const WPX = 20;
export const SK = 'planr_v2';
export const MDE = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DOW_DE = ['So','Mo','Di','Mi','Do','Fr','Sa'];
export const PL = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };
export const SL = { done: '✓ Done', wip: 'In Progress', open: 'Open' };
// GT is the MARKDOWN FILE FORMAT marker for a root's type. It used to be emoji
// — 🎯 for a goal, ⚡ for a pain point — which every reader renders in its own
// font at its own size, and which leaked into project NAMES whenever a file
// was written with one marker and read expecting another. Plain words in
// brackets: greppable, unambiguous, and the same in every editor. `{…}` is
// already taken by tags and `(…)` by dates, so `[…]` is free.
// parseMdToProject still accepts the old emoji so existing plans keep loading.
export const GT = { goal: '[goal]', painpoint: '[painpoint]', deadline: '[deadline]' };
// Every marker a saved plan may carry for each type, newest first. The reader
// walks this so a file written by any previous version still loads, and so it
// can strip whichever one it found out of the name.
export const GT_MARKS = {
  deadline: [GT.deadline, '\u23f0', '!'],
  painpoint: [GT.painpoint, '\u26a1'],
  goal: [GT.goal, '\u{1f3af}'],
};
// What the SCREEN draws for the same three. Emoji come from a different font
// on every machine, ignore the colour of the row they sit in, and are sized by
// the font rather than the layout — see components/shared/Icon.jsx.
export const GT_ICON = { goal: 'target', painpoint: 'bolt', deadline: 'clock' };
export const GL = { goal: 'Goal', painpoint: 'Painpoint', deadline: 'Deadline' };

// Planning confidence is an ORDINAL scale, not a status: nothing about
// "exploratory" is bad, it is simply less settled than "committed". It used to
// be drawn in green/amber/grey — the status triple — in four separate copies
// of this map, which spent the three status hues on a quantity that is never
// good or bad. One hue, three steps, defined once. The print palette mirrors
// the same tokens so the paper and the screen agree.
export const CONF_COLOR = { committed: 'var(--cf-hi)', estimated: 'var(--cf-mid)', exploratory: 'var(--cf-lo)' };
