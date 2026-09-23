export const WPX = 20;
export const SK = 'planr_v2';
export const MDE = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DOW_DE = ['So','Mo','Di','Mi','Do','Fr','Sa'];
export const PL = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };
export const SL = { done: '✓ Done', wip: 'In Progress', open: 'Open' };
// GT is the MARKDOWN FILE FORMAT and the export glyph vocabulary: a plan note
// on disk marks a goal with 🎯 and a pain point with ⚡, and the PDF/report
// layer substitutes them through pdfGlyphs.js. It is data, so it stays.
export const GT = { goal: '🎯', painpoint: '⚡', deadline: '!' };
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
