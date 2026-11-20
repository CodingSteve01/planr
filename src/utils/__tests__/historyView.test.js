import { describe, expect, test } from 'vitest';
import {
  effectiveDateOfEvent,
  patchEventEffectiveDate,
  sortEventsByEffectiveDate,
} from '../historyView.js';

describe('historyView', () => {
  test('effective date prefers actual completion over recorded timestamp', () => {
    expect(effectiveDateOfEvent({
      ts: '2026-05-25T12:00:00.000Z',
      id: 'P1.1',
      status: 'done',
      completedAt: '2026-04-30',
    })).toBe('2026-04-30');
  });

  test('effective date can be edited independently for non-completion progress events', () => {
    const patched = patchEventEffectiveDate({
      ts: '2026-05-25T12:00:00.000Z',
      id: 'P1.1',
      progress: 50,
    }, '2026-05-10');

    expect(patched).toMatchObject({ effectiveAt: '2026-05-10' });
    expect(patched.completedAt).toBeUndefined();
  });

  test('done event effective date writes completedAt for diff semantics', () => {
    const patched = patchEventEffectiveDate({
      ts: '2026-05-25T12:00:00.000Z',
      id: 'P1.1',
      status: 'done',
      progress: 100,
    }, '2026-05-04');

    expect(patched).toMatchObject({ completedAt: '2026-05-04' });
  });

  test('sorts timeline by effective date, not by recorded timestamp', () => {
    const sorted = sortEventsByEffectiveDate([
      { ts: '2026-05-25T12:00:00.000Z', id: 'P1.2', status: 'done', completedAt: '2026-04-30' },
      { ts: '2026-04-20T12:00:00.000Z', id: 'P1.1', status: 'done', completedAt: '2026-05-10' },
    ]);

    expect(sorted.map(ev => ev.id)).toEqual(['P1.2', 'P1.1']);
  });
});
