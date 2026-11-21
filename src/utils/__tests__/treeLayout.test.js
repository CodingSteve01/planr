/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { depth, stickyTops, layoutScale, isTypingTarget } from '../tree/layout.js';

describe('tree layout helpers', () => {
  it('counts the dots of an id as depth', () => {
    expect(depth('A1')).toBe(1);
    expect(depth('A1.2.3')).toBe(3);
  });

  it('stacks the sticky bars and ignores missing ones', () => {
    expect(stickyTops([])).toEqual([0]);
    expect(stickyTops([40, 0, 30])).toEqual([0, 40, 40, 70]);
    expect(stickyTops([undefined, 20])).toEqual([0, 0, 20]);
  });

  it('reads the zoom from the ratio of drawn to layout width', () => {
    expect(layoutScale(null)).toBe(1);
    expect(layoutScale({ offsetWidth: 0 })).toBe(1);
    expect(layoutScale({ offsetWidth: 200, getBoundingClientRect: () => ({ width: 300 }) })).toBe(1.5);
    expect(layoutScale({ offsetWidth: 200, getBoundingClientRect: () => ({ width: 0 }) })).toBe(1);
  });

  it('treats text fields as typing and checkboxes as navigation', () => {
    const input = type => Object.assign(document.createElement('input'), { type });
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(input('text'))).toBe(true);
    expect(isTypingTarget(input('checkbox'))).toBe(false);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
  });
});
