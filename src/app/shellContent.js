import { NEW_BADGE_TAB_IDS } from './shell.js';
import { TAB_IDS } from '../utils/modes.js';

// Text the shell shows that depends on the active language. All three are
// resolved at render time so they pick up a language change.

// The tab bar. "New!" badge: shown on tabs until the user dismisses the
// new-feature popover.
export function buildTabs(t, showNewBadge) {
  return TAB_IDS.map(id => ({
    id,
    label: t(`tab.${id}`),
    isNew: showNewBadge && NEW_BADGE_TAB_IDS.has(id),
  }));
}

export function buildTourSteps(t) {
  return [0, 1, 2, 3].map(i => ({
    icon: t(`tour.s${i}.icon`),
    title: t(`tour.s${i}.title`),
    body: t(`tour.s${i}.body`),
  }));
}

// The new-feature list (shown once to existing users).
export function buildNewFeatures(t) {
  return [
    t('new.roadmap'),
    t('new.dayZoom'),
    t('new.confidence'),
    t('new.dragLink'),
    t('new.planReview'),
    t('new.archive'),
    t('new.jiraSync'),
    // TODO: add Network Graph improvements once documented
  ];
}
