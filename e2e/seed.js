// The plan every browser test starts from. Invented data only: the repository
// is public, so nothing here comes from a real plan.
//
// Dates are relative to today so that "overdue" and "three days ago" mean the
// same thing whenever the suite runs.

const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const iso = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return fmt(d);
};

// The Monday two weeks back, so the plan has a past (a done task, an overdue one) and a future.
const planStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - 14 - ((d.getDay() + 6) % 7));
  return fmt(d);
};

const task = (id, name, team, best, assign, extra = {}) => ({
  id,
  name,
  team,
  best,
  factor: 1,
  status: 'open',
  assign,
  deps: [],
  ...extra,
});

export const NAMES = {
  invoices: 'Rechnungen',
  portal: 'Kundenbereich',
  login: 'Login-Seite',
  template: 'Rechnungsvorlage',
  overdue: 'Testdaten anlegen',
};

export function seedPlan({ withDayLog = false } = {}) {
  const tree = [
    { id: 'P1', name: NAMES.invoices, status: 'wip', type: 'goal' },
    task('P1.1', NAMES.template, 'T1', 3, ['M1'], { status: 'done', progress: 100 }),
    task('P1.2', 'PDF-Export', 'T1', 5, ['M1'], { status: 'wip', progress: 40 }),
    task('P1.3', 'Mahnwesen', 'T2', 8, ['M2'], { deps: ['P1.2'] }),
    task('P1.4', 'Steuerlogik', 'T2', 6, ['M3']),
    task('P1.5', NAMES.overdue, 'T2', 2, ['M2'], { decideBy: iso(-3) }),
    { id: 'P2', name: NAMES.portal, status: 'wip', type: 'goal' },
    task('P2.1', NAMES.login, 'T1', 6, ['M1'], { status: 'wip', progress: 60 }),
    task('P2.2', 'Profilseite', 'T1', 4, ['M1']),
    task('P2.3', 'Benachrichtigungen', 'T1', 5, ['M1'], { deps: ['P2.1'] }),
    task('P2.4', 'Zugriffsrechte', 'T2', 7, ['M3'], { deps: ['P1.4'] }),
    task('P2.5', 'Dokumentation', 'T2', 3, ['M2']),
    task('P2.6', 'Abnahme', 'T1', 2, ['M1'], { deps: ['P2.3', 'P2.5'] }),
  ];
  const data = {
    tree,
    members: [
      { id: 'M1', name: 'Anna Noor', team: 'T1', cap: 1, vac: 25 },
      { id: 'M2', name: 'Ben Ortiz', team: 'T2', cap: 1, vac: 25 },
      { id: 'M3', name: 'Noah Berg', team: 'T2', cap: 1, vac: 25 },
    ],
    teams: [
      { id: 'T1', name: 'Frontend', color: '#3b82f6' },
      { id: 'T2', name: 'Backend', color: '#10b981' },
    ],
    vacations: [],
    meetingPlans: [],
    meta: { name: 'Browser test plan', planStart: planStart(), planEnd: iso(300) },
  };
  if (withDayLog) {
    // Until three days ago the login page was called "Login-Entwurf".
    data.dayLog = [{ day: iso(-3), back: { tree: { set: { 'P2.1': { name: 'Login-Entwurf' } } } } }];
  }
  return data;
}

// The UI choices a test starts with: English, the tree, no tour, ids shown.
export const PREFS = {
  planr_lang: 'en',
  planr_tab: 'tree',
  planr_tour_done: '1',
  planr_new_seen_v1: '1',
  planr_tree_ids: 'true',
  planr_editor_dock: 'dialog',
  planr_theme: 'dark',
};
