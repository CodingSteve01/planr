import { parseHistoryBlock } from '../history.js';

// Closing fix-ups 3, 4 and 6: the project meta and the two small fenced blocks
// that are read before the project object is put together.

export function buildMeta(state) {
  const metaObj = { name: state.projName || 'Imported Project', version: '2' };
  if (state.planStart) metaObj.planStart = state.planStart;
  if (state.planEnd) metaObj.planEnd = state.planEnd;
  if (state.viewStartMd) metaObj.viewStart = state.viewStartMd;
  if (state.workDays)
    metaObj.workDays = state.workDays
      .split(',')
      .map(Number)
      .filter(n => n >= 0 && n <= 6);
  return metaObj;
}

// History events — parsed out of the ```planr-history``` fenced block
export function readHistoryEvents(state) {
  let historyEvents = [];
  if (state.historyBlockLines && state.historyBlockLines.length) {
    const blockText = state.historyBlockLines.filter(l => l !== null).join('\n');
    historyEvents = parseHistoryBlock(blockText);
  }
  return historyEvents;
}

// Roadmap assignment — lines like "P1 route=2 color=0" inside the
// ```planr-roadmap fenced block.
export function readRoadmapAssignment(state) {
  let roadmapAssignment = null;
  if (state.roadmapBlockLines && state.roadmapBlockLines.length) {
    const lines = state.roadmapBlockLines.filter(l => l !== null);
    const out = {};
    lines.forEach(line => {
      const m = line.match(/^([\w.]+)\s+route=(\d+)\s+color=(\d+)/);
      if (m) out[m[1]] = { routeIdx: +m[2], colorIdx: +m[3] };
    });
    if (Object.keys(out).length) roadmapAssignment = out;
  }
  return roadmapAssignment;
}
