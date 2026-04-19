// Project template catalogue — seed data for new projects.
// Each template sets initial risks, sizes, and task templates.
// Content fields use i18n keys; call applyTemplate(tpl, t) at seed time to
// materialize translated strings. After that the project's own
// data.risks / data.sizes / data.taskTemplates are the source of truth.

export const PROJECT_TEMPLATES = [
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Software Development (default — mirrors the classic Planr defaults)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'software-dev',
    nameKey: 'tpl.softwareDev',
    descKey: 'tpl.softwareDev.desc',
    icon: '💻',
    risks: [
      { id: 'new_tech',    nameKey: 'tpl.sw.risk.newTech',    weight: 0.15 },
      { id: 'external',    nameKey: 'tpl.sw.risk.external',   weight: 0.10 },
      { id: 'integration', nameKey: 'tpl.sw.risk.integration', weight: 0.15 },
      { id: 'unclear',     nameKey: 'tpl.sw.risk.unclear',    weight: 0.20 },
    ],
    sizes: [
      { label: 'XS',  days: 1,  factor: 1.3, descKey: 'tpl.sw.size.xs' },
      { label: 'S',   days: 3,  factor: 1.3, descKey: 'tpl.sw.size.s' },
      { label: 'M',   days: 7,  factor: 1.4, descKey: 'tpl.sw.size.m' },
      { label: 'L',   days: 15, factor: 1.5, descKey: 'tpl.sw.size.l' },
      { label: 'XL',  days: 30, factor: 1.5, descKey: 'tpl.sw.size.xl' },
      { label: 'XXL', days: 45, factor: 1.6, descKey: 'tpl.sw.size.xxl' },
    ],
    taskTemplates: [
      {
        id: 'tpl_sw_fullcycle',
        nameKey: 'tpl.sw.tt.fullcycle',
        phases: [
          { id: 'ph1', nameKey: 'tpl.sw.phase.re',         effortPct: 15, teams: [], assign: [], status: 'open' },
          { id: 'ph2', nameKey: 'tpl.sw.phase.refinement', effortPct: 15, teams: [], assign: [], status: 'open' },
          { id: 'ph3', nameKey: 'tpl.sw.phase.dev',        effortPct: 50, teams: [], assign: [], status: 'open' },
          { id: 'ph4', nameKey: 'tpl.sw.phase.qa',         effortPct: 20, teams: [], assign: [], status: 'open' },
        ],
      },
      {
        id: 'tpl_sw_bugfix',
        nameKey: 'tpl.sw.tt.bugfix',
        phases: [
          { id: 'ph1', nameKey: 'tpl.sw.phase.analysis', effortPct: 20, teams: [], assign: [], status: 'open' },
          { id: 'ph2', nameKey: 'tpl.sw.phase.fix',      effortPct: 60, teams: [], assign: [], status: 'open' },
          { id: 'ph3', nameKey: 'tpl.sw.phase.verify',   effortPct: 20, teams: [], assign: [], status: 'open' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Generic / Empty
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'generic',
    nameKey: 'tpl.generic',
    descKey: 'tpl.generic.desc',
    icon: '📋',
    risks: [
      { id: 'unclear',  nameKey: 'tpl.gen.risk.unclear',  weight: 0.15 },
      { id: 'external', nameKey: 'tpl.gen.risk.external', weight: 0.10 },
      { id: 'resource', nameKey: 'tpl.gen.risk.resource', weight: 0.10 },
    ],
    sizes: [
      { label: 'XS', days: 1,  factor: 1.3, descKey: 'tpl.gen.size.xs' },
      { label: 'S',  days: 3,  factor: 1.3, descKey: 'tpl.gen.size.s' },
      { label: 'M',  days: 7,  factor: 1.4, descKey: 'tpl.gen.size.m' },
      { label: 'L',  days: 15, factor: 1.5, descKey: 'tpl.gen.size.l' },
      { label: 'XL', days: 30, factor: 1.5, descKey: 'tpl.gen.size.xl' },
    ],
    taskTemplates: [
      {
        id: 'tpl_gen_std',
        nameKey: 'tpl.gen.tt.std',
        phases: [
          { id: 'ph1', nameKey: 'tpl.gen.phase.prep',    effortPct: 20, teams: [], assign: [], status: 'open' },
          { id: 'ph2', nameKey: 'tpl.gen.phase.execute', effortPct: 60, teams: [], assign: [], status: 'open' },
          { id: 'ph3', nameKey: 'tpl.gen.phase.close',   effortPct: 20, teams: [], assign: [], status: 'open' },
        ],
      },
    ],
  },
];

// Default template used when no selection is made
export const DEFAULT_TEMPLATE_ID = 'software-dev';

/** Return a template by id, or the default template as fallback. */
export function getTemplate(id) {
  return PROJECT_TEMPLATES.find(t => t.id === id) ?? PROJECT_TEMPLATES.find(t => t.id === DEFAULT_TEMPLATE_ID);
}

/**
 * Materialize a template into project data, resolving all i18n keys via `t`.
 * Call this once at project creation; the returned risks/sizes/taskTemplates
 * contain plain strings in the current UI language and become user data.
 */
export function applyTemplate(tpl, t) {
  if (!tpl) return { risks: [], sizes: [], taskTemplates: [] };
  const resolve = key => (key && typeof t === 'function' ? t(key) : key || '');
  return {
    risks: tpl.risks.map(r => ({ id: r.id, name: resolve(r.nameKey), weight: r.weight })),
    sizes: tpl.sizes.map(s => ({ label: s.label, days: s.days, factor: s.factor, desc: resolve(s.descKey) })),
    taskTemplates: tpl.taskTemplates.map(tt => ({
      id: tt.id,
      name: resolve(tt.nameKey),
      phases: tt.phases.map(ph => ({
        id: ph.id,
        name: resolve(ph.nameKey),
        effortPct: ph.effortPct,
        teams: [...(ph.teams || [])],
        assign: [...(ph.assign || [])],
        status: ph.status || 'open',
      })),
    })),
  };
}
