import { describe, test, expect } from 'vitest';
import { segmentShorts, chainShorts, hasChain, chainTooltip } from '../handoff.js';

const shortMap = { m1: 'AB', m2: 'CD', m3: 'EF' };

describe('segmentShorts', () => {
  test('single personId → short', () => {
    expect(segmentShorts({ personId: 'm1' }, shortMap)).toBe('AB');
  });
  test('multi-assign → slash-joined', () => {
    expect(segmentShorts({ assign: ['m1', 'm2'] }, shortMap)).toBe('AB/CD');
  });
  test('unscheduled → warning glyph', () => {
    expect(segmentShorts({ unscheduled: true }, shortMap)).toBe('⚠');
  });
  test('unknown id → first two chars uppercase', () => {
    expect(segmentShorts({ personId: 'foo' }, shortMap)).toBe('FO');
  });
  test('no id, only personName → first-name initial', () => {
    expect(segmentShorts({ personName: 'Alex Kim' }, shortMap)).toBe('Alex');
  });
});

describe('hasChain', () => {
  test('no segments → false', () => {
    expect(hasChain({ id: 'x' })).toBe(false);
  });
  test('single segment → false', () => {
    expect(hasChain({ segments: [{ personId: 'm1' }] })).toBe(false);
  });
  test('multiple segments → true', () => {
    expect(hasChain({ segments: [{ personId: 'm1' }, { personId: 'm2' }] })).toBe(true);
  });
});

describe('chainShorts', () => {
  test('no chain → primary only', () => {
    const s = { personId: 'm1' };
    expect(chainShorts(s, shortMap)).toBe('AB');
  });
  test('chain renders arrows', () => {
    const s = { segments: [{ personId: 'm1' }, { personId: 'm2' }] };
    expect(chainShorts(s, shortMap)).toBe('AB→CD');
  });
  test('unscheduled tail gets warning', () => {
    const s = { segments: [{ personId: 'm1' }, { unscheduled: true }] };
    expect(chainShorts(s, shortMap)).toBe('AB→⚠');
  });
  test('primaryShorts override respected', () => {
    const s = { segments: [{ personId: 'm1' }, { personId: 'm2' }] };
    expect(chainShorts(s, shortMap, 'AB+CD')).toBe('AB+CD→CD');
  });
});

describe('chainTooltip', () => {
  test('null for no chain', () => {
    expect(chainTooltip({ segments: [{ personId: 'm1' }] })).toBe(null);
  });
  test('joins personNames with arrows', () => {
    const s = { segments: [
      { personId: 'm1', personName: 'Alex' },
      { personId: 'm2', personName: 'Sam', handoff: true },
    ]};
    expect(chainTooltip(s)).toBe('Alex → Sam (handoff)');
  });
  test('cross-team annotated', () => {
    const s = { segments: [
      { personId: 'm1', personName: 'Alex' },
      { personId: 'm2', personName: 'Sam', handoff: true, crossTeam: true },
    ]};
    expect(chainTooltip(s)).toBe('Alex → Sam (cross-team)');
  });
  test('unscheduled segments show effort', () => {
    const s = { segments: [
      { personId: 'm1', personName: 'Alex' },
      { unscheduled: true, effort: 5.5 },
    ]};
    expect(chainTooltip(s)).toBe('Alex → ⚠ unassigned (5.5 PT)');
  });
});
