import { iso } from '../date.js';
import { PRINT } from '../printPalette.js';
import { isOnboard } from '../capacity.js';
import { memberShades } from '../teamShades.js';
import { headerTable } from './pdfCore.js';
import { fmtInt } from './summaryModel.js';

export function pushCapacitySection(content, { t, de, teamCap, scheduled }) {
  // Team capacity as per-team cards
  // People who have left are not capacity. The raw team list keeps everyone
  // who ever was, so a whole team of leavers drew a card of three names at
  // 0 PT beside teams that are actually doing the work.
  const capCards = Object.values(teamCap)
    .map(tc => ({ ...tc, members: (tc.members || []).filter(mb => isOnboard(mb)) }))
    .filter(tc => tc.members.length || tc.committed > 0 || tc.unassigned > 0);
  if (capCards.length) {
    content.push({ text: t('Team Capacity', 'Teamauslastung'), style: 'h2' });
    const pairs = [];
    for (let i = 0; i < capCards.length; i += 2) pairs.push(capCards.slice(i, i + 2));
    pairs.forEach(pair => {
      content.push({
        // Without this a card broke over the page boundary and left its two
        // summary numbers alone at the top of the next page.
        unbreakable: true,
        columns: pair.map(tc => {
          const wBar = 340;
          // From the SCHEDULE, not from explicit `assign`. Most work in a long
          // plan has no name typed on it — the scheduler picks the person —
          // so counting only explicit assignments put people at 0 PT on this
          // page while the critical-path table on the next one showed them
          // carrying a task. Handoff rows hold their own share and the primary
          // row is trimmed to its, so summing every row is not double counting.
          // The card is about THIS team's open work, and every number on it
          // adds up to the bar: a dot per member in a step of the team's own
          // colour, the same tints the Plan review draws, and the bar stacked
          // from those same shares. The dots are the bar's legend — which is
          // the whole reason they are there.
          const shades = memberShades(tc.color, tc.members.length);
          const shareOf = id =>
            scheduled
              .filter(r => r.status !== 'done' && !r.unscheduled && r.personId === id && (r.team || '') === (tc.id || ''))
              .reduce((acc, r) => acc + (r.effort || 0), 0);
          const memberShares = tc.members.map((mb, mi) => ({ mb, pt: shareOf(mb.id), color: shades[mi] || tc.color || PRINT.muted }));
          const staffedPt = memberShares.reduce((acc, x) => acc + x.pt, 0);
          const teamTotal = staffedPt + (tc.unassigned || 0);
          const memRows = memberShares.map(({ mb, pt, color }) => ({
            columns: [
              { canvas: [{ type: 'ellipse', x: 3.5, y: 6, r1: 3.5, r2: 3.5, color }], width: 10 },
              { text: mb.name + (mb.cap < 1 ? ' (' + Math.round(mb.cap * 100) + '%)' : ''), fontSize: 9, color: PRINT.ink },
              { text: fmtInt(pt, de) + ' PT', fontSize: 9, color: PRINT.ink2, alignment: 'right' },
            ],
            columnGap: 4,
          }));
          const barCanvas =
            teamTotal > 0
              ? {
                  canvas: (() => {
                    let x = 0;
                    const segs = memberShares.map(({ pt, color }) => {
                      const w = (wBar * pt) / teamTotal;
                      const r = { type: 'rect', x, y: 0, w, h: 8, color };
                      x += w;
                      return r;
                    });
                    if (tc.unassigned > 0)
                      segs.push({ type: 'rect', x, y: 0, w: (wBar * tc.unassigned) / teamTotal, h: 8, color: PRINT.rule2 });
                    return segs.filter(r => r.w > 0.2);
                  })(),
                  margin: [0, 5, 0, 3],
                }
              : null;
          const footerCol =
            teamTotal > 0
              ? {
                  columns: [
                    {
                      text: fmtInt(teamTotal, de) + ' PT ' + t('open in this team', 'offen in diesem Team'),
                      fontSize: 8,
                      color: PRINT.ink2,
                    },
                    tc.unassigned > 0
                      ? {
                          text: fmtInt(tc.unassigned, de) + ' PT ' + t('nobody on it', 'ohne Person') + ' · ' + tc.count + ' Items',
                          fontSize: 8,
                          color: PRINT.muted,
                          alignment: 'right',
                        }
                      : {
                          text: t('everything has a person', 'alles hat eine Person'),
                          fontSize: 8,
                          color: PRINT.muted,
                          alignment: 'right',
                        },
                  ],
                }
              : null;
          return {
            stack: [
              {
                columns: [
                  { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, r: 1.5, color: tc.color || PRINT.muted }], width: 12 },
                  { text: tc.name, bold: true, color: PRINT.ink, fontSize: 11 },
                ],
                columnGap: 2,
                margin: [0, 0, 0, 4],
              },
              memRows.length
                ? {
                    columns: [
                      { text: '', width: 10 },
                      { text: t('Person', 'Person'), fontSize: 7.5, color: PRINT.muted },
                      { text: t('open in this team', 'offen in diesem Team'), fontSize: 7.5, color: PRINT.muted, alignment: 'right' },
                    ],
                    columnGap: 4,
                    margin: [0, 0, 0, 2],
                  }
                : '',
              ...memRows,
              ...(barCanvas ? [barCanvas] : []),
              ...(footerCol ? [footerCol] : []),
            ],
            margin: [6, 6, 6, 6],
          };
        }),
        columnGap: 10,
        margin: [0, 0, 0, 6],
      });
    });
  }
}

export function pushCriticalPathSection(content, { t, cpItems, teamName }) {
  if (cpItems.length) {
    content.push({
      text: t('Any delay to these items delays the project end.', 'Jede Verzögerung dieser Items verzögert das Projektende.'),
      style: 'cap',
      margin: [0, 8, 0, 4],
    });
    content.push(
      headerTable(
        ['ID', t('Name', 'Name'), t('Team', 'Team'), t('Person', 'Person'), t('Start', 'Start'), t('End', 'Ende'), 'PT'],
        cpItems.map(s => [
          s.id,
          s.name,
          teamName(s.team),
          s.person || '—',
          s.startD ? iso(s.startD) : '—',
          s.endD ? iso(s.endD) : '—',
          s.effort?.toFixed(1) || '—',
        ]),
        [40, '*', 70, 80, 60, 60, 30],
        t('Critical Path', 'Kritischer Pfad'),
      ),
    );
  }
}
