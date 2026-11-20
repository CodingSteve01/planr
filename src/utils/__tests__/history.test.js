import { describe, test, expect } from 'vitest';
import {
  parseHistoryBlock,
  parseHistoryFromMarkdown,
  formatHistoryBlock,
  formatEvent,
  leafSnapshot,
  diffSnapshots,
  stateAsOf,
  diffForUi,
  replayToDate,
  HISTORY_VERSION,
  pendingDate,
  stampPendingDates,
  withoutPendingDates,
} from '../history.js';

describe('parseHistoryBlock', () => {
  test('skips version header and parses key=value events', () => {
    const block = [
      HISTORY_VERSION,
      '2026-05-01T10:00:00Z P1.A status=wip progress=25',
      '2026-05-02T11:00:00Z P1.B status=done progress=100 completedAt=2026-05-02',
    ].join('\n');
    const events = parseHistoryBlock(block);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ ts: '2026-05-01T10:00:00Z', id: 'P1.A', status: 'wip', progress: 25 });
    expect(events[1]).toEqual({ ts: '2026-05-02T11:00:00Z', id: 'P1.B', status: 'done', progress: 100, completedAt: '2026-05-02' });
  });

  test('parseHistoryFromMarkdown extracts a fenced block from full markdown', () => {
    const md = [
      '# Project',
      '## Work Tree',
      '- **P1** Root',
      '## History',
      '',
      '```planr-history',
      'v1',
      '2026-05-01T10:00:00Z P1 status=wip progress=10',
      '```',
      '',
    ].join('\n');
    const events = parseHistoryFromMarkdown(md);
    expect(events).toEqual([{ ts: '2026-05-01T10:00:00Z', id: 'P1', status: 'wip', progress: 10 }]);
  });

  test('ignores malformed lines', () => {
    const block = `${HISTORY_VERSION}\nnot a real event\n2026-05-01T00:00:00Z P1 status=open progress=0`;
    expect(parseHistoryBlock(block)).toHaveLength(1);
  });
});

describe('formatHistoryBlock / formatEvent', () => {
  test('round-trips through parse', () => {
    const events = [
      { ts: '2026-05-01T10:00:00Z', id: 'P1.A', status: 'wip', progress: 25 },
      { ts: '2026-05-02T11:00:00Z', id: 'P1.B', status: 'done', progress: 100, completedAt: '2026-05-02' },
      { ts: '2026-05-03T11:00:00Z', id: 'P1.C', kind: 'added', status: 'open', progress: 0 },
    ];
    const block = formatHistoryBlock(events);
    expect(block.startsWith(HISTORY_VERSION)).toBe(true);
    const parsed = parseHistoryBlock(block);
    // formatHistoryBlock canonicalises field order, but the round-trip must
    // preserve every event in full.
    expect(parsed).toEqual(events);
  });

  test('formatEvent puts kind/status/progress/completedAt in canonical order', () => {
    const line = formatEvent({ ts: '2026-05-01T00:00:00Z', id: 'P1', completedAt: '2026-05-01', status: 'done', progress: 100, kind: 'added' });
    expect(line).toBe('2026-05-01T00:00:00Z P1 kind=added status=done progress=100 completedAt=2026-05-01');
  });
});

describe('leafSnapshot + diffSnapshots', () => {
  test('emits only changed fields', () => {
    const prev = leafSnapshot([
      { id: 'P1.A', status: 'wip', progress: 25 },
      { id: 'P1.B', status: 'open' },
    ]);
    const curr = leafSnapshot([
      { id: 'P1.A', status: 'done', progress: 100, completedAt: '2026-05-12' },
      { id: 'P1.B', status: 'open' }, // unchanged
      { id: 'P1.C', status: 'open' }, // newly added
    ]);
    const events = diffSnapshots(prev, curr, '2026-05-12T10:00:00Z');
    // P1.A: changed; P1.B: no event; P1.C: added
    expect(events.find(e => e.id === 'P1.A')).toMatchObject({ status: 'done', progress: 100, completedAt: '2026-05-12' });
    expect(events.find(e => e.id === 'P1.B')).toBeUndefined();
    expect(events.find(e => e.id === 'P1.C')).toMatchObject({ kind: 'added' });
  });

  test('emits removed events for vanished leaves', () => {
    const prev = leafSnapshot([{ id: 'P1.A', status: 'open' }]);
    const curr = leafSnapshot([]);
    const events = diffSnapshots(prev, curr, '2026-05-12T10:00:00Z');
    expect(events).toEqual([{ ts: '2026-05-12T10:00:00Z', id: 'P1.A', kind: 'removed' }]);
  });

  test('progress-only changes still emit', () => {
    const prev = leafSnapshot([{ id: 'P1.A', status: 'wip', progress: 25 }]);
    const curr = leafSnapshot([{ id: 'P1.A', status: 'wip', progress: 50 }]);
    const events = diffSnapshots(prev, curr, '2026-05-12T10:00:00Z');
    expect(events).toEqual([{ ts: '2026-05-12T10:00:00Z', id: 'P1.A', progress: 50 }]);
  });
});

