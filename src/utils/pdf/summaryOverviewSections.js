import { iso } from '../date.js';
import { PRINT } from '../printPalette.js';
import { progressPctLabel } from '../progress.js';
import { headerTable } from './pdfCore.js';
import { SEVERITY_RANK, MAX_RISKS, fmtDay, fmtMonth, fmtInt } from './summaryModel.js';

export function pushProjectsSection(content, { t, de, projects, ccPt }) {
  // The confidence ramp, used identically in the per-project mini-bars and in
  // the summary bar further down.
  const CONF = [
    [t('Committed', 'Verbindlich'), 'committed', PRINT.confHi],
    [t('Estimated', 'Geschätzt'), 'estimated', PRINT.confMid],
    [t('Exploratory', 'Explorativ'), 'exploratory', PRINT.confLo],
  ];
  const confBar = (ccPtOf, total, width) => {
    if (!(total > 0)) return { text: '', width };
    let x = 0;
    const rects = CONF.map(([, key, col]) => {
      const w = (width * (ccPtOf[key] || 0)) / total;
      const r = { type: 'rect', x, y: 0, w, h: 7, color: col };
      x += w;
      return r;
    }).filter(r => r.w > 0.2);
    return { canvas: rects, width, margin: [0, 2, 0, 0] };
  };
  // ── Per project ──────────────────────────────────────────────────────────
  content.push({ text: t('Where each project stands', 'Wo jedes Projekt steht'), style: 'h2' });
  content.push({
    table: {
      headerRows: 1,
      widths: [3, 22, '*', 48, 56, 44, 82, 104],
      body: [
        [
          { text: '', border: [false, false, false, false] },
          { text: '', fontSize: 8, color: PRINT.muted, margin: [6, 0, 0, 3] },
          { text: t('Project', 'Projekt'), fontSize: 8, color: PRINT.muted, margin: [0, 0, 0, 3] },
          { text: t('Forecast', 'Prognose'), fontSize: 8, color: PRINT.muted, alignment: 'right', margin: [0, 0, 0, 3] },
          { text: t('Target', 'Ziel'), fontSize: 8, color: PRINT.muted, alignment: 'right', margin: [0, 0, 0, 3] },
          { text: t('Delta', 'Abw.'), fontSize: 8, color: PRINT.muted, alignment: 'right', margin: [0, 0, 0, 3] },
          { text: t('Progress', 'Fortschritt'), fontSize: 8, color: PRINT.muted, alignment: 'right', margin: [0, 0, 10, 3] },
          { text: t('Open effort', 'Offener Aufwand'), fontSize: 8, color: PRINT.muted, margin: [0, 0, 0, 3] },
        ].map(c => ({ ...c, border: [false, false, false, true] })),
        ...projects.map(p => {
          const delta =
            p.days === null
              ? '—'
              : p.days > 0
                ? '+' + Math.max(1, Math.round(p.days / 30)) + ' ' + t('mo.', 'Mon.')
                : t('on time', 'im Plan');
          return [
            { text: '', fillColor: p.color },
            { text: p.id, fontSize: 9, bold: true, color: PRINT.ink, margin: [6, 3, 0, 3] },
            { text: (p.name || '').trim(), fontSize: 9, color: PRINT.ink, margin: [0, 3, 6, 3] },
            {
              text: p.endD ? fmtMonth(p.endD) : t('done', 'erledigt'),
              fontSize: 9,
              color: p.endD ? PRINT.ink : PRINT.muted,
              alignment: 'right',
              margin: [0, 3, 0, 3],
            },
            { text: p.ds?.dateD ? fmtDay(p.ds.dateD, de) : '—', fontSize: 9, color: PRINT.ink2, alignment: 'right', margin: [0, 3, 0, 3] },
            { text: delta, fontSize: 9, color: p.days > 0 ? PRINT.risk : PRINT.ink2, alignment: 'right', margin: [0, 3, 0, 3] },
            {
              text: Math.round(p.prog) + '% · ' + fmtInt(p.pt, de) + ' PT',
              fontSize: 9,
              color: PRINT.ink2,
              alignment: 'right',
              noWrap: true,
              margin: [0, 3, 10, 3],
            },
            { ...confBar(p.ccPt, p.openPt, 104), margin: [0, 5, 0, 3] },
          ].map(c => ({ ...c, border: [false, false, false, false] }));
        }),
      ],
    },
    layout: {
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
      hLineColor: () => PRINT.rule,
      vLineWidth: () => 0,
    },
    margin: [0, 0, 0, 6],
  });
  // The ramp is ordinal, so the legend reads left to right in that order and
  // says once what the three steps mean.
  content.push({
    columns: [
      ...CONF.map(([label, key, col]) => ({
        width: 'auto',
        columns: [
          { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, color: col }], width: 12 },
          { text: label + ' ' + fmtInt(ccPt[key], de) + ' PT', fontSize: 8, color: PRINT.muted, width: 'auto', noWrap: true },
        ],
        columnGap: 2,
      })),
      { text: '', width: '*' },
    ],
    columnGap: 14,
    margin: [25, 0, 0, 3],
  });
  // The per-project bars carry the split and the legend carries the totals, so
  // a second aggregate bar would say the same thing a third time. What is left
  // is the one line that says what the three steps mean.
  content.push({
    text: t(
      'Committed = person and a solid estimate · Estimated = effort known, person open · Exploratory = scope still open',
      'Verbindlich = Person und belastbare Schätzung · Geschätzt = Aufwand bekannt, Person offen · Explorativ = Scope noch offen',
    ),
    fontSize: 8,
    color: PRINT.muted,
    margin: [25, 0, 0, 14],
  });
}

