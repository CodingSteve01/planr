import { iso, isoWeek, isoWeekYear } from '../date.js';
import { getLineColor } from '../roadmap.js';
import { computeProjectRoadmap, renderProjectRoadmapSvg } from '../projectRoadmap.js';
import { PRINT } from '../printPalette.js';
import { headerTable } from './pdfCore.js';
import { prepareProjectRoadmapSvg } from './pdfSvg.js';
import { SUMMARY_W, ROADMAP_MAX_H, buildRoadmapLegendPdf } from './summaryModel.js';

export async function pushRoadmapSection(content, { t, roadmapSvg, rmModelArgs }) {
  if (roadmapSvg) {
    content.push({ text: t('Roadmap', 'Roadmap'), style: 'h2', pageBreak: 'before' });
    // `fit`, not `width`: a board with ten or more lanes is taller than the
    // page has room for under the heading at full width, and pdfmake would
    // rather start a new page than shrink it.
    content.push({ svg: roadmapSvg, fit: [SUMMARY_W, ROADMAP_MAX_H], margin: [0, 0, 0, 8] });
    // Legend mirrors the Overview-tab block: per-line column with station rows.
    const { computeRoadmapModel } = await import('../roadmap.js');
    const rmModel = computeRoadmapModel(rmModelArgs);
    const legendRows = buildRoadmapLegendPdf(rmModel);
    if (legendRows) {
      // The legend used to run straight on from the map with no heading, so
      // whoever turned the page met a bare grid of abbreviations.
      content.push({ text: t('Stations', 'Haltestellen'), style: 'h3', pageBreak: 'before', margin: [0, 0, 0, 6] });
      legendRows.forEach(r => content.push(r));
    }
  }
}

export function pushProjectRoadmapsSection(content, { t, ctx, includeProjectRoadmaps }) {
  // ── Per-project roadmaps ────────────────────────────────────────────────
  // The subway map compares projects; these pages describe one each — the same
  // calendar view the Overview shows when a single project is picked, rendered
  // for EVERY root, because an export covers the whole plan (utils/exportCtx.js)
  // and must not depend on what the screen happens to be showing.
  if (includeProjectRoadmaps) {
    const roots = (ctx.tree || []).filter(node => node?.id && !node.id.includes('.'));
    const labels = {
      months: t('Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec', 'Jan,Feb,Mär,Apr,Mai,Jun,Jul,Aug,Sep,Okt,Nov,Dez'),
      tasks: t('tasks', 'Aufgaben'),
      today: t('today', 'heute'),
      deadline: t('Deadline', 'Deadline'),
      noDates: t('no dates yet', 'noch keine Termine'),
      dropped: t('dropped', 'verworfen'),
      stateDone: t('done', 'erledigt'),
      stateWip: t('in progress', 'in Bearbeitung'),
      stateOpen: t('open', 'offen'),
    };
    let first = true;
    roots.forEach(root => {
      const model = computeProjectRoadmap({ tree: ctx.tree, scheduled: ctx.scheduled, stats: ctx.stats, rootId: root.id });
      if (!model?.rows?.length) return;
      const svgStr = renderProjectRoadmapSvg({
        tree: ctx.tree,
        scheduled: ctx.scheduled,
        stats: ctx.stats,
        rootId: root.id,
        color: getLineColor(root.id, ctx.roadmapAssignment) || PRINT.accent,
        labels,
      });
      const prepared = prepareProjectRoadmapSvg(svgStr, model.height);
      if (!prepared) return;
      if (first) {
        content.push({ text: t('Project roadmaps', 'Projekt-Roadmaps'), style: 'h2', pageBreak: 'before' });
        content.push({
          text: t(
            'One row per work package, on a calendar. Stops are the individual tasks.',
            'Eine Zeile je Arbeitspaket, auf dem Kalender. Haltestellen sind die einzelnen Aufgaben.',
          ),
          style: 'cap',
          margin: [0, 0, 0, 8],
        });
        first = false;
      }
      // Scale to the text width, keeping the aspect ratio of the model height.
      content.push({ svg: prepared, width: SUMMARY_W, margin: [0, 0, 0, 14] });
    });
  }
}

