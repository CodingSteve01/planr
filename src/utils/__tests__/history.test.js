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
  HISTORY_VERSION,
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
