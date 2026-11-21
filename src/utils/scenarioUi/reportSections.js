import { KIND_ORDER, PRESENCE_LABEL, capPct, latenessOf, movedText } from './compareFigures.js';
import { changeTitle } from './fieldLabels.js';

// The tables and figures of the scenario report, one function per section.
// useScenarioReport (components/shared/scenario/) decides which rows go in;
// these only turn them into the plain rows a PDF can lay out.

const REPORT_TASK_LIMIT = 40;

const bold = (value, tone) => ({ text: value, bold: true, ...(tone ? { tone } : {}) });
const projectState = (t, p) => {
  const late = latenessOf(p);
  if (late === 'nowLate') return { text: t('scn.nowLate'), tone: 'risk', bold: true };
  if (late === 'nowOnTime') return { text: t('scn.nowOnTime'), tone: 'done', bold: true };
  if (p.presence === 'added') return t('scn.added');
  if (p.presence === 'removed') return t('scn.removed');
  // Both can be true and both matter: late in the plan already, and
  // the end is not what moves.
  return [p.workLate ? t('scn.stillLate') : '', !p.shift && p.moved > 0 ? t('scn.endHeld') : ''].filter(Boolean).join(' · ');
};
const presenceOf = (t, x) => (PRESENCE_LABEL[x.presence] ? ` (${t(PRESENCE_LABEL[x.presence].key)})` : '');
const opMark = c => (c.op === 'add' ? '+' : c.op === 'remove' ? '−' : '~');

export function changesSection(t, fmt, text, list) {
  return {
    id: 'changes',
    title: t('scn.report.assumptions'),
    empty: t('scn.empty.changes'),
    headers: ['', t('scn.col.kind'), t('scn.col.what'), t('scn.col.detail')],
    widths: [10, 95, 230, '*'],
    rows: KIND_ORDER.flatMap(kind =>
      list
        .filter(c => c.kind === kind)
        .map(c => {
          const head = changeTitle(c, t, text, fmt);
          const detail =
            c.op === 'add'
              ? t('scn.added')
              : c.op === 'remove'
                ? t('scn.removed')
                : c.kind === 'order'
                  ? t('scn.f.order')
                  : text.fields(c.fields);
          return [opMark(c), t(`scn.kind.${kind}`), `${head.id ? `${head.id}  ` : ''}${head.title}`, detail];
        }),
    ),
  };
}

export function projectsSection(t, fmt, projects) {
  return {
    id: 'projects',
    title: t('scn.tab.projects'),
    empty: t('scn.empty.projects'),
    headers: [
      t('scn.col.project'),
      t('scn.col.deadline'),
      t('scn.col.planEnd'),
      t('scn.col.scnEnd'),
      t('scn.col.shift'),
      t('scn.col.movedTasks'),
      '',
    ],
    widths: ['*', 52, 56, 62, 72, 150, 110],
    rows: projects.map(p => [
      `${p.id}  ${p.name}`,
      p.date ? fmt.date(p.date) : '—',
      fmt.date(p.baseEnd),
      fmt.date(p.workEnd),
      bold(fmt.shift(p.shift), p.workLate && !p.baseLate ? 'risk' : p.baseLate && !p.workLate ? 'done' : null),
      movedText(t, fmt, p),
      projectState(t, p),
    ]),
  };
}

export function teamsSection(t, fmt, teams) {
  return {
    id: 'teams',
    title: t('scn.tab.teams'),
    empty: t('scn.empty.teams'),
    headers: [
      t('scn.col.team'),
      t('scn.col.people'),
      t('scn.col.capacity'),
      t('scn.col.movedTasks'),
      t('scn.col.teamEnd'),
      t('scn.col.shift'),
    ],
    widths: ['*', 70, 70, 170, 130, 70],
    rows: teams.map(tm => [
      `${tm.name}${presenceOf(t, tm)}`,
      tm.basePeople === tm.workPeople ? String(tm.workPeople) : bold(`${tm.basePeople} → ${tm.workPeople}`),
      tm.capNew ? bold(t('scn.capNew')) : tm.capShiftPct ? bold(capPct(tm.capShiftPct)) : '±0',
      movedText(t, fmt, tm),
      `${fmt.date(tm.baseUntil)} → ${fmt.date(tm.workUntil)}`,
      bold(fmt.shift(tm.untilShift)),
    ]),
  };
}