describe('stateAsOf', () => {
  test('replays events chronologically and stops at cutoff', () => {
    const events = [
      { ts: '2026-05-01T10:00:00Z', id: 'P.A', kind: 'added', status: 'open', progress: 0 },
      { ts: '2026-05-05T10:00:00Z', id: 'P.A', progress: 50 },
      { ts: '2026-05-10T10:00:00Z', id: 'P.A', status: 'done', progress: 100, completedAt: '2026-05-10' },
    ];
    // At 2026-05-06 the task should be at 50%, still wip
    const at6 = stateAsOf(events, '2026-05-06');
    expect(at6.get('P.A')).toEqual({ status: 'open', progress: 50, completedAt: null });
    // At 2026-05-12 the task is done
    const at12 = stateAsOf(events, '2026-05-12');
    expect(at12.get('P.A')).toMatchObject({ status: 'done', progress: 100, completedAt: '2026-05-10' });
  });

  test('handles removed events by dropping the id', () => {
    const events = [
      { ts: '2026-05-01T10:00:00Z', id: 'P.A', kind: 'added', status: 'open', progress: 0 },
      { ts: '2026-05-05T10:00:00Z', id: 'P.A', kind: 'removed' },
    ];
    const at06 = stateAsOf(events, '2026-05-06');
    expect(at06.has('P.A')).toBe(false);
  });

  test('uses completedAt over effectiveAt for done replay semantics', () => {
    const events = [
      { ts: '2026-05-01T10:00:00Z', id: 'P.A', kind: 'added', status: 'open', progress: 0 },
      { ts: '2026-05-20T10:00:00Z', id: 'P.A', status: 'done', progress: 100, effectiveAt: '2026-05-30', completedAt: '2026-05-10' },
    ];

    expect(stateAsOf(events, '2026-05-15').get('P.A')).toMatchObject({ status: 'done', progress: 100 });
  });
});

describe('diffForUi', () => {
  test('flags new, gone, and progress-changed leaves', () => {
    const prev = new Map([
      ['P.A', { status: 'wip', progress: 25 }],
      ['P.B', { status: 'open', progress: 0 }],
      ['P.C', { status: 'done', progress: 100 }],
    ]);
    const curr = new Map([
      ['P.A', { status: 'done', progress: 100 }],
      ['P.B', { status: 'open', progress: 0 }], // unchanged
      ['P.D', { status: 'open', progress: 0 }], // new
    ]);
    const d = diffForUi(prev, curr);
    expect(d.get('P.A')).toMatchObject({ wasStatus: 'wip', nowStatus: 'done' });
    expect(d.has('P.B')).toBe(false);
    expect(d.get('P.C')).toMatchObject({ isGone: true });
    expect(d.get('P.D')).toMatchObject({ isNew: true });
  });
});

