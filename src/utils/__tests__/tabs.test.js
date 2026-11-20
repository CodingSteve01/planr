// The views the shell knows about.
//
// This file used to guard five modes — that every tab belonged to exactly one,
// that each mode had a default tab of its own, that nothing became unreachable.
// The modes are gone (see utils/modes.js for why), and with them most of what
// there was to get wrong: there is one row, it holds every view, and the only
// thing worth holding is that it stays that way.

import { describe, test, expect } from 'vitest';
import { TAB_IDS, DEFAULT_TAB, isValidTab, initialTab } from '../modes.js';
import { TAB_IDS as APP_TAB_IDS } from '../../App.jsx';

describe('the tab bar', () => {
  test('lists every view once', () => {
    expect(new Set(TAB_IDS).size).toBe(TAB_IDS.length);
    expect(TAB_IDS.length).toBeGreaterThan(0);
  });

  test('is what App renders — one source, not two lists that drift', () => {
    expect(APP_TAB_IDS).toEqual(TAB_IDS);
  });

  test('opens on the tree, where a plan is authored', () => {
    expect(isValidTab(DEFAULT_TAB)).toBe(true);
    expect(initialTab(null)).toBe(DEFAULT_TAB);
    expect(initialTab('')).toBe(DEFAULT_TAB);
  });

  test('gives a returning user back the view they left', () => {
    expect(initialTab('gantt')).toBe('gantt');
  });

  test('ignores a remembered view that no longer exists', () => {
    // A tab id can disappear between releases; landing on nothing is worse
    // than landing somewhere.
    expect(initialTab('build')).toBe(DEFAULT_TAB);
    expect(isValidTab('nope')).toBe(false);
  });
});
