/** @vitest-environment happy-dom */
// Two faults seen together on a real plan's one-project roadmap.
//
// The axis printed the year on the first tick and on January only. With a
// tick every second month starting in February, January is never drawn, so
// "Feb" of the next year carried no year and read as the same February again.
//
// "Only changed" dropped the untouched rows from the plot but left their
// names and figures in place. Every bar below a dropped row moved up and sat
// next to another package's name, and the last rows looked as if they had
// no dates at all.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PlanRoadmap } from '../components/views/PlanRoadmap.jsx';
import { I18nProvider } from '../i18n.jsx';

const tree = [
  { id: 'P1', name: 'Billing', status: 'wip' },
  { id: 'P1.1', name: 'Masks', status: 'wip' },
  { id: 'P1.2', name: 'Prices', status: 'open' },
  { id: 'P1.3', name: 'Reports', status: 'open' },
];
const scheduled = [
  { id: 'P1.1', startD: new Date(2026, 1, 10), endD: new Date(2026, 5, 20) },
  { id: 'P1.2', startD: new Date(2026, 8, 1), endD: new Date(2027, 1, 15) },
  { id: 'P1.3', startD: new Date(2027, 2, 1), endD: new Date(2027, 5, 20) },
];

const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeAll(() => {
  localStorage.setItem('planr_lang', 'en');
  localStorage.removeItem('planr_plan_roadmap_zoom');
  // About 58px per month on this span: a label every second month.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
});
afterAll(() => {
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
  localStorage.clear();
});
afterEach(cleanup);

const renderRoadmap = props => render(
  <I18nProvider><PlanRoadmap tree={tree} scheduled={scheduled} stats={{}} rootId="P1" {...props} /></I18nProvider>,
);

describe('the one-project roadmap', () => {
  it('names the year again on the first tick of each new year', () => {
    const { container } = renderRoadmap();
    const labels = [...container.querySelectorAll('.pr-tick-lbl')].map(el => el.textContent);
    expect(labels.length).toBeGreaterThan(4);
    expect(labels.some(label => /^Jan/.test(label)), 'test needs an axis that skips January').toBe(false);
    const withYear = labels.filter(label => /’\d\d$/.test(label));
    expect(withYear).toEqual([labels[0], labels.find(label => label.endsWith('’27'))]);
    expect(withYear[0]).toMatch(/’26$/);
  });

  it('keeps each bar on its own row when only changed packages are shown', () => {
    const { container } = renderRoadmap({
      sinceDate: new Date(2026, 8, 24), onlyChanged: true,
      diffDoneIds: new Set(), diffProgressedIds: new Set(['P1.3']),
    });
    const names = [...container.querySelectorAll('.pr-label-id')].map(el => el.textContent);
    const plotted = [...container.querySelectorAll('.pr-row')];
    const figures = [...container.querySelectorAll('.pr-figure')];
    expect(names).toEqual(['P1.3']);
    expect(plotted).toHaveLength(1);
    expect(figures).toHaveLength(1);
    expect(plotted[0].querySelector('[data-pr-changed="true"]')).not.toBeNull();
  });
});
