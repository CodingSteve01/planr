// The queue is where you say "this one first". It was also the one view that
// never mentioned the thing that can overrule you.
import { describe, it, expect } from 'vitest';
import { effectiveDepsOf, queueBlockers } from '../queueBlockers.js';

const plan = rows => new Map(rows.map(r => [r.id, r]));

describe('what applies to a row', () => {
  const byId = plan([
    { id: 'P1' },
    { id: 'P1.1', deps: ['P2.1'] },
    { id: 'P1.1.1' },
    { id: 'P2' },
    { id: 'P2.1' },
  ]);

  it('is its own dependencies', () => {
    expect(effectiveDepsOf('P1.1', byId)).toEqual(['P2.1']);
  });

  it('and the ones its package carries — a dependency on a package holds everything in it', () => {
    expect(effectiveDepsOf('P1.1.1', byId)).toEqual(['P2.1']);
  });

  it('never itself', () => {
    expect(effectiveDepsOf('P1.1', plan([{ id: 'P1.1', deps: ['P1.1'] }]))).toEqual([]);
  });
});

describe('what holds a queue', () => {
  it('says nothing when nothing does', () => {
    const byId = plan([{ id: 'A' }, { id: 'B' }]);
    expect(queueBlockers(['A', 'B'], byId).size).toBe(0);
  });

  it('names an open predecessor', () => {
    const byId = plan([{ id: 'A', deps: ['B'] }, { id: 'B', status: 'open' }]);
    expect(queueBlockers(['B', 'A'], byId).get('A')).toEqual({ waitsFor: ['B'], later: [] });
  });

  it('ignores one that is already delivered', () => {
    const byId = plan([{ id: 'A', deps: ['B'] }, { id: 'B', status: 'done' }]);
    expect(queueBlockers(['B', 'A'], byId).size).toBe(0);
  });

  it('ignores one that was dropped — a decision not to do it holds nothing up', () => {
    const byId = plan([{ id: 'A', deps: ['B'] }, { id: 'B', status: 'open', dropped: true }]);
    expect(queueBlockers(['B', 'A'], byId).size).toBe(0);
  });

  it('marks the case the queue cannot deliver: a blocker further down the same list', () => {
    // Put A first and it still waits for B, which you put second. The row is
    // going to move whatever you do here, and that is worth saying out loud.
    const byId = plan([{ id: 'A', deps: ['B'] }, { id: 'B', status: 'open' }]);
    const held = queueBlockers(['A', 'B'], byId).get('A');
    expect(held.later).toEqual(['B']);
  });

  it('does not call a blocker "later" when it is somebody else\'s work', () => {
    // Not in this queue at all: it still holds the row, but the order here is
    // not the thing contradicting it.
    const byId = plan([{ id: 'A', deps: ['Z'] }, { id: 'Z', status: 'open' }]);
    expect(queueBlockers(['A'], byId).get('A')).toEqual({ waitsFor: ['Z'], later: [] });
  });
});
