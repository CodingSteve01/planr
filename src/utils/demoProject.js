// Demo project shown on the onboarding landing page + loadable as "Try demo".
// Deliberately small: 3 root projects, ~20 leaves, realistic mix of done/wip/open
// so the Metro Roadmap shows interesting progress right away.

import { computeNRW } from './holidays.js';
import { applyTemplate, getTemplate } from './projectTemplates.js';

const today = new Date();
const iso = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const relDate = daysFromNow => { const d = new Date(today); d.setDate(d.getDate() + daysFromNow); return iso(d); };

function buildDemoTree() {
  return [
    // Goal: Launch new product
    { id: 'P1', name: 'Launch new product', type: 'goal', severity: 'high', status: 'wip', best: 0, factor: 1.5, prio: 2, seq: 10, deps: [], assign: [], team: '', description: 'Bring the new product to market in Q3.' },
    { id: 'P1.1', name: 'MVP ready', type: 'goal', severity: 'high', status: 'wip', best: 0, factor: 1.5, prio: 2, seq: 11, deps: [], assign: [], team: '' },
    { id: 'P1.1.1', name: 'Define requirements', status: 'done', best: 5, factor: 1.3, prio: 2, seq: 12, deps: [], assign: ['M1'], team: 'T1' },
    { id: 'P1.1.2', name: 'Design core UI', status: 'done', best: 8, factor: 1.4, prio: 2, seq: 13, deps: ['P1.1.1'], assign: ['M2'], team: 'T1' },
    { id: 'P1.1.3', name: 'Build frontend', status: 'wip', progress: 60, best: 15, factor: 1.5, prio: 2, seq: 14, deps: ['P1.1.2'], assign: ['M2'], team: 'T1' },
    { id: 'P1.1.4', name: 'Build backend', status: 'wip', progress: 40, best: 20, factor: 1.5, prio: 2, seq: 15, deps: ['P1.1.1'], assign: ['M1'], team: 'T2' },
    { id: 'P1.1.5', name: 'Integration testing', status: 'open', best: 7, factor: 1.4, prio: 2, seq: 16, deps: ['P1.1.3', 'P1.1.4'], assign: ['M3'], team: 'T2' },
    { id: 'P1.2', name: 'Go-to-market', status: 'open', best: 0, factor: 1.5, prio: 3, seq: 20, deps: [], assign: [], team: '' },
    { id: 'P1.2.1', name: 'Marketing site', status: 'open', best: 5, factor: 1.4, prio: 3, seq: 21, deps: ['P1.1.2'], assign: ['M2'], team: 'T1' },
    { id: 'P1.2.2', name: 'Launch campaign', status: 'open', best: 10, factor: 1.5, prio: 3, seq: 22, deps: ['P1.1.5', 'P1.2.1'], assign: ['M3'], team: 'T1' },

    // Pain point: Slow checkout
    { id: 'P2', name: 'Fix slow checkout', type: 'painpoint', severity: 'high', status: 'wip', best: 0, factor: 1.5, prio: 2, seq: 30, deps: [], assign: [], team: '', description: 'Checkout page takes >4s to load, conversions down.' },
    { id: 'P2.1', name: 'Profile the bottleneck', status: 'done', best: 3, factor: 1.3, prio: 2, seq: 31, deps: [], assign: ['M1'], team: 'T2' },
    { id: 'P2.2', name: 'Optimize DB queries', status: 'wip', progress: 75, best: 6, factor: 1.4, prio: 2, seq: 32, deps: ['P2.1'], assign: ['M1'], team: 'T2' },
    { id: 'P2.3', name: 'Add CDN caching', status: 'open', best: 4, factor: 1.3, prio: 2, seq: 33, deps: ['P2.1'], assign: ['M1'], team: 'T2' },
    { id: 'P2.4', name: 'Verify in production', status: 'open', best: 2, factor: 1.3, prio: 2, seq: 34, deps: ['P2.2', 'P2.3'], assign: ['M3'], team: 'T2' },

    // Deadline: compliance audit
    { id: 'D1', name: 'Compliance audit Q3', type: 'deadline', severity: 'critical', date: relDate(90), status: 'open', best: 0, factor: 1.5, prio: 1, seq: 40, deps: [], assign: [], team: '', description: 'External audit — must pass before Sep 30.' },
    { id: 'D1.1', name: 'Document security policies', status: 'wip', progress: 30, best: 5, factor: 1.4, prio: 1, seq: 41, deps: [], assign: ['M3'], team: 'T2' },
    { id: 'D1.2', name: 'Run penetration tests', status: 'open', best: 8, factor: 1.5, prio: 1, seq: 42, deps: ['D1.1'], assign: ['M1'], team: 'T2' },
    { id: 'D1.3', name: 'Fix findings', status: 'open', best: 10, factor: 1.6, prio: 1, seq: 43, deps: ['D1.2'], assign: ['M1', 'M2'], team: 'T2' },
    { id: 'D1.4', name: 'Audit sign-off', status: 'open', best: 2, factor: 1.3, prio: 1, seq: 44, deps: ['D1.3'], assign: ['M3'], team: 'T2' },
  ];
}

/**
 * Build a ready-to-use demo project data object.
 * Templates are resolved via the provided `t` function so demo content
 * matches the current UI language.
 */
export function buildDemoProject(t) {
  const startDate = relDate(-30);
  const endDate = relDate(180);
  const years = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];
  const hols = computeNRW(years);
  const tpl = getTemplate('software-dev');
  const seeded = applyTemplate(tpl, t);

  return {
    meta: {
      name: t ? t('demo.projectName') : 'Planr Demo Project',
      planStart: startDate,
      planEnd: endDate,
      holidays: 'NRW',
      version: '2',
    },
    teams: [
      { id: 'T1', name: 'Design & Frontend', color: '#3b82f6' },
      { id: 'T2', name: 'Backend & Platform', color: '#10b981' },
    ],
    members: [
      { id: 'M1', name: 'Alex Kim',   team: 'T2', cap: 1, vac: 25 },
      { id: 'M2', name: 'Sam Rivera', team: 'T1', cap: 1, vac: 25 },
      { id: 'M3', name: 'Jordan Lee', team: 'T2', cap: 0.5, vac: 25 },
    ],
    vacations: [],
    tree: buildDemoTree(),
    holidays: hols,
    risks: seeded.risks,
    sizes: seeded.sizes,
    taskTemplates: seeded.taskTemplates,
  };
}
