import { iso } from '../date.js';
import { buildReportModel } from '../report.js';
import { projectScopedCtx } from '../exportCtx.js';
import { sanitizePdfDoc } from '../pdfGlyphs.js';
import { horizonLabel } from '../horizon.js';
import { PRINT } from '../printPalette.js';
import { STYLES, countLabel, footerBuilder, headerTable, loadPdfMake, slug } from './pdfCore.js';

// ── TODO / Sprint PDF ───────────────────────────────────────────────────────
// The document definition. Returns `{ empty }` with the message the export
// shows when there is nothing to list, `{ dd, fileName }` otherwise.
export function buildTodoDocDefinition(ctx, horizonDays) {
  ctx = projectScopedCtx(ctx, 'exportTodoPDF');
  const m = buildReportModel(ctx);
  const { meta, t, dateStr, scheduled, tree, teams, confidence } = m;
  if (!scheduled.length) return { empty: m.de ? 'Kein Zeitplan vorhanden.' : 'Nothing scheduled.' };
  const horizon = horizonDays ? Math.max(1, parseInt(horizonDays) || 30) : 30;
  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + horizon);
  const up = scheduled
    .filter(s => s.status !== 'done' && s.startD && s.startD <= end)
    .sort((a, b) => a.startD - b.startD || (a.prio || 4) - (b.prio || 4));
  if (!up.length) return { empty: (m.de ? 'Keine Aufgaben in ' : 'No tasks within ') + horizon + (m.de ? ' Tagen.' : ' days.') };
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';

  // Group by person (preferred) or team-unassigned.
  const groups = new Map();
  up.forEach(s => {
    const key = s.personId || 'team:' + (s.team || 'none');
    if (!groups.has(key))
      groups.set(key, {
        key,
        isPerson: !!s.personId,
        label: s.personId
          ? s.person
          : (teamName(s.team) || (m.de ? 'Kein Team' : 'No team')) + ' (' + t('unassigned', 'unzugewiesen') + ')',
        items: [],
      });
    groups.get(key).items.push(s);
  });
  const sorted = [...groups.values()].sort((a, b) => (a.isPerson === b.isPerson ? a.label.localeCompare(b.label) : a.isPerson ? -1 : 1));

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    {
      text:
        t('TODO / Sprint', 'TODO / Sprint') +
        ' · ' +
        dateStr +
        ' · ' +
        t('Horizon', 'Horizont') +
        ': ' +
        horizon +
        ' ' +
        t('days', 'Tage') +
        ' (' +
        iso(now) +
        ' → ' +
        iso(end) +
        ') · ' +
        countLabel(up.length, t('task', 'Task'), t('tasks', 'Tasks')) +
        ', ' +
        countLabel(sorted.length, t('lane', 'Lane'), t('lanes', 'Lanes')),
      style: 'sub',
    },
  ];
  sorted.forEach(g => {
    content.push(
      headerTable(
        [
          t('Start', 'Start'),
          t('End', 'Ende'),
          'ID',
          t('Task', 'Task'),
          t('Team', 'Team'),
          t('Effort', 'Aufw.'),
          t('Status', 'Status'),
          'Conf.',
        ],
        g.items.map(s => {
          const node = tree.find(r => r.id === (s.treeId || s.id));
          const conf = confidence[s.id] || 'committed';
          const label = horizonLabel(s.startD, conf, m.de, now);
          const endLabel = horizonLabel(s.endD, conf, m.de, now);
          const decide = node?.decideBy ? { text: ' ! ' + node.decideBy, color: PRINT.wip, fontSize: 8, bold: true } : null;
          const nameCell = decide ? { text: [{ text: s.name }, decide] } : s.name;
          return [
            { text: label, fontSize: 8.5 },
            { text: endLabel, fontSize: 8.5 },
            { text: s.id, fontSize: 8.5 },
            nameCell,
            teamName(s.team),
            s.effort?.toFixed(1) || '—',
            s.status === 'wip' ? { text: '● WIP', color: PRINT.wip, bold: true } : { text: t('Open', 'Offen'), color: PRINT.ink2 },
            // Confidence in its own ramp, not the status hues: the same scale
            // the summary and the screen use.
            {
              text: '●',
              color: conf === 'committed' ? PRINT.confHi : conf === 'estimated' ? PRINT.confMid : PRINT.confLo,
              alignment: 'center',
            },
          ];
        }),
        [75, 75, 45, '*', 80, 40, 50, 25],
        g.label + '  ·  ' + countLabel(g.items.length, t('task', 'Aufgabe'), t('tasks', 'Aufgaben')),
      ),
    );
  });

  content.push({
    text: [
      { text: '● ', color: PRINT.confHi },
      t('Committed', 'Verbindlich') + '  ',
      { text: '● ', color: PRINT.confMid },
      t('Estimated', 'Geschätzt') + '  ',
      { text: '● ', color: PRINT.confLo },
      t('Exploratory', 'Explorativ'),
      '  ·  ' + t('dates are rounded to match confidence', 'Daten sind der Belastbarkeit entsprechend gerundet'),
    ],
    style: 'cap',
    margin: [0, 4, 0, 0],
  });

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — TODO', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 9, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, t, kind: t('TODO / Sprint', 'TODO / Sprint') + ' · ' + horizon + ' ' + t('days', 'Tage'), dateStr }),
    content,
  };
  return { dd: sanitizePdfDoc(dd), fileName: slug(meta.name) + '-todo-' + horizon + 'd-' + iso(new Date()) + '.pdf' };
}

export async function exportTodoPDF(ctx, horizonDays) {
  const { dd, fileName, empty } = buildTodoDocDefinition(ctx, horizonDays);
  if (empty) return alert(empty);
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(dd).download(fileName);
}