describe('replayToDate (Time-Travel snapshot)', () => {
  const tree = [
    { id: 'P1', name: 'Root', status: 'wip' },
    { id: 'P1.A', name: 'A', status: 'done', progress: 100, completedAt: '2026-05-15' },
    { id: 'P1.B', name: 'B', status: 'wip', progress: 60 },
    { id: 'P1.C', name: 'C', status: 'open', progress: 0 },
  ];

  test('applies status/progress as they were at the operating date', () => {
    const events = [
      { ts: '2026-05-01T10:00:00Z', id: 'P1.A', status: 'wip', progress: 40, effectiveAt: '2026-05-01' },
      { ts: '2026-05-15T10:00:00Z', id: 'P1.A', status: 'done', progress: 100, completedAt: '2026-05-15', effectiveAt: '2026-05-15' },
      { ts: '2026-05-10T10:00:00Z', id: 'P1.B', status: 'wip', progress: 30, effectiveAt: '2026-05-10' },
      { ts: '2026-05-20T10:00:00Z', id: 'P1.B', status: 'wip', progress: 60, effectiveAt: '2026-05-20' },
    ];
    const snap = replayToDate(tree, events, '2026-05-12');
    const a = snap.find(n => n.id === 'P1.A');
    const b = snap.find(n => n.id === 'P1.B');
    expect(a.status).toBe('wip');
    expect(a.progress).toBe(40);
    expect(a.completedAt).toBeUndefined();
    expect(b.status).toBe('wip');
    expect(b.progress).toBe(30);
  });

  test('filters out items added after the operating date and their subtree', () => {
    const treeWithSub = [
      ...tree,
      { id: 'P1.B.1', name: 'B-child', status: 'open', progress: 0 },
    ];
    const events = [
      { ts: '2026-05-20T10:00:00Z', id: 'P1.B', kind: 'added', status: 'open', progress: 0, effectiveAt: '2026-05-20' },
      { ts: '2026-05-21T10:00:00Z', id: 'P1.B.1', kind: 'added', status: 'open', progress: 0, effectiveAt: '2026-05-21' },
    ];
    const snap = replayToDate(treeWithSub, events, '2026-05-10');
    expect(snap.find(n => n.id === 'P1.B')).toBeUndefined();
    expect(snap.find(n => n.id === 'P1.B.1')).toBeUndefined();
    expect(snap.find(n => n.id === 'P1.A')).toBeTruthy();
  });

  test('items without any events keep current tree state when no rollback needed', () => {
    const events = [];
    const snap = replayToDate(tree, events, '2026-06-30');
    expect(snap.find(n => n.id === 'P1.A')).toEqual(tree[1]);
  });

  test('items completed in the future relative to operating date roll back even without explicit events', () => {
    const events = [];
    const snap = replayToDate(tree, events, '2026-05-12');
    const a = snap.find(n => n.id === 'P1.A');
    expect(a.completedAt).toBeUndefined();
    expect(a.status).not.toBe('done');
  });

  test('items completed after operating date are unmarked', () => {
    const events = [
      { ts: '2026-05-15T10:00:00Z', id: 'P1.A', status: 'done', progress: 100, completedAt: '2026-05-15', effectiveAt: '2026-05-15' },
    ];
    const snap = replayToDate(tree, events, '2026-05-10');
    const a = snap.find(n => n.id === 'P1.A');
    expect(a.completedAt).toBeUndefined();
  });
});

describe('compactHistory', () => {
  const ev = (ts, id, rest = {}) => ({ ts: `2026-09-${ts}T08:00:00.000Z`, id, ...rest });

  test('drops what changed nothing, keeps what did, and keeps the file order', async () => {
    const { compactHistory, stateAsOf } = await import('../history.js');
    const log = [
      ev('01', 'A', { kind: 'added', status: 'open', progress: 0 }),
      ev('02', 'B', { kind: 'added', status: 'wip', progress: 50 }),
      ev('03', 'A', { kind: 'added', status: 'open', progress: 0 }),   // again, unchanged
      ev('04', 'A', { status: 'wip', progress: 30 }),
      ev('05', 'B', { kind: 'added', status: 'wip', progress: 50 }),   // again, unchanged
      ev('06', 'A', { progress: 30 }),                                  // says what is already so
      ev('07', 'A', { status: 'done', progress: 100, completedAt: '2026-09-07' }),
    ];
    const { events, dropped } = compactHistory(log);
    expect(dropped).toBe(3);
    expect(events).toEqual([log[0], log[1], log[3], log[6]]);
    for (const day of ['02', '04', '06', '09']) {
      const at = `2026-09-${day}T23:59:59`;
      expect([...stateAsOf(events, at)]).toEqual([...stateAsOf(log, at)]);
    }
    // Compacting twice changes nothing more.
    expect(compactHistory(events).dropped).toBe(0);
    expect(compactHistory(events).events).toBe(events);
  });

  test('gone and back unchanged was never gone; gone and back different is history', async () => {
    const { compactHistory } = await import('../history.js');
    const flap = [
      ev('01', 'A', { kind: 'added', status: 'wip', progress: 40 }),
      ev('02', 'A', { kind: 'removed' }),
      ev('03', 'A', { kind: 'added', status: 'wip', progress: 40 }),
    ];
    expect(compactHistory(flap).events).toEqual([flap[0]]);
    const real = [flap[0], flap[1], ev('03', 'A', { kind: 'added', status: 'open', progress: 0 })];
    expect(compactHistory(real).dropped).toBe(0);
    // Really deleted, and back weeks later unchanged: that gap happened.
    const later = [flap[0], flap[1], { ts: '2026-10-20T08:00:00.000Z', id: 'A', kind: 'added', status: 'wip', progress: 40 }];
    expect(compactHistory(later).dropped).toBe(0);
    // A removal that stays a removal stays in the log.
    expect(compactHistory([flap[0], flap[1]]).dropped).toBe(0);
    // Removing what the log never had is nothing.
    expect(compactHistory([ev('01', 'Z', { kind: 'removed' }), flap[0]]).events).toEqual([flap[0]]);
  });

  test('judges in replay order, so a backdated entry is weighed where it takes effect', async () => {
    const { compactHistory } = await import('../history.js');
    const log = [
      ev('01', 'A', { kind: 'added', status: 'open', progress: 0 }),
      ev('20', 'A', { status: 'wip', progress: 50 }),
      // Written on the 25th, effective on the 10th: before the entry above.
      ev('25', 'A', { status: 'wip', progress: 50, effectiveAt: '2026-09-10' }),
    ];
    // In replay order the backdated one changes the state; the entry of the 20th then says nothing new.
    expect(compactHistory(log).events).toEqual([log[0], log[2]]);
  });
});

