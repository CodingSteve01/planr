import { describe, it, expect } from 'vitest';
import { diffBadgeFor, collectDiffKeepIds } from '../tree/diff.js';

const t = (key, ...args) => [key, ...args].join('|');
const tree = [{ id: 'A1' }, { id: 'A1.1' }, { id: 'A1.2' }, { id: 'B1' }];

describe('tree diff badges', () => {
  it('shows nothing without a cutoff or on a parent row', () => {
    expect(diffBadgeFor({ id: 'A1.1' }, { tree, pastLeafState: null, t })).toBeNull();
    expect(diffBadgeFor({ id: 'A1' }, { tree, pastLeafState: new Map(), t })).toBeNull();
  });

  it('marks a leaf that did not exist at the cutoff as new', () => {
    expect(diffBadgeFor({ id: 'A1.1' }, { tree, pastLeafState: new Map(), t }).kind).toBe('new');
  });

  it('marks a leaf finished since the cutoff as done, with its date', () => {
    const past = new Map([['A1.1', { status: 'wip', progress: 50 }]]);
    const badge = diffBadgeFor({ id: 'A1.1', status: 'done', completedAt: '2026-01-05' }, { tree, pastLeafState: past, t });
    expect(badge.kind).toBe('done');
    expect(badge.tip).toBe('diff.tipDone (2026-01-05)');
  });

  it('reports the progress gained, and nothing when it did not grow', () => {
    const past = new Map([['A1.1', { status: 'wip', progress: 20 }]]);
    const grown = diffBadgeFor({ id: 'A1.1', status: 'wip', progress: 60 }, { tree, pastLeafState: past, t });
    expect(grown).toMatchObject({ kind: 'progress', label: '+40%' });
    expect(diffBadgeFor({ id: 'A1.1', status: 'wip', progress: 20 }, { tree, pastLeafState: past, t })).toBeNull();
  });

  it('keeps every changed leaf and all its ancestors', () => {
    const keep = collectDiffKeepIds([{ id: 'A1.2.1' }, { id: 'B1' }], r => r.id === 'A1.2.1');
    expect([...keep].sort()).toEqual(['A1', 'A1.2', 'A1.2.1']);
  });
});