export function peopleSection(t, fmt, people) {
  return {
    id: 'people',
    title: t('scn.tab.people'),
    empty: t('scn.empty.people'),
    headers: [t('scn.col.person'), t('scn.col.load'), t('scn.col.loadShift'), t('scn.col.busyUntil'), t('scn.col.shift')],
    widths: ['*', 150, 80, 150, 70],
    rows: people.map(p => [
      `${p.name}${presenceOf(t, p)}`,
      `${fmt.pt(p.baseEffort)} → ${fmt.pt(p.workEffort)}`,
      p.effortShift ? bold(`${p.effortShift > 0 ? '+' : '−'}${fmt.pt(Math.abs(p.effortShift))}`) : '±0',
      `${fmt.date(p.baseUntil)} → ${fmt.date(p.workUntil)}`,
      bold(fmt.shift(p.untilShift)),
    ]),
  };
}

export function itemsSection(t, fmt, text, items) {
  return {
    id: 'items',
    title: t('scn.report.tasks'),
    empty: t('scn.empty.items'),
    headers: [t('scn.col.item'), t('scn.col.plan'), t('scn.col.scenario'), t('scn.col.who'), t('scn.col.shift')],
    widths: ['*', 105, 105, 150, 72],
    rows: items
      .slice(0, REPORT_TASK_LIMIT)
      .map(i => [
        `${i.id}  ${i.name}${presenceOf(t, i)}`,
        i.baseStart ? `${fmt.date(i.baseStart)} – ${fmt.date(i.baseEnd)}` : '—',
        i.workStart ? `${fmt.date(i.workStart)} – ${fmt.date(i.workEnd)}` : '—',
        i.peopleChanged
          ? `${i.basePeople.map(text.person).join(', ') || '—'} → ${i.workPeople.map(text.person).join(', ') || '—'}`
          : (i.workPeople.length ? i.workPeople : i.basePeople).map(text.person).join(', '),
        bold(fmt.shift(i.endShift)),
      ]),
    note: items.length > REPORT_TASK_LIMIT ? t('scn.moreItems', items.length - REPORT_TASK_LIMIT) : '',
  };
}

export function reportKpis(t, fmt, comparison, totals, list) {
  return [
    {
      label: t('scn.kpi.dates'),
      sub: t('scn.kpi.datesSub'),
      figures: [
        { n: String(totals.newlyLate || 0), label: t('scn.kpi.newlyLate'), tone: totals.newlyLate ? 'risk' : null },
        { n: String(totals.rescued || 0), label: t('scn.kpi.rescued'), tone: totals.rescued ? 'done' : null },
      ],
    },
    {
      label: t('scn.kpi.projects'),
      sub: t('scn.kpi.projectsSub', (comparison.projects || []).length),
      figures: [
        { n: String(totals.affected || 0), label: t('scn.kpi.affected') },
        { n: String(totals.later || 0), label: t('scn.kpi.endLater') },
        { n: String(totals.earlier || 0), label: t('scn.kpi.endEarlier') },
      ],
    },
    {
      label: t('scn.kpi.end'),
      sub: totals.baseEnd || totals.workEnd ? `${fmt.date(totals.baseEnd)} → ${fmt.date(totals.workEnd)}` : '',
      figures: [{ n: fmt.shift(totals.endShift) }],
    },
    { label: t('scn.tab.changes'), sub: t('scn.kpi.itemsSub', totals.itemsMoved || 0), figures: [{ n: String(list.length) }] },
  ];
}
