// Space on a task with phases did nothing visible. Not a UI problem: a leaf
// with phases derives its progress FROM them (leafProgress in scheduler.js —
// "phases are the single source of truth when present"), so cycling only the
// task's `status` wrote a number nothing reads back.
//
// The model: the CURRENT phase is the first one that is not done. Each press
// moves it one step along open → wip → done; finishing it makes the next
// phase current. ⇧Space walks the same path backwards.
import { describe, it, expect } from 'vitest';
import { advancePhases, statusFromPhases, currentPhase, setPhaseCursor, phaseProgress } from '../phases.js';
import { fieldPatchForKey } from '../treeEdit.js';

const ph = (id, status = 'open') => ({ id, name: id, status });
const states = list => list.map(p => p.status);

describe('advancePhases walks the list one press at a time', () => {
  it('takes the first phase open → wip → done, then moves on', () => {
    let list = [ph('a'), ph('b'), ph('c')];
    expect(states(list = advancePhases(list))).toEqual(['wip', 'open', 'open']);
    expect(states(list = advancePhases(list))).toEqual(['done', 'open', 'open']);
    expect(states(list = advancePhases(list))).toEqual(['done', 'wip', 'open']);
    expect(states(list = advancePhases(list))).toEqual(['done', 'done', 'open']);
    expect(states(list = advancePhases(list))).toEqual(['done', 'done', 'wip']);
    expect(states(list = advancePhases(list))).toEqual(['done', 'done', 'done']);
  });

  it('wraps from all-done back to all-open, like the status cycle does', () => {
    const list = [ph('a', 'done'), ph('b', 'done')];
    expect(states(advancePhases(list))).toEqual(['open', 'open']);
  });

  it('walks back the way it came', () => {
    let list = [ph('a', 'done'), ph('b', 'wip'), ph('c')];
    expect(states(list = advancePhases(list, true))).toEqual(['done', 'open', 'open']);
    expect(states(list = advancePhases(list, true))).toEqual(['wip', 'open', 'open']);
    expect(states(list = advancePhases(list, true))).toEqual(['open', 'open', 'open']);
    // At the very start there is nothing left to undo.
    expect(advancePhases(list, true)).toBeNull();
  });

  it('reopens the last phase when everything was done', () => {
    expect(states(advancePhases([ph('a', 'done'), ph('b', 'done')], true))).toEqual(['done', 'wip']);
  });

  it('is a no-op without phases', () => {
    expect(advancePhases([])).toBeNull();
    expect(advancePhases(undefined)).toBeNull();
  });

  it('never mutates the list it was given', () => {
    const list = [ph('a'), ph('b')];
    advancePhases(list);
    expect(states(list)).toEqual(['open', 'open']);
  });
});

describe('the task status follows its phases', () => {
  it('is open, wip or done depending on where the walk stands', () => {
    expect(statusFromPhases([ph('a'), ph('b')])).toBe('open');
    expect(statusFromPhases([ph('a', 'wip'), ph('b')])).toBe('wip');
    expect(statusFromPhases([ph('a', 'done'), ph('b')])).toBe('wip');
    expect(statusFromPhases([ph('a', 'done'), ph('b', 'done')])).toBe('done');
  });

  it('has no opinion when there are no phases', () => {
    expect(statusFromPhases([])).toBeNull();
  });
});

describe('currentPhase / setPhaseCursor', () => {
  it('points at the first phase that is not done', () => {
    expect(currentPhase([ph('a', 'done'), ph('b'), ph('c')]).id).toBe('b');
    expect(currentPhase([ph('a', 'done'), ph('b', 'done')])).toBeNull();
  });

  it('jumping to a phase finishes everything before it and reopens after', () => {
    const list = [ph('a', 'done'), ph('b', 'done'), ph('c', 'done')];
    expect(states(setPhaseCursor(list, 'b'))).toEqual(['done', 'wip', 'open']);
  });

  it('returns null for a phase that is not in the list', () => {
    expect(setPhaseCursor([ph('a')], 'nope')).toBeNull();
  });
});

describe('Space produces a patch that actually changes the plan', () => {
  const node = { id: 'P1.1', status: 'open', phases: [ph('a'), ph('b')] };

  it('advances the phases and keeps status and progress in step with them', () => {
    const patch = fieldPatchForKey(node, ' ', []);
    expect(states(patch.phases)).toEqual(['wip', 'open']);
    expect(patch.status).toBe('wip');
    // The stored number must agree with what leafProgress derives, or an
    // export and the screen can disagree.
    expect(patch.progress).toBe(phaseProgress(patch.phases));
  });

  it('⇧Space reverses it', () => {
    const advanced = { ...node, phases: fieldPatchForKey(node, ' ', []).phases };
    const back = fieldPatchForKey(advanced, ' ', [], { back: true });
    expect(states(back.phases)).toEqual(['open', 'open']);
    expect(back.status).toBe('open');
  });

  it('still cycles plain status both ways on a task without phases', () => {
    expect(fieldPatchForKey({ id: 'P1', status: 'open' }, ' ', []).status).toBe('wip');
    expect(fieldPatchForKey({ id: 'P1', status: 'open' }, ' ', [], { back: true }).status).toBe('done');
    expect(fieldPatchForKey({ id: 'P1', status: 'wip' }, ' ', [], { back: true }).status).toBe('open');
  });
});
