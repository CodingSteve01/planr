// Project template catalogue — seed data for new projects.
// Each template sets initial risks, sizes, and task templates.
// Templates are applied once at project creation; after that, the project's own
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
      { id: 'new_tech',    name: 'Neue Technologie / unbekanntes Terrain',  weight: 0.15 },
      { id: 'external',   name: 'Externe Abhängigkeiten (APIs, Partner)',   weight: 0.10 },
      { id: 'integration',name: 'Komplexe Systemintegration',               weight: 0.15 },
      { id: 'unclear',    name: 'Anforderungen nicht vollständig klar',     weight: 0.20 },
    ],
    sizes: [
      { label: 'XS',  days: 1,  factor: 1.3, desc: 'Triviale Änderung, Konfiguration, Typo-Fix' },
      { label: 'S',   days: 3,  factor: 1.3, desc: 'Kleines Feature, einfacher Bugfix' },
      { label: 'M',   days: 7,  factor: 1.4, desc: 'Standard-Feature, mittlere Komplexität' },
      { label: 'L',   days: 15, factor: 1.5, desc: 'Größeres Feature, mehrere Komponenten' },
      { label: 'XL',  days: 30, factor: 1.5, desc: 'Umfangreiches Feature, übergreifende Änderungen' },
      { label: 'XXL', days: 45, factor: 1.6, desc: 'Epic, komplettes Modul oder System' },
    ],
    taskTemplates: [
      {
        id: 'tpl_sw_fullcycle',
        name: 'Full-Stack Entwicklung',
        phases: [
          { id: 'ph1', name: 'Requirements Engineering', effortPct: 15, teams: [], assign: [], status: 'open' },
          { id: 'ph2', name: 'Refinement / Design',      effortPct: 15, teams: [], assign: [], status: 'open' },
          { id: 'ph3', name: 'Entwicklung',              effortPct: 50, teams: [], assign: [], status: 'open' },
          { id: 'ph4', name: 'Testing / QA',             effortPct: 20, teams: [], assign: [], status: 'open' },
        ],
      },
      {
        id: 'tpl_sw_bugfix',
        name: 'Bugfix & Hotfix',
        phases: [
          { id: 'ph1', name: 'Analyse',    effortPct: 20, teams: [], assign: [], status: 'open' },
          { id: 'ph2', name: 'Fix',        effortPct: 60, teams: [], assign: [], status: 'open' },
          { id: 'ph3', name: 'Verifikation', effortPct: 20, teams: [], assign: [], status: 'open' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Event Planning
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'event-planning',
    nameKey: 'tpl.eventPlanning',
    descKey: 'tpl.eventPlanning.desc',
    icon: '🎉',
    risks: [
      { id: 'venue',    name: 'Location / Venue-Verfügbarkeit',       weight: 0.15 },
      { id: 'vendors',  name: 'Lieferanten und externe Dienstleister', weight: 0.15 },
      { id: 'attendance', name: 'Teilnehmerzahl unsicher',            weight: 0.10 },
    ],
    sizes: [
      { label: 'XS', days: 1,  factor: 1.2, desc: 'Einzelne Aufgabe, 1–2 Stunden' },
      { label: 'S',  days: 3,  factor: 1.3, desc: 'Kleine Aktivität, halber Tag bis 3 Tage' },
      { label: 'M',  days: 5,  factor: 1.3, desc: 'Mittlere Aufgabe, ca. eine Woche' },
      { label: 'L',  days: 10, factor: 1.4, desc: 'Größeres Gewerk, 2 Wochen' },
      { label: 'XL', days: 20, factor: 1.5, desc: 'Umfangreiche Phase, bis 4 Wochen' },
    ],
    taskTemplates: [
      {
        id: 'tpl_ev_std',
        name: 'Standardprozess Event',
        phases: [
          { id: 'ph1', name: 'Konzept & Briefing', effortPct: 10, teams: [], assign: [], status: 'open' },
          { id: 'ph2', name: 'Planung & Buchungen', effortPct: 30, teams: [], assign: [], status: 'open' },
          { id: 'ph3', name: 'Vorbereitung',        effortPct: 30, teams: [], assign: [], status: 'open' },
          { id: 'ph4', name: 'Durchführung',        effortPct: 20, teams: [], assign: [], status: 'open' },
          { id: 'ph5', name: 'Nachbereitung',       effortPct: 10, teams: [], assign: [], status: 'open' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Marketing Campaign
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'marketing-campaign',
    nameKey: 'tpl.marketingCampaign',
    descKey: 'tpl.marketingCampaign.desc',
    icon: '📣',
    risks: [
      { id: 'approval',  name: 'Freigabeprozesse dauern länger als geplant', weight: 0.20 },
      { id: 'creative',  name: 'Kreative Richtung noch unklar',              weight: 0.15 },
      { id: 'channel',   name: 'Kanal- oder Plattformänderungen',            weight: 0.10 },
    ],
    sizes: [
      { label: 'XS', days: 1,  factor: 1.2, desc: 'Kleines Asset, Anpassung' },
      { label: 'S',  days: 3,  factor: 1.3, desc: 'Einzelnes Kreativstück' },
      { label: 'M',  days: 7,  factor: 1.4, desc: 'Kampagnen-Baustein' },
      { label: 'L',  days: 14, factor: 1.5, desc: 'Sub-Kampagne oder Kanal' },
      { label: 'XL', days: 30, factor: 1.6, desc: 'Vollständige Kampagne' },
    ],
    taskTemplates: [
      {
        id: 'tpl_mk_std',
        name: 'Kampagnen-Workflow',
        phases: [
          { id: 'ph1', name: 'Briefing & Strategie', effortPct: 15, teams: [], assign: [], status: 'open' },
          { id: 'ph2', name: 'Kreation',              effortPct: 35, teams: [], assign: [], status: 'open' },
          { id: 'ph3', name: 'Freigabe',              effortPct: 15, teams: [], assign: [], status: 'open' },
          { id: 'ph4', name: 'Launch',                effortPct: 20, teams: [], assign: [], status: 'open' },
          { id: 'ph5', name: 'Erfolgsmessung',        effortPct: 15, teams: [], assign: [], status: 'open' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Research / Study
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'research-study',
    nameKey: 'tpl.researchStudy',
    descKey: 'tpl.researchStudy.desc',
    icon: '🔬',
    risks: [
      { id: 'data_avail',  name: 'Datenverfügbarkeit unsicher',             weight: 0.20 },
      { id: 'scope_creep', name: 'Scope-Ausweitung durch neue Erkenntnisse', weight: 0.20 },
      { id: 'extern_dep',  name: 'Abhängigkeit von externen Ressourcen',    weight: 0.15 },
    ],
    sizes: [
      { label: 'XS',  days: 2,  factor: 1.3, desc: 'Kurze Recherche, Literaturcheck' },
      { label: 'S',   days: 5,  factor: 1.4, desc: 'Kleines Experiment, einzelne Messung' },
      { label: 'M',   days: 15, factor: 1.5, desc: 'Teilstudie, Datenerhebungsphase' },
      { label: 'L',   days: 30, factor: 1.6, desc: 'Umfangreiches Experiment oder Analyse' },
      { label: 'XL',  days: 60, factor: 1.7, desc: 'Vollständige Studie oder Kapitel' },
      { label: 'XXL', days: 90, factor: 2.0, desc: 'Langzeitstudie, mehrstufige Methode' },
    ],
    taskTemplates: [
      {
        id: 'tpl_rs_std',
        name: 'Forschungsprozess',
        phases: [
          { id: 'ph1', name: 'Literaturrecherche',   effortPct: 15, teams: [], assign: [], status: 'open' },
          { id: 'ph2', name: 'Versuchsdesign',        effortPct: 15, teams: [], assign: [], status: 'open' },
          { id: 'ph3', name: 'Datenerhebung',         effortPct: 35, teams: [], assign: [], status: 'open' },
          { id: 'ph4', name: 'Analyse & Auswertung',  effortPct: 25, teams: [], assign: [], status: 'open' },
          { id: 'ph5', name: 'Dokumentation',         effortPct: 10, teams: [], assign: [], status: 'open' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Generic / Empty
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'generic',
    nameKey: 'tpl.generic',
    descKey: 'tpl.generic.desc',
    icon: '📋',
    risks: [
      { id: 'unclear',  name: 'Anforderungen noch unklar', weight: 0.15 },
      { id: 'external', name: 'Externe Abhängigkeiten',    weight: 0.10 },
      { id: 'resource', name: 'Ressourcen eingeschränkt',  weight: 0.10 },
    ],
    sizes: [
      { label: 'XS', days: 1,  factor: 1.3, desc: 'Sehr kleine Aufgabe' },
      { label: 'S',  days: 3,  factor: 1.3, desc: 'Kleine Aufgabe' },
      { label: 'M',  days: 7,  factor: 1.4, desc: 'Mittlere Aufgabe' },
      { label: 'L',  days: 15, factor: 1.5, desc: 'Große Aufgabe' },
      { label: 'XL', days: 30, factor: 1.5, desc: 'Sehr große Aufgabe' },
    ],
    taskTemplates: [
      {
        id: 'tpl_gen_std',
        name: 'Einfacher Workflow',
        phases: [
          { id: 'ph1', name: 'Vorbereitung', effortPct: 20, teams: [], assign: [], status: 'open' },
          { id: 'ph2', name: 'Durchführung', effortPct: 60, teams: [], assign: [], status: 'open' },
          { id: 'ph3', name: 'Abschluss',    effortPct: 20, teams: [], assign: [], status: 'open' },
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
