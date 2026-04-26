import { describe, it, expect } from 'vitest';
import { horizonLabel, horizonBucket } from '../horizon.js';

const NOW = new Date('2026-04-25T12:00:00Z');
const days = (n) => new Date(NOW.getTime() + n * 86400000);

describe('horizonLabel', () => {
  it('uses ISO day-precision for near-term committed work', () => {
    const d = days(7);
    expect(horizonLabel(d, 'committed', false, NOW)).toBe(d.toISOString().slice(0, 10));
  });

  it('collapses to week label between 14 and 60 days', () => {
    const label = horizonLabel(days(30), 'committed', false, NOW);
    expect(label).toMatch(/^Week \d+, /);
  });

  it('collapses to month label between 60 and 180 days', () => {
    const label = horizonLabel(days(120), 'committed', false, NOW);
    // English month name + 4-digit year
    expect(label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  });

  it('collapses to quarter label beyond 180 days', () => {
    const label = horizonLabel(days(220), 'committed', false, NOW);
    expect(label).toMatch(/^Q[1-4] \d{4}$/);
  });

  it('exploratory confidence forces quarter granularity even when near', () => {
    expect(horizonLabel(days(7), 'exploratory', false, NOW)).toMatch(/^Q[1-4] \d{4}$/);
  });

  it('estimated confidence forces at least month granularity', () => {
    const label = horizonLabel(days(7), 'estimated', false, NOW);
    expect(label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  });

  it('returns "later" / "später" for null date', () => {
    expect(horizonLabel(null, 'committed', false, NOW)).toBe('later');
    expect(horizonLabel(null, 'committed', true, NOW)).toBe('später');
  });

  it('uses German locale labels when de=true', () => {
    expect(horizonLabel(days(30), 'committed', true, NOW)).toMatch(/^KW \d+, /);
  });
});

describe('horizonBucket', () => {
  it('groups near-term work into ISO weeks', () => {
    const b = horizonBucket(days(10), 'committed', false, NOW);
    expect(b.key).toMatch(/^\d{4}-w\d{2}$/);
  });

  it('groups mid-term work into months', () => {
    const b = horizonBucket(days(90), 'committed', false, NOW);
    expect(b.key).toMatch(/^\d{4}-m\d{2}$/);
  });

  it('groups far-term and exploratory work into quarters', () => {
    const b = horizonBucket(days(220), 'committed', false, NOW);
    expect(b.key).toMatch(/^\d{4}-q\d$/);
    const ex = horizonBucket(days(40), 'exploratory', false, NOW);
    expect(ex.key).toMatch(/^\d{4}-q\d$/);
  });

  it('orders buckets chronologically via the order field', () => {
    const a = horizonBucket(days(10), 'committed', false, NOW);
    const b = horizonBucket(days(40), 'committed', false, NOW);
    expect(a.order).toBeLessThan(b.order);
  });

  it('falls back to "Later / TBD" bucket for null date', () => {
    expect(horizonBucket(null, 'committed', false, NOW).key).toBe('zzz_later');
  });
});
