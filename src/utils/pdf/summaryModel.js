import { iso } from '../date.js';
import { PRINT } from '../printPalette.js';

// A4 landscape (841.89pt) less the 36pt margins the summary uses on both
// sides. Every full-width element on that page measures itself against this
// rather than carrying its own rounded-down copy.
const SUMMARY_W = 770;
// What is left of a landscape A4 page (595pt, margins 36/40) under the
// "Roadmap" heading.
const ROADMAP_MAX_H = 470;

// ── Summary page 1 ─────────────────────────────────────────────────────────
// A board reads top-left first and forwards this page on its own, so it states
// its conclusion before any figure that supports it. The composition is fixed
// rather than data-driven — always five KPI slots, at most five risks, one
// confidence bar — because a page whose shape changes month to month cannot be
// read as a series.
// Three on the page, sorted by severity. The expert brief settled on three
// with a hard cap of five; three is also what fits beside a project table of
// this size without the block tearing across the page break.
const MAX_RISKS = 3;
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 };

// One date format per document. ISO belongs in engineering appendices, not in
// a German board pack that also prints "23. September 2026" two lines above.
function fmtDay(d, de) {
  if (!d) return '—';
  const s = iso(d);
  return de ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : s;
}
function fmtMonth(d) {
  if (!d) return '—';
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function fmtInt(n, de) {
  return new Intl.NumberFormat(de ? 'de-DE' : 'en-US').format(Math.round(n || 0));
}

// One row per project, because a programme of eight independent projects has
// no single answer to "when is it done". The page used to print the maximum
// across all of them, which is the slowest project's date wearing the whole
// programme's name — true, and no use to anyone deciding about any one of them.
function projectStatus(m) {
  const { rootData, deadlineStates } = m;
  return rootData
    .map(r => {
      const ds = deadlineStates?.[r.id] || null;
      const days = ds?.dateD && ds?.end ? Math.round((ds.end - ds.dateD) / 86400000) : null;
      const late = !!ds?.isLate && days !== null && days > 0;
      const unclear = r.openPt > 0 ? r.ccPt.exploratory / r.openPt : 0;
      return {
        ...r,
        ds,
        days,
        late,
        unclear,
        color: late ? PRINT.risk : unclear > 0.25 ? PRINT.wip : PRINT.done,
      };
    })
    .sort((a, b) => {
      // Missed dates first, worst by days; then everything else by how much of
      // it is still unscoped.
      if (a.late !== b.late) return a.late ? -1 : 1;
      if (a.late && b.late) return b.days - a.days;
      return b.unclear - a.unclear;
    });
}

// The sentence the whole page exists to deliver.
function summaryVerdict(m, projects) {
  const { t, ccPt } = m;
  const openPt = ccPt.committed + ccPt.estimated + ccPt.exploratory;
  const unclearShare = openPt > 0 ? ccPt.exploratory / openPt : 0;
  const withTarget = projects.filter(p => p.ds?.dateD);
  const lateOnes = projects.filter(p => p.late);
  const last = projects.reduce((acc, p) => (p.endD && (!acc || !acc.endD || p.endD > acc.endD) ? p : acc), null);
  const lastTxt = last ? `${fmtMonth(last.endD)} (${(last.name || '').trim()})` : '—';
  if (lateOnes.length) {
    const worst = lateOnes[0];
    return {
      word: t('RED', 'ROT'),
      color: PRINT.risk,
      line: t(
        `${lateOnes.length} of ${projects.length} projects miss their date — worst "${(worst.name || '').trim()}" by ${worst.days} days. Last project ends ${lastTxt}.`,
        `${lateOnes.length} von ${projects.length} Projekten verfehlen ihren Termin — am stärksten „${(worst.name || '').trim()}" um ${worst.days} Tage. Letztes Projekt endet ${lastTxt}.`,
      ),
    };
  }
  if (!withTarget.length) {
    return {
      word: t('NO TARGET', 'KEIN ZIEL'),
      color: PRINT.wip,
      line: t(
        `No project carries a target date, so none can be measured against one. Last project ends ${lastTxt}.`,
        `Kein Projekt hat einen hinterlegten Zieltermin, also lässt sich keines an einem messen. Letztes Projekt endet ${lastTxt}.`,
      ),
    };
  }
  if (unclearShare > 0.25) {
    return {
      word: t('AMBER', 'GELB'),
      color: PRINT.wip,
      line: t(
        `All ${withTarget.length} recorded dates hold, but ${Math.round(unclearShare * 100)}% of the open effort is not scoped yet. Last project ends ${lastTxt}.`,
        `Alle ${withTarget.length} hinterlegten Termine halten, aber ${Math.round(unclearShare * 100)}% des offenen Aufwands sind noch nicht geklärt. Letztes Projekt endet ${lastTxt}.`,
      ),
    };
  }
  return {
    word: t('GREEN', 'GRÜN'),
    color: PRINT.done,
    line: t(
      `Every recorded date holds under the current plan. Last project ends ${lastTxt}.`,
      `Alle hinterlegten Termine werden nach aktueller Planung gehalten. Letztes Projekt endet ${lastTxt}.`,
    ),
  };
}

// ── Roadmap legend for pdfmake ──────────────────────────────────────────────
// Per line: a header and one row per station. Unlike the on-screen legend
// this never lists what sits under a station — a management summary has no
// expand toggle, and the unfolded form ran to five pages of ellipsised
// fragments. Done stations are marked with a check, not struck through:
// a line through a name reads as cancelled, which is the opposite of what
// a finished station means.
function truncateStr(s, n) {
  return (s || '').length > n ? (s || '').slice(0, n - 1) + '…' : s || '';
}
function buildRoadmapLegendPdf(model) {
  if (!model?.lines?.length) return null;
  const statusGlyph = s => (s === 'done' ? '✓' : s === 'wip' ? '●' : '○');
  const columns = model.lines.map(line => {
    const allStations = [...line.majorStations, ...line.minorStations].sort((a, b) => a.t - b.t);
    if (!allStations.length) return { text: '', width: '*' };
    const stack = [
      {
        columns: [
          { canvas: [{ type: 'rect', x: 0, y: 3, w: 20, h: 10, r: 2, color: line.color }], width: 24 },
          { text: line.root.id, color: line.color, bold: true, fontSize: 9, width: 'auto', noWrap: true, margin: [2, 2, 4, 0] },
          { text: truncateStr(line.root.name, 22), color: PRINT.ink2, fontSize: 8, noWrap: true, margin: [0, 2, 0, 0] },
        ],
        columnGap: 3,
        margin: [0, 0, 0, 3],
      },
    ];
    allStations.forEach(st => {
      const stStatus = st.allDone ? 'done' : st.done > 0 ? 'wip' : 'open';
      const badge = st.allDone ? '' : ` ${st.done}/${st.total}`;
      stack.push({
        columns: [
          {
            text: statusGlyph(stStatus),
            color: stStatus === 'open' ? PRINT.muted : line.color,
            fontSize: 8,
            width: 10,
            margin: [0, 1, 0, 0],
          },
          { text: st.abbrev, color: line.color, bold: true, fontSize: 8, width: 30, noWrap: true, margin: [0, 1, 0, 0] },
          { text: truncateStr(st.name, 24) + badge, color: st.allDone ? PRINT.muted : PRINT.ink, fontSize: 7.5, margin: [0, 1, 0, 0] },
        ],
        columnGap: 2,
        margin: [0, 0, 0, 1],
      });
    });
    return { stack, width: '*' };
  });
  // pdfmake columns wrap on a single row; fit max 4 per row for legibility.
  const rowsOf = 4;
  const rows = [];
  for (let i = 0; i < columns.length; i += rowsOf) {
    rows.push({ columns: columns.slice(i, i + rowsOf), columnGap: 12, margin: [0, 0, 0, 6] });
  }
  return rows;
}

export {
  SUMMARY_W,
  ROADMAP_MAX_H,
  MAX_RISKS,
  SEVERITY_RANK,
  fmtDay,
  fmtMonth,
  fmtInt,
  projectStatus,
  summaryVerdict,
  buildRoadmapLegendPdf,
};
