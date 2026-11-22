import { describe, test, expect } from 'vitest';
import { buildLogWriters } from '../logWriters.js';
import { withDayLog, recordSavedEvents } from '../dayLogWrite.js';
import { leafSnapshot, pendingDate } from '../../utils/history.js';
import { iso } from '../../utils/date.js';

const leaf = (id, status, progress) => ({ id, name: id, team: 'Backend', best: 4, factor: 1, status, progress });
const before = () => [{ id: 'P1', name: 'Rechnungen', best: 0 }, leaf('P1.1', 'open', 0), leaf('P1.2', 'open', 0)];
const after = () => [{ id: 'P1', name: 'Rechnungen', best: 0 }, leaf('P1.1', 'wip', 40), leaf('P1.2', 'open', 0)];
const docOf = tree => ({ tree, members: [], teams: [], vacations: [], meta: {} });
const TODAY = iso(new Date());

// The refs and setters `App` hands to the writers, with `setData` applied to a
// plain value so the next document can be read back.
function setup(tree, extra = {}) {
  const prevTree = before();
  const data = { ...docOf(tree), ...extra };
  const state = { data };
  const ctx = {
    data,
    tree,
    isMdFile: false,
    setData: fn => {
      state.data = fn(state.data);
    },
    setPast: () => {},
    scnRef: { current: null },
    pastRef: { current: null },
    fileDataRef: { current: data },
    lastSavedPlanRef: { current: docOf(prevTree) },
    lastSavedLeavesRef: { current: leafSnapshot(prevTree) },
  };
  return { ctx, state, writers: buildLogWriters(ctx) };
}

describe('recordHistoryForLocalSave()', () => {
  test('a status edit with an effective day writes one entry carrying that day', () => {
    const tree = after();
    const asOfPending = { 'P1.1': pendingDate('2026-09-14', tree[1]) };
    const { state, writers, ctx } = setup(tree, { asOfPending });
    writers.recordHistoryForLocalSave();

    expect(state.data.historyEvents).toHaveLength(1);
    const [ev] = state.data.historyEvents;
    expect(ev.id).toBe('P1.1');
    expect(ev.effectiveAt).toBe('2026-09-14');
    expect(ev).toMatchObject({ status: 'wip', progress: 40 });
    // The date that was read is consumed, and the snapshot moves on.
    expect(state.data.asOfPending).toBeUndefined();
    expect(ctx.lastSavedLeavesRef.current.get('P1.1')).toMatchObject({ status: 'wip' });
  });

  test('the same edit without a day has no effective date, and the day log gets today', () => {
    const { state, writers } = setup(after());
    writers.recordHistoryForLocalSave();
    expect(state.data.historyEvents).toHaveLength(1);
    expect(state.data.historyEvents[0].effectiveAt).toBeUndefined();
    expect(state.data.dayLog.map(e => e.day)).toEqual([TODAY]);
  });

  test('no change → no entry, and the document is the same object', () => {
    const { state, writers, ctx } = setup(before());
    const original = state.data;
    writers.recordHistoryForLocalSave();
    expect(state.data).toBe(original);
    expect(state.data.historyEvents).toBeUndefined();
    expect(state.data.dayLog).toBeUndefined();
    expect(ctx.lastSavedLeavesRef.current.get('P1.1')).toMatchObject({ status: 'open' });
  });

  test('the first save only takes the snapshot', () => {
    const { state, writers, ctx } = setup(after());
    ctx.lastSavedLeavesRef.current = null;
    const original = state.data;
    writers.recordHistoryForLocalSave();
    expect(state.data).toBe(original);
    expect(ctx.lastSavedLeavesRef.current.get('P1.1')).toMatchObject({ status: 'wip' });
  });

  test('while a scenario is on screen nothing is recorded', () => {
    const { state, writers, ctx } = setup(after());
    ctx.scnRef.current = { id: 's' };
    const original = state.data;
    writers.recordHistoryForLocalSave();
    expect(state.data).toBe(original);
  });
});

describe('composeFileForSave()', () => {
  test('writes the new event, with its day, into the file content', () => {
    const tree = after();
    const asOfPending = { 'P1.1': pendingDate('2026-09-14', tree[1]) };
    const { writers } = setup(tree, { asOfPending });
    const out = writers.composeFileForSave();
    expect(out.newEvents).toHaveLength(1);
    expect(out.newEvents[0].effectiveAt).toBe('2026-09-14');
    const written = JSON.parse(out.content);
    expect(written.historyEvents).toHaveLength(1);
    expect(written.asOfPending).toBeUndefined();
  });

  test('no change → no event in the file', () => {
    const { writers } = setup(before());
    const out = writers.composeFileForSave();
    expect(out.newEvents).toEqual([]);
    expect(JSON.parse(out.content).historyEvents).toBeUndefined();
  });

  test('an earlier day on screen stamps its edits with that day', () => {
    const tree = after();
    const { writers, ctx } = setup(tree);
    ctx.pastRef.current = { day: '2026-09-10' };
    ctx.fileDataRef.current = docOf(tree);
    const out = writers.composeFileForSave();
    expect(out.newEvents).toHaveLength(1);
    expect(out.newEvents[0].effectiveAt).toBe('2026-09-10');
    expect(out.visit.day).toBe('2026-09-10');
  });

  test('a scenario on screen writes the underlying plan and no history', () => {
    const { writers, ctx } = setup(after());
    ctx.scnRef.current = { id: 's' };
    ctx.fileDataRef.current = docOf(before());
    const out = writers.composeFileForSave();
    expect(out.newEvents).toEqual([]);
    expect(JSON.parse(out.content).tree.find(n => n.id === 'P1.1').status).toBe('open');
  });
});

describe('dayLogWrite', () => {
  test('withDayLog returns the same document when the log is equal', () => {
    const d = { tree: [], dayLog: [{ day: '2026-09-10', back: { x: 1 } }] };
    expect(withDayLog(d, [{ day: '2026-09-10', back: { x: 1 } }])).toBe(d);
    expect(withDayLog({ tree: [] }, [])).toEqual({ tree: [] });
  });

  test('withDayLog drops an emptied log and sets a new one', () => {
    const d = { tree: [], dayLog: [{ day: '2026-09-10', back: {} }] };
    expect(withDayLog(d, [])).toEqual({ tree: [] });
    expect(withDayLog({ tree: [] }, [{ day: '2026-09-11', back: {} }]).dayLog).toHaveLength(1);
  });

  test('recordSavedEvents appends events and leaves the document alone without any', () => {
    const d = { tree: [], historyEvents: [{ id: 'P1.1', ts: '2026-09-01T00:00:00.000Z', to: { status: 'wip' } }] };
    const ev = { id: 'P1.2', ts: '2026-09-02T00:00:00.000Z', to: { status: 'done' } };
    expect(recordSavedEvents(d, [ev], null).historyEvents).toHaveLength(2);
    expect(recordSavedEvents(d, [], null).historyEvents).toHaveLength(1);
  });
});