describe('dates waiting for a save', () => {
  const ev = (id, extra = {}) => ({ ts: '2026-11-20T10:00:00.000Z', id, ...extra });
  const snap = states => new Map(Object.entries(states).map(([id, [status, progress]]) => [id, { status, progress, completedAt: null }]));
  const wait = (day, status, progress) => ({ day, status, progress });

  test('stamps the item and the package above it, and nothing else', () => {
    const out = stampPendingDates(
      [ev('P1.1', { progress: 60 }), ev('P1', { status: 'wip' }), ev('P2.1', { progress: 10 }), ev('P2', { status: 'wip' })],
      { 'P1.1': wait('2026-11-10', 'wip', 60) }, snap({ 'P1.1': ['wip', 60] }));
    expect(out.map(e => e.effectiveAt || null)).toEqual(['2026-11-10', '2026-11-10', null, null]);
  });

  test('an item edited again since is a change made today', () => {
    const list = [ev('P1.1', { progress: 80 }), ev('P1', { status: 'wip' })];
    expect(stampPendingDates(list, { 'P1.1': wait('2026-11-10', 'wip', 60) }, snap({ 'P1.1': ['wip', 80] }))).toBe(list);
  });

  test('a package that also changed through a sibling edited today stays on today', () => {
    const out = stampPendingDates(
      [ev('P1.1', { progress: 60 }), ev('P1.2', { status: 'done', progress: 100 }), ev('P1', { status: 'wip' })],
      { 'P1.1': wait('2026-11-10', 'wip', 60) }, snap({ 'P1.1': ['wip', 60], 'P1.2': ['done', 100] }));
    expect(out.map(e => e.effectiveAt || null)).toEqual(['2026-11-10', null, null]);
  });

  test('a package over two dated items takes the earlier day, through every level', () => {
    const out = stampPendingDates(
      [ev('P1.1.1', { progress: 60 }), ev('P1.1.2', { progress: 30 }), ev('P1.1', { status: 'wip' }), ev('P1', { status: 'wip' })],
      { 'P1.1.1': wait('2026-11-10', 'wip', 60), 'P1.1.2': wait('2026-11-03', 'wip', 30) }, snap({ 'P1.1.1': ['wip', 60], 'P1.1.2': ['wip', 30] }));
    expect(out.map(e => e.effectiveAt)).toEqual(['2026-11-10', '2026-11-03', '2026-11-03', '2026-11-03']);
  });

  test('leaves a day that is already there, and never dates a removal', () => {
    const out = stampPendingDates([ev('P1.1', { progress: 60, effectiveAt: '2026-11-01' }), ev('P1.1', { kind: 'removed' })],
      { 'P1.1': wait('2026-11-10', 'wip', 60) }, snap({ 'P1.1': ['wip', 60] }));
    expect(out[0].effectiveAt).toBe('2026-11-01');
    expect(out[1].effectiveAt).toBeUndefined();
  });

  test('returns the same list when nothing is waiting', () => {
    const list = [ev('P1.1', { progress: 60 })];
    expect(stampPendingDates(list, null, snap({}))).toBe(list);
    expect(stampPendingDates(list, {}, snap({}))).toBe(list);
  });

  test('pendingDate records the state the edit left', () => {
    expect(pendingDate('2026-11-10', { id: 'P1.1', status: 'wip', progress: 60 })).toEqual(wait('2026-11-10', 'wip', 60));
    expect(pendingDate('yesterday', { id: 'P1.1', status: 'wip', progress: 60 })).toBeNull();
  });

  test('takes out what a save read and keeps what was set meanwhile', () => {
    const a = wait('2026-11-10', 'wip', 60), b = wait('2026-11-12', 'wip', 20);
    const data = { tree: [], asOfPending: { 'P1.1': a, 'P1.2': b } };
    expect(withoutPendingDates(data)).toEqual({ tree: [] });
    expect(withoutPendingDates(data, { 'P1.1': a })).toEqual({ tree: [], asOfPending: { 'P1.2': b } });
    expect(withoutPendingDates(data, { 'P1.1': { ...a }, 'P1.2': wait('2026-11-01', 'wip', 20) }).asOfPending).toEqual({ 'P1.2': b });
    const plain = { tree: [] };
    expect(withoutPendingDates(plain)).toBe(plain);
  });
});
