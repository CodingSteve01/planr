import { deadlineStatus } from '../timeline.js';
import { leafProgress, resolveToLeafIds, scheduleEffort } from '../scheduler.js';
import { toDate, addDays, depthOf, compareByTime, DAY } from './format.js';
import { makeAbbrev, deduplicateAbbrevs } from './abbrev.js';

export function buildRawLines({ roots, meta, scheduled, childMap, completedWindows, today, tree, nodeMap, stats, now }) {
  // Build raw lines (one per root)
  const rawLines = roots
    .map(root => {
      const rootInfo = meta[root.id] || {};

      // ── Scheduled-item clustering ─────────────────────────────────────────────
      // Get all scheduled items for this root project
      const rootScheduled = (scheduled || []).filter(s => s.id.startsWith(root.id + '.') && !childMap[s.id]?.length);
      const schedIds = new Set(rootScheduled.map(s => s.id));

      // Also include DONE leaf nodes that aren't in scheduled (scheduler skips done tasks).
      // Done tasks = "the journey already traveled". They may lack dates from the scheduler,
      // so we give dateless done items a synthetic "past" date before the project's first event.
      const firstSchedDate = rootScheduled.reduce((min, s) => {
        const d = toDate(s.startD || s.endD);
        return d && (!min || d < min) ? d : min;
      }, null);
      const syntheticPast = firstSchedDate ? addDays(firstSchedDate, -14) : addDays(toDate(now), -30);

      const doneLeaves = tree
        .filter(n => n.id.startsWith(root.id + '.') && n.status === 'done')
        .filter(n => !schedIds.has(n.id) && !childMap[n.id]?.length) // leaf only, not already scheduled
        .map(n => {
          const m = meta[n.id] || {};
          const end = m.latestEnd || m.earliestStart || toDate(n.pinnedStart) || toDate(n.date) || syntheticPast;
          const start = m.earliestStart || end;
          return { id: n.id, name: n.name, status: 'done', startD: start, endD: end };
        });
      const capDoneItem = item => {
        const node = nodeMap[item.id] || item;
        const doneWindow = node?.status === 'done' ? completedWindows.get(item.id) : null;
        const doneEnd = toDate(doneWindow?.end || node?.completedEnd || node?.completedAt || node?.completedStart);
        const doneStart = toDate(doneWindow?.start || node?.completedStart || node?.completedAt || node?.completedEnd);
        const end = doneEnd || toDate(item.endD || item.startD);
        if (node?.status !== 'done') return { ...item, clusterEndD: end };
        if (!end) return { ...item, clusterEndD: end };
        const cappedEnd = end > today ? new Date(today) : end;
        const rawStart = doneStart || toDate(item.startD || cappedEnd);
        const cappedStart = rawStart && rawStart > cappedEnd ? new Date(cappedEnd) : rawStart;
        return { ...item, startD: cappedStart || cappedEnd, endD: cappedEnd, clusterEndD: cappedEnd };
      };

      // Combine scheduled + done leaves, sort by endD
      const sorted = [...rootScheduled.filter(s => s.endD), ...doneLeaves]
        .map(capDoneItem)
        .sort((a, b) => +(a.clusterEndD || new Date(a.endD)) - +(b.clusterEndD || new Date(b.endD)));

      // ── What a stop IS ────────────────────────────────────────────────────
      // A stop is a WORK PACKAGE, not a time window.
      //
      // It used to be a window: leaves whose end dates fell within N days of
      // each other became one station. That works on a small plan and falls
      // apart on a real one, in both directions at once. Widen the window and a
      // station swallows fifty unrelated tasks and means nothing; narrow it and
      // one project puts forty touching circles on its line with the labels
      // overlapping into a band. Neither is a metro map, and neither answers
      // the question the map is for.
      //
      // The tree already says how the work is grouped, so the stop is that
      // grouping: every leaf under "Belegstruktur und Buchungslogik" is one
      // station, named after it. The count follows the plan's own structure
      // instead of a heuristic, and the name is one somebody wrote.
      //
      // The only thing left to choose is the DEPTH, and the canvas chooses it:
      // start at the root's direct children and go deeper while the stations
      // still fit the route (~1280 units wide, ~80 per label). The deepest
      // level that fits wins, because that is the most detail the map can
      // actually carry. A plan with one flat level gets its leaves as stops; a
      // deeply nested one gets its top packages.
      const MAX_STATIONS = 14;
      const rootDepth = depthOf(root.id);
      const ancestorAt = (id, depth) => id.split('.').slice(0, depth).join('.');
      const stopDepth = (() => {
        const deepest = sorted.reduce((max, item) => Math.max(max, depthOf(item.id)), rootDepth);
        let chosen = rootDepth + 1;
        for (let d = rootDepth + 1; d <= deepest; d++) {
          const count = new Set(sorted.map(item => ancestorAt(item.id, d))).size;
          if (count > MAX_STATIONS) break;
          chosen = d;
        }
        return chosen;
      })();

      // Group by that ancestor, keeping the time order the sort established —
      // a line still reads left to right by when the work lands.
      const byStop = new Map();
      sorted.forEach(item => {
        const key = ancestorAt(item.id, stopDepth) || item.id;
        if (!byStop.has(key)) byStop.set(key, []);
        byStop.get(key).push(item);
      });
      const clusters = [...byStop.entries()].map(([key, items]) => {
        // The package's own node carries the name a person wrote. A leaf that
        // IS the stop (a flat project, or an item hanging directly off the
        // root) names itself.
        const node = nodeMap[key];
        items.stopNode = node && node.id !== items[0]?.id ? node : null;
        return items;
      });

      // Build stations from clusters
      const majorStations = clusters.map(cluster => {
        // The stop is named after its package, because that is the name
        // somebody wrote for exactly this group of work. Only when the stop IS
        // a single item does it fall back to naming itself.
        const representative =
          cluster.stopNode ||
          cluster.reduce((best, item) => ((item.name || '').length > (best.name || '').length ? item : best), cluster[0]);
        const earliestStart = cluster.reduce((min, item) => {
          const d = toDate(item.startD);
          return d && (!min || d < min) ? d : min;
        }, null);
        const latestEnd = cluster.reduce((max, item) => {
          const d = toDate(item.endD);
          return d && (!max || d > max) ? d : max;
        }, null);
        const progressStats = cluster.reduce(
          (acc, item) => {
            const node = nodeMap[item.id] || item;
            const weight = scheduleEffort(node) || item.effort || 1;
            const prog = leafProgress(node) / 100;
            acc.weight += weight;
            acc.progress += weight * prog;
            if (node.status === 'done') acc.done += 1;
            return acc;
          },
          { done: 0, weight: 0, progress: 0 },
        );
        const done = progressStats.done;
        const total = cluster.length;
        const prog = progressStats.weight > 0 ? progressStats.progress / progressStats.weight : total > 0 ? done / total : 0;

        return {
          id: representative.id,
          name: representative.name,
          abbrev: makeAbbrev(representative.name),
          clusterSize: cluster.length,
          clusterItems: cluster.map(c => ({ id: c.id, name: c.name })),
          kind: 'major',
          anchorDate: earliestStart || latestEnd,
          milestoneDate: latestEnd || earliestStart,
          endDate: latestEnd || earliestStart,
          prog,
          done,
          total,
          effort: progressStats.weight || total || 1,
          allDone: total > 0 && cluster.every(item => (nodeMap[item.id] || item).status === 'done'),
          depth: 1,
        };
      });

      const minorStations = [];

      const timeline = [...majorStations].sort(compareByTime);

      // De-duplicate abbreviations within this line
      deduplicateAbbrevs(majorStations);

      const rootLatest = rootInfo.latestEnd || timeline.reduce((max, s) => (!max || s.endDate > max ? s.endDate : max), null);
      const rootEarliest = rootInfo.earliestStart || timeline.reduce((min, s) => (!min || s.anchorDate < min ? s.anchorDate : min), null);
      const rootStats = stats?.[root.id];
      // "At risk" is a forecast — once every scoped leaf is done there is nothing
      // left to miss, so the line drops the red GEFÄHRDET badge (deadlineStatus
      // in utils/timeline.js is the shared state machine).
      const rootState = root.type === 'deadline' ? deadlineStatus(tree, scheduled, root) : null;
      const allDoneUnderRoot =
        root.type !== 'deadline' &&
        (() => {
          const leaves = resolveToLeafIds(tree, root.id)
            .map(id => tree.find(r => r.id === id))
            .filter(Boolean);
          return leaves.length > 0 && leaves.every(l => l.status === 'done');
        })();
      const atRisk =
        root.type === 'deadline'
          ? !!rootState?.isLate
          : !!(root.date && rootStats?._endD && rootStats._endD > new Date(root.date) && !allDoneUnderRoot);

      // A line nobody is working any more: every leaf done, or the project
      // dropped. Both are still ON the map on purpose — a finished project is
      // part of the picture, and a dropped one has to stay visible so the
      // decision can be seen and taken back — but neither competes for
      // attention with work that is live.
      const rootDropped = !!(nodeMap[root.id] || root)?.dropped;
      const rootRetired = rootDropped || allDoneUnderRoot;

      // Duration in days for route-length matching
      const durationDays = rootEarliest && rootLatest ? Math.max(1, (+rootLatest - +rootEarliest) / DAY) : 1;

      return {
        root,
        progress: rootInfo.prog || 0,
        totalEffort: rootInfo.effort || 0,
        atRisk,
        retired: rootRetired,
        dropped: rootDropped,
        allDoneUnderRoot,
        hiddenMinorCount: 0,
        timeline,
        majorStations,
        minorStations,
        earliestDate: rootEarliest,
        latestDate: rootLatest,
        durationDays,
      };
    })
    .filter(line => line.timeline.length > 0 || line.majorStations.length === 0);
  return rawLines;
}