export function pushRisksSection(content, { t, risks }) {
  // Sorted by severity then magnitude, and capped. report.js pushes rule by
  // rule, so without this a medium could sit above a critical — which it did.
  const ranked = [...risks].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (b.rank || 0) - (a.rank || 0),
  );
  const shown = ranked.slice(0, MAX_RISKS);
  if (shown.length) {
    // The heading is the table's FIRST ROW, spanning every column. pdfmake
    // does not keep a heading with the table that follows it: `unbreakable`
    // on the table pushed the table to the next page and left the heading
    // behind, and wrapping both in an unbreakable stack changed nothing,
    // because a stack is laid out one child at a time. As a row it cannot be
    // separated from what it names.
    content.push({
      table: {
        widths: [3, 170, 330, '*'],
        body: [
          [
            { text: '' },
            // Deliberately NOT style 'h2': that style carries headlineLevel,
            // which asks pdfmake to break the page BEFORE the heading so it
            // stays with what follows — and inside a table that threw the
            // whole table onto the next page with two thirds of this one
            // still empty. Same size, weight and colour, no headlineLevel.
            {
              text: t('What threatens the date', 'Was den Termin gefährdet'),
              fontSize: 14,
              bold: true,
              color: PRINT.accent,
              colSpan: 3,
              margin: [8, 2, 0, 6],
            },
            // The two cells a colSpan swallows still have to be present, and
            // they have to carry `text` — an object of nothing but `border`
            // is rejected outright ("Unrecognized document structure"), which
            // aborted the whole export.
            { text: '' },
            { text: '' },
          ].map(c => ({ ...c, border: [false, false, false, false] })),
          ...shown.map(r => {
            const color = r.severity === 'critical' ? PRINT.risk : r.severity === 'high' ? PRINT.wip : PRINT.muted;
            // A rule at the row's edge instead of a tinted ground: fills turn
            // the page into a heat map and print as dirty grey on an office
            // laser printer.
            return [
              { text: '', fillColor: color },
              { text: r.title || '', fontSize: 10, bold: true, color: PRINT.ink, margin: [8, 4, 6, 4] },
              { text: r.text || '', fontSize: 10, color: PRINT.ink2, margin: [0, 3, 6, 3] },
              { text: r.ask || '', fontSize: 9, color: PRINT.ink2, margin: [0, 3, 0, 3] },
            ].map(c => ({ ...c, border: [false, false, false, false] }));
          }),
        ],
      },
      layout: {
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
        // No rule under the heading row, none above the first finding, none
        // below the last.
        hLineWidth: (i, node) => (i <= 1 || i === node.table.body.length ? 0 : 0.5),
        hLineColor: () => PRINT.rule,
        vLineWidth: () => 0,
      },
      margin: [0, 0, 0, 4],
    });
    if (ranked.length > shown.length) {
      content.push({
        text: (n =>
          t(
            `+${n} further ${n === 1 ? 'finding' : 'findings'} of lower urgency, not shown`,
            `+${n} ${n === 1 ? 'weiterer Hinweis' : 'weitere Hinweise'} geringerer Dringlichkeit, hier nicht gezeigt`,
          ))(ranked.length - shown.length),
        fontSize: 9,
        color: PRINT.muted,
        margin: [11, 0, 0, 14],
      });
    } else {
      content.push({ text: '', margin: [0, 0, 0, 10] });
    }
  }
}

export function pushGoalsSection(content, { t, roots, rootData, deadlineStates }) {
  // Every project, not only the ones somebody labelled. `type` is an
  // annotation — goal, pain point, deadline — and filtering on it dropped
  // five of eight projects out of the summary on a real plan, the largest
  // running one among them. A management PDF that omits the biggest project
  // is worse than none. Dropped ones stay out: a decision not to do
  // something is not a focus.
  const goals = roots.filter(r => !r.dropped);
  if (goals.length) {
    content.push(
      headerTable(
        [
          'ID',
          t('Name', 'Name'),
          t('Deadline', 'Deadline'),
          t('Progress', 'Fortschritt'),
          t('Scheduled End', 'Geplantes Ende'),
          t('Risk', 'Risiko'),
        ],
        goals.map(g => {
          const rd = rootData.find(x => x.id === g.id);
          // Same state machine as the Overview cards (utils/timeline.js):
          // completed work is reported as done, never as "at risk".
          const ds = deadlineStates?.[g.id];
          const riskCell =
            ds?.state === 'atRisk'
              ? { text: '■ ' + t('AT RISK', 'GEFÄHRDET'), color: PRINT.risk, bold: true }
              : ds?.state === 'doneLate'
                ? { text: '✓ ' + t('done · late', 'abgeschl. · verspätet'), color: PRINT.wip, bold: true }
                : ds?.state === 'done'
                  ? { text: '✓ ' + t('done', 'abgeschlossen'), color: PRINT.done, bold: true }
                  : rd?.endD
                    ? { text: '✓ ' + t('on track', 'im Plan'), color: PRINT.done }
                    : '—';
          return [
            g.id,
            { text: g.name, bold: true },
            g.date || '—',
            progressPctLabel(rd?.prog || 0) + '%  ·  ' + (rd?.doneCount || 0) + '/' + (rd?.leafCount || 0) + ' ' + t('tasks', 'Aufgaben'),
            rd?.endD ? iso(rd.endD) : '—',
            riskCell,
          ];
        }),
        [40, '*', 70, 80, 70, 80],
        t('Projects, Goals & Deadlines', 'Projekte, Ziele & Deadlines'),
      ),
    );
  }
}
