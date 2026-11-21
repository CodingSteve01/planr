import { iso } from '../date.js';
import { buildReportModel } from '../report.js';
import { projectScopedCtx } from '../exportCtx.js';
import { sanitizePdfDoc } from '../pdfGlyphs.js';
import { horizonLabel, horizonBucket } from '../horizon.js';
import { progressPctLabel } from '../progress.js';
import { PRINT } from '../printPalette.js';
import { STYLES, footerBuilder, headerTable, loadPdfMake, slug } from './pdfCore.js';

// ── "What comes when" PDF — horizon-aware buckets, TOPIC level ──────────────
// Each row is a top-level root (Thema / Goal / Deadline). Bucket key is the
// root's projected end date (max endD of all descendant scheduled items).
// Confidence aggregate = worst confidence among the root's open leaves.
export async function exportWhatWhenPDF(ctx) {
  ctx = projectScopedCtx(ctx, 'exportWhatWhenPDF');
  const m = buildReportModel(ctx);
  const { meta, t, dateStr, scheduled, teams, confidence, rootData, lvs, deadlineStates } = m;
  if (!scheduled.length) {
    alert(m.de ? 'Kein Zeitplan vorhanden.' : 'Nothing scheduled.');
    return;
  }
  const pdfMake = await loadPdfMake();
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';
  const now = new Date();
  // Emoji and ★ ▲ ◆ aren't in pdfmake's bundled Roboto. ● ○ ■ ✓ are safe.
  // Goals get ● bold, painpoints get ■ amber, deadlines get ■ red — set by
  // the surrounding bold/color attributes downstream.
  const GT = { goal: '●', painpoint: '■', deadline: '■' };

  // Aggregate per root: projected end, worst confidence, PT, teams-involved.
  const CONF_ORDER = { committed: 0, estimated: 1, exploratory: 2 };
  const topics = rootData
    .filter(rd => rd.endD) // only roots that actually have scheduled work
    .map(rd => {
      // Worst confidence across open descendant leaves
      const rootLeaves = lvs.filter(l => l.id === rd.id || l.id.startsWith(rd.id + '.'));
      const openLeaves = rootLeaves.filter(l => l.status !== 'done');
      let worst = 'committed';
      openLeaves.forEach(l => {
        const c = confidence[l.id] || confidence[rd.id] || 'committed';
        if (CONF_ORDER[c] > CONF_ORDER[worst]) worst = c;
      });
      // Teams involved
      const teamIds = [
        ...new Set(
          scheduled
            .filter(s => s.id === rd.id || s.id.startsWith(rd.id + '.'))
            .map(s => s.team)
            .filter(Boolean),
        ),
      ];
      // Forecast-only: a finished deadline is not "late", it is delivered.
      const ds = deadlineStates?.[rd.id];
      const deadlineLate = ds?.state === 'atRisk';
      const deadlineDone = ds?.state === 'done' || ds?.state === 'doneLate';
      return {
        rd,
        worst,
        teamIds,
        teamNames: teamIds.map(teamName).join(', ') || '—',
        deadlineLate,
        deadlineDone,
      };
    });

  // Bucket by projected end date
  const buckets = new Map();
  topics.forEach(tp => {
    const b = horizonBucket(tp.rd.endD, tp.worst, m.de, now);
    if (!buckets.has(b.key)) buckets.set(b.key, { ...b, items: [] });
    buckets.get(b.key).items.push(tp);
  });
  const sorted = [...buckets.values()].sort((a, b) => a.order - b.order);

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    {
      text:
        t('What comes when', 'Was kommt wann') +
        ' · ' +
        dateStr +
        ' · ' +
        t('projected end per topic, horizon-adjusted', 'prognostiziertes Ende je Thema, horizontgerecht'),
      style: 'sub',
    },
    {
      text: t(
        'Each row is a top-level topic with its projected completion date. Date granularity collapses to weeks, months or quarters for distant or lower-confidence topics.',
        'Jede Zeile ist ein Top-Level-Thema mit prognostiziertem Fertigstellungsdatum. Entfernte oder unsichere Themen werden zu Wochen, Monaten oder Quartalen gerundet.',
      ),
      style: 'cap',
      margin: [0, 0, 0, 10],
    },
  ];

  sorted.forEach(bucket => {
    bucket.items.sort((a, b) => (a.rd.endD || 0) - (b.rd.endD || 0));
    content.push(
      headerTable(
        [t('Projected End', 'Ende prognost.'), 'ID', t('Topic', 'Thema'), t('Teams', 'Teams'), t('Progress', 'Fortschritt'), 'PT', 'Conf.'],
        bucket.items.map(({ rd, worst, teamNames, deadlineLate, deadlineDone }) => [
          { text: horizonLabel(rd.endD, worst, m.de, now), fontSize: 9 },
          { text: rd.id, fontSize: 9 },
          {
            text: [
              rd.type ? { text: GT[rd.type] + ' ', fontSize: 10 } : '',
              { text: rd.name, bold: true },
              rd.type === 'deadline' && rd.date
                ? {
                    text: '  (' + t('deadline', 'Deadline') + ': ' + rd.date + ')',
                    fontSize: 8,
                    color: deadlineLate ? PRINT.risk : PRINT.muted,
                  }
                : '',
              deadlineLate
                ? { text: '  ■', color: PRINT.risk, bold: true }
                : deadlineDone
                  ? { text: '  ✓', color: PRINT.done, bold: true }
                  : '',
            ],
          },
          { text: teamNames, fontSize: 9 },
          { text: progressPctLabel(rd.prog) + '%  ·  ' + rd.doneCount + '/' + rd.leafCount, fontSize: 9 },
          { text: rd.pt.toFixed(0), fontSize: 9 },
          {
            text:
              '● ' +
              (worst === 'committed'
                ? t('committed', 'verbindlich')
                : worst === 'estimated'
                  ? t('estimated', 'geschätzt')
                  : t('exploratory', 'explorativ')),
            fontSize: 8.5,
            color: worst === 'committed' ? PRINT.confHi : worst === 'estimated' ? PRINT.confMid : PRINT.confLo,
          },
        ]),
        [90, 45, '*', 100, 80, 35, 85],
        bucket.label + '  ·  ' + bucket.items.length + ' ' + t('topics', 'Themen'),
      ),
    );
  });

  content.push({
    text: t(
      '● Committed (green): person assigned, solid estimate · ● Estimated (amber): effort known, no person · ○ Exploratory: scope unclear · ■ deadline at risk',
      '● Verbindlich (grün): Person zugewiesen, belastbare Schätzung · ● Geschätzt (amber): Aufwand bekannt, keine Person · ○ Explorativ: Scope unklar · ■ Deadline gefährdet',
    ),
    style: 'cap',
    margin: [0, 6, 0, 0],
  });

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — What comes when', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 10, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, t, kind: t('What comes when', 'Was kommt wann'), dateStr }),
    content,
  };
  pdfMake.createPdf(sanitizePdfDoc(dd)).download(slug(meta.name) + '-whatwhen-' + iso(new Date()) + '.pdf');
}
