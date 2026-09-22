/** @vitest-environment happy-dom */
// Who is doing this looks the same everywhere.
//
// Reported: the Planning tab shows pills where every other view shows
// something else. It had four vocabularies for one fact — the tree wrote
// plain mono initials and an italic `~XX` for a suggestion, the Gantt used a
// grey filled box, the Planning tab used a `btn btn-pri` (the loudest control
// in the app, on every row, for a person's initials), and a handoff chain had
// its own bordered amber variant in two places with different padding.
//
// The tree's won, because it is the quietest: initials are an identifier, not
// a call to action.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PersonChip } from '../components/shared/PersonChip.jsx';

describe('the person chip', () => {
  afterEach(() => cleanup());

  it('says plainly who was assigned', () => {
    const { container } = render(<PersonChip short="SL" />);
    const el = container.querySelector('[data-person-chip]');
    expect(el.dataset.personChip).toBe('assigned');
    expect(el.textContent).toBe('SL');
    expect(el.style.fontStyle).toBe('normal');
  });

  it('marks the schedule’s own answer as the schedule’s', () => {
    const { container } = render(<PersonChip auto short="MZ" />);
    const el = container.querySelector('[data-person-chip]');
    expect(el.dataset.personChip).toBe('auto');
    expect(el.textContent).toContain('~');
    expect(el.style.fontStyle).toBe('italic');
  });

  it('gives a handoff chain the one colour worth noticing', () => {
    const { container } = render(<PersonChip chain short="A→B" />);
    const el = container.querySelector('[data-person-chip]');
    expect(el.dataset.personChip).toBe('chain');
    expect(el.style.color).toContain('--st-wip');
    expect(container.querySelector('svg'), 'no chain icon').toBeTruthy();
  });

  it('renders nothing rather than an empty box', () => {
    const { container } = render(<PersonChip short="" />);
    expect(container.querySelector('[data-person-chip]')).toBeNull();
  });
});

describe('the views', () => {
  // The specific regression: a person rendered as a primary button. That is
  // the app's loudest control, and on the Planning tab it was on every row.
  const VIEWS = readdirSync(path.join(process.cwd(), 'src/components/views'))
    .filter(f => f.endsWith('.jsx'))
    .map(f => `src/components/views/${f}`);

  it.each(VIEWS)('%s does not dress a person as a primary button', file => {
    const src = readFileSync(path.join(process.cwd(), file), 'utf8');
    const offenders = src.split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /btn-pri/.test(line) && /memberShort|snAll|personId\)|shortMap/.test(line))
      .map(({ line, n }) => `${n}: ${line.trim().slice(0, 80)}`);
    expect(offenders, `a person drawn as a primary button:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('draws people through the one component, in every view that shows them', () => {
    for (const file of ['src/components/views/TreeView.jsx', 'src/components/views/GanttView.jsx',
      'src/components/views/PlanReview.jsx', 'src/components/views/WorkOrderView.jsx']) {
      const src = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(src, `${file} does not use PersonChip`).toMatch(/PersonChip/);
    }
  });
});
