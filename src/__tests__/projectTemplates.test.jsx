/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { I18nProvider, useT } from '../i18n.jsx';
import { PROJECT_TEMPLATES, DEFAULT_TEMPLATE_ID, applyTemplate, getTemplate } from '../utils/projectTemplates.js';
import { planInconsistencies } from '../utils/planIntegrity.js';
import { schedule } from '../utils/scheduler.js';

function translator(lang) {
  localStorage.clear();
  localStorage.setItem('planr_lang', lang);
  return renderHook(() => useT(), { wrapper: I18nProvider }).result.current.t;
}

// The plan "New project" writes: goals as roots, the template's data beside
// them. A task per size, carrying the first task template's phases, stands in
// for what the owner adds afterwards.
function planFrom(tpl, t) {
  const seeded = applyTemplate(tpl, t);
  const goal = (id, name) => ({ id, name, status: 'open', team: '', best: 0, factor: 1.5, deps: [], assign: [] });
  const tree = [goal('P1', 'Rechnungen'), goal('P2', 'Kundenbereich')];
  seeded.sizes.forEach((s, i) => {
    tree.push({
      id: `P${(i % 2) + 1}.${Math.floor(i / 2) + 1}`,
      name: `Aufgabe ${s.label}`,
      status: 'open',
      team: 'T1',
      best: s.days,
      factor: s.factor,
      deps: [],
      assign: ['M1'],
      phases: (seeded.taskTemplates[0]?.phases || []).map(p => ({ ...p })),
    });
  });
  return { seeded, tree };
}

describe('project templates', () => {
  afterEach(cleanup);

  it('there is a default and it is one of the templates', () => {
    expect(PROJECT_TEMPLATES.map(p => p.id)).toContain(DEFAULT_TEMPLATE_ID);
    expect(getTemplate('does-not-exist').id).toBe(DEFAULT_TEMPLATE_ID);
    expect(new Set(PROJECT_TEMPLATES.map(p => p.id)).size).toBe(PROJECT_TEMPLATES.length);
  });

  describe.each(PROJECT_TEMPLATES.map(p => [p.id, p]))('%s', (_id, tpl) => {
    let t;
    beforeEach(() => {
      t = translator('de');
    });

    it('creates a plan that passes the integrity check', () => {
      const { tree } = planFrom(tpl, t);
      expect(tree.length).toBeGreaterThan(2);
      expect(planInconsistencies(tree)).toEqual([]);
    });

    it('seeds sizes that are usable: unique labels, positive days, factor of at least 1, rising days', () => {
      const { seeded } = planFrom(tpl, t);
      const labels = seeded.sizes.map(s => s.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(seeded.sizes.length).toBeGreaterThan(0);
      for (const s of seeded.sizes) {
        expect(s.days).toBeGreaterThan(0);
        expect(s.factor).toBeGreaterThanOrEqual(1);
      }
      const days = seeded.sizes.map(s => s.days);
      expect([...days].sort((a, b) => a - b)).toEqual(days);
    });

    it('seeds risks with unique ids and positive weights', () => {
      const { seeded } = planFrom(tpl, t);
      expect(new Set(seeded.risks.map(r => r.id)).size).toBe(seeded.risks.length);
      expect(seeded.risks.every(r => r.weight > 0 && r.name)).toBe(true);
    });

    it('task templates split the effort completely: phases add up to 100 %', () => {
      const { seeded } = planFrom(tpl, t);
      for (const tt of seeded.taskTemplates) {
        expect(tt.phases.reduce((n, p) => n + p.effortPct, 0)).toBe(100);
        expect(new Set(tt.phases.map(p => p.id)).size).toBe(tt.phases.length);
      }
    });

    it('every text resolves in both languages (no raw key left)', () => {
      for (const lang of ['de', 'en']) {
        const { seeded } = planFrom(tpl, translator(lang));
        const texts = [
          ...seeded.risks.map(r => r.name),
          ...seeded.sizes.map(s => s.desc),
          ...seeded.taskTemplates.flatMap(tt => [tt.name, ...tt.phases.map(p => p.name)]),
        ];
        expect(texts.filter(x => !x || /^tpl\./.test(x))).toEqual([]);
      }
    });

    it('the seeded plan can be scheduled', () => {
      const { tree } = planFrom(tpl, t);
      const members = [{ id: 'M1', name: 'Anna Noor', team: 'T1', cap: 1, vac: 25, start: '2026-01-01' }];
      const opts = { now: '2026-01-05', anchorToToday: false, discountProgress: false };
      const { results } = schedule(tree, members, [], '2026-01-05', '2028-12-31', {}, [1, 2, 3, 4, 5], '2026-01-05', opts);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  it('a missing template seeds nothing', () => {
    expect(applyTemplate(null, k => k)).toEqual({ risks: [], sizes: [], taskTemplates: [] });
  });
});