export async function pushTimetableSection(content, { t, ctx, rmModelArgs, includeTimetable }) {
  // Optional Fahrplan section — chronological station timetable for each line.
  // Uses the same computeRoadmapModel data as the Subway-Map.
  if (includeTimetable) {
    try {
      const { computeRoadmapModel } = await import('../roadmap.js');
      const rmModel = computeRoadmapModel(rmModelArgs);
      if (rmModel?.lines?.length) {
        content.push({ text: t('Timetable', 'Fahrplan'), style: 'h2' });
        content.push({
          text: t(
            'Station abbreviations reference the Subway-Map legend above.',
            'Stations-Kürzel verweisen auf die Legende der Subway-Map oben.',
          ),
          style: 'cap',
          margin: [0, 0, 0, 8],
        });
        // Aggregate all handoff segments for a tree item so cross-team chains show up.
        const segsByTree = {};
        (ctx.scheduled || []).forEach(s => {
          const k = s.treeId || s.id;
          (segsByTree[k] ||= []).push(s);
        });
        const kwTag = d => `KW${isoWeek(d)}/${String(isoWeekYear(d)).slice(-2)}`;

        // 2-col layout: split the lines down the middle per page.
        const buildLineBlock = line => {
          const allStations = [...line.majorStations, ...line.minorStations].filter(st => st.clusterItems?.length);
          const rows = allStations
            .map(st => {
              const items = st.clusterItems || [];
              const allSegs = items.flatMap(it => segsByTree[it.id] || []);
              const dated = allSegs.filter(s => s && s.startD && s.endD);
              const startD = dated.length ? new Date(Math.min(...dated.map(s => +s.startD))) : null;
              const endD = dated.length ? new Date(Math.max(...dated.map(s => +s.endD))) : null;
              const calDays = startD && endD ? Math.max(1, Math.round((endD - startD) / 86400000) + 1) : 0;
              const workDays = dated.reduce((s, r) => s + (r.workingDaysInWindow || 0), 0);
              // ◐ ◆ both missing in pdfmake Roboto. ● + amber color marks WIP.
              const status = st.allDone ? '✓' : items.some(it => it.status === 'wip') ? '●' : '○';
              return { abbrev: st.abbrev + (items.length > 1 ? ' ×' + items.length : ''), startD, endD, calDays, workDays, status };
            })
            .sort((a, b) => (a.startD || 0) - (b.startD || 0));

          // A timetable answers "when". A station with no scheduled segment has
          // no answer, and printing it filled whole pages with "— / —" rows.
          // The ones dropped are named in a single line below the table rather
          // than vanishing silently.
          const dated = rows.filter(r => r.startD);
          const undated = rows.filter(r => !r.startD);

          return {
            unbreakable: true,
            stack: [
              {
                text: [
                  { text: line.root.id + '  ', color: line.color, bold: true },
                  { text: line.root.name, color: PRINT.ink, bold: true },
                ],
                fontSize: 10,
                margin: [0, 0, 0, 3],
              },
              dated.length
                ? headerTable(
                    [t('Stn', 'Stn'), t('Start', 'Start'), t('Dauer', 'Dauer'), ''],
                    dated.map(r => [
                      { text: r.abbrev, color: line.color, bold: true, fontSize: 9 },
                      { text: `${kwTag(r.startD)} ${iso(r.startD).slice(5)}`, fontSize: 8 },
                      { text: r.calDays ? `${r.calDays}d/${r.workDays.toFixed(0)}PT` : '—', fontSize: 8 },
                      {
                        text: r.status,
                        alignment: 'center',
                        fontSize: 9,
                        color: r.status === '✓' ? PRINT.done : r.status === '●' ? PRINT.wip : PRINT.muted,
                      },
                    ]),
                    [45, 80, 60, 20],
                  )
                : { text: t('No scheduled stations.', 'Keine terminierten Haltestellen.'), fontSize: 8, color: PRINT.muted, italics: true },
              undated.length
                ? {
                    text: t('Not scheduled: ', 'Nicht terminiert: ') + undated.map(r => r.abbrev).join(', '),
                    fontSize: 7.5,
                    color: PRINT.muted,
                    margin: [0, 3, 0, 0],
                  }
                : '',
            ],
            margin: [0, 0, 0, 10],
          };
        };

        // Pair lines 2-per-row via pdfmake columns.
        for (let i = 0; i < rmModel.lines.length; i += 2) {
          const left = buildLineBlock(rmModel.lines[i]);
          const right = rmModel.lines[i + 1] ? buildLineBlock(rmModel.lines[i + 1]) : { text: '' };
          content.push({ columns: [left, right], columnGap: 14 });
        }
      }
    } catch (e) {
      console.warn('[summary-pdf] timetable generation failed', e);
    }
  }
}
