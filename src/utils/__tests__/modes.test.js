import { describe, test, expect } from 'vitest';
import { MODES, DEFAULT_MODE, ALL_MODE_TAB_IDS, isValidMode, getMode, tabsForMode, defaultTabForMode, modeForTab } from '../modes.js';
import { TAB_IDS } from '../../App.jsx';

describe('modes', () => {
  test('there are exactly five modes with unique ids', () => {
    expect(MODES).toHaveLength(5);
    const ids = MODES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['build', 'plan', 'run', 'review', 'report']);
  });

  test('each mode has exactly one default tab, and it is one of its own tabs', () => {
    for (const mode of MODES) {
      expect(typeof mode.defaultTab).toBe('string');
      expect(mode.defaultTab.length).toBeGreaterThan(0);
      expect(mode.tabs).toContain(mode.defaultTab);
    }
  });

  test('every mode names at least one tab', () => {
    for (const mode of MODES) {
      expect(Array.isArray(mode.tabs)).toBe(true);
      expect(mode.tabs.length).toBeGreaterThan(0);
    }
  });

  // The hard guard: every tab id the app shell (App.jsx TAB_IDS) knows about
  // must be reachable from at least one mode. If a future edit adds a tab to
  // App.jsx without placing it in a mode, this test fails — that is the
  // point (principle 6: "subtractive means fewer paths, never fewer
  // capabilities").
  test('every existing App.jsx tab id appears in at least one mode', () => {
    for (const tabId of TAB_IDS) {
      const owner = MODES.find(m => m.tabs.includes(tabId));
      expect(owner, `tab "${tabId}" is not reachable from any mode`).toBeTruthy();
    }
  });

  test('ALL_MODE_TAB_IDS covers TAB_IDS with no duplicates', () => {
    expect(new Set(ALL_MODE_TAB_IDS).size).toBe(ALL_MODE_TAB_IDS.length);
    for (const tabId of TAB_IDS) {
      expect(ALL_MODE_TAB_IDS).toContain(tabId);
    }
  });

  test('isValidMode / getMode', () => {
    expect(isValidMode('build')).toBe(true);
    expect(isValidMode('nope')).toBe(false);
    expect(getMode('plan').id).toBe('plan');
    // Unknown id falls back to the first mode rather than throwing.
    expect(getMode('nope')).toBe(MODES[0]);
  });

  test('tabsForMode / defaultTabForMode', () => {
    expect(tabsForMode('run')).toEqual(['briefing', 'summary']);
    expect(defaultTabForMode('run')).toBe('briefing');
  });

  test('modeForTab finds the owning mode, falls back to the default mode for unknown ids', () => {
    expect(modeForTab('tree').id).toBe('build');
    expect(modeForTab('resources').id).toBe('plan');
    // Overview is Review's core surface; Run only borrows it. This asserted
    // 'run' while declaration order decided — see TAB_OWNER in modes.js.
    expect(modeForTab('summary').id).toBe('review');
    expect(modeForTab('does-not-exist').id).toBe(DEFAULT_MODE);
  });
});

// Review-pass additions: both of these were accidents of declaration order
// before, and both decide where the user lands.
describe('the default mode and tab ownership are decisions, not side effects', () => {
  test('a fresh install opens in Build', () => {
    expect(DEFAULT_MODE).toBe('build');
    expect(isValidMode(DEFAULT_MODE)).toBe(true);
  });

  test('Overview belongs to Review, even though Run also shows it', () => {
    expect(modeForTab('summary').id).toBe('review');
    expect(tabsForMode('run')).toContain('summary');
  });

  test('every other tab is owned by the mode whose core surface it is', () => {
    expect(modeForTab('tree').id).toBe('build');
    expect(modeForTab('gantt').id).toBe('plan');
    expect(modeForTab('briefing').id).toBe('run');
    expect(modeForTab('report').id).toBe('report');
    expect(modeForTab('holidays').id).toBe('plan');
  });

  test('an unknown tab falls back to the default mode, not to the first one', () => {
    expect(modeForTab('no-such-tab').id).toBe(DEFAULT_MODE);
  });
});
