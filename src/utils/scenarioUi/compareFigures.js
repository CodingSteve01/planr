import { teamStory } from '../scenarioCompare.js';

const KIND_ORDER = ['item', 'person', 'absence', 'order', 'team', 'holiday', 'setting'];

// One predicate per table, used for the tab's count AND the rows under it —
// a number that changes when you look at it costs trust in all the others.
const personDiffers = p => !!p.effortShift || !!p.untilShift || p.presence !== 'both' || p.baseTasks !== p.workTasks;

// Red and green are for a target date crossed, in either direction. A bar
// that merely moves is neither good nor bad, so it has no colour of its own.
const projectTone = p =>
  p.workLate && !p.baseLate
    ? 'var(--st-risk)'
    : p.baseLate && !p.workLate && p.presence === 'both'
      ? 'var(--st-done)'
      : p.shift
        ? 'var(--tx)'
        : 'var(--tx3)';
const plainTone = n => (n ? 'var(--tx)' : 'var(--tx3)');

const TAB_IDS = ['projects', 'teams', 'people', 'items', 'changes'];

const capPct = n => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)} %`;

// What the changes mean, a sentence per affected team (the facts come from
// utils/scenarioCompare.js, `teamStory`). Shared by the dialog and the PDF.
function storyLines(t, fmt, teams) {
  return teamStory(teams).map(f => {
    const parts = [];
    const cap = f.capNew ? t('scn.story.capNew') : f.capPct ? t('scn.story.cap', capPct(f.capPct)) : '';
    if (f.people) parts.push(`${t('scn.story.people', f.people[0], f.people[1])}${cap ? ` (${cap})` : ''}`);
    else if (cap) parts.push(cap);
    if (f.moved > 0)
      parts.push(f.movedProjects > 1 ? t('scn.story.movedIn', f.moved, f.total, f.movedProjects) : t('scn.story.moved', f.moved, f.total));
    if (f.gone > 0) parts.push(t('scn.story.gone', f.gone));
    if (f.added > 0) parts.push(t('scn.story.added', f.added));
    if (f.end === 'later') parts.push(t('scn.story.later', fmt.shift(f.shift).replace('+', '')));
    else if (f.end === 'earlier') parts.push(t('scn.story.earlier', fmt.shift(f.shift).replace('−', '')));
    else if (f.end === 'same') parts.push(t('scn.story.sameEnd'));
    return { id: f.id, name: f.name, text: parts.map(p => `${p}.`).join(' ') };
  });
}

// "20 of 59 · up to +13 wk", for a project or a team.
function movedText(t, fmt, x) {
  const parts = [t('scn.ofTotal', x.moved, x.total)];
  if (x.maxItemLater > 0) parts.push(t('scn.upTo', fmt.shift(x.maxItemLater)));
  if (x.maxItemEarlier < 0) parts.push(t('scn.upTo', fmt.shift(x.maxItemEarlier)));
  if (x.gone > 0) parts.push(t('scn.nGone', x.gone));
  if (x.added > 0) parts.push(t('scn.nAdded', x.added));
  return parts.join(' · ');
}
export { KIND_ORDER, personDiffers, projectTone, plainTone, TAB_IDS, capPct, storyLines, movedText };
