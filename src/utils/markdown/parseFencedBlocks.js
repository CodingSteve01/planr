// Phase: the fenced planr-* blocks. Each function takes one line of its section
// and collects it between the opening fence and the closing one; the closing
// fence is kept as a null marker. The closing fix-ups read the blocks once the
// whole file has been seen. Every function consumes the line.

// History section: capture lines inside the ```planr-history``` fenced block
export function collectHistoryLine(state, line) {
  const fenceOpen = /^\s*```planr-history\s*$/i.test(line);
  const fenceClose = /^\s*```\s*$/.test(line);
  if (fenceOpen) {
    state.historyBlockLines = [];
    return;
  }
  if (fenceClose && state.historyBlockLines != null) {
    /* end of block; keep array as-is */ state.historyBlockLines.push(null);
    return;
  }
  if (state.historyBlockLines != null && state.historyBlockLines[state.historyBlockLines.length - 1] !== null) {
    state.historyBlockLines.push(line);
  }
  return;
}

// Roadmap-assignment section: same fenced-block pattern as history.
export function collectRoadmapLine(state, line) {
  const fenceOpen = /^\s*```planr-roadmap\s*$/i.test(line);
  const fenceClose = /^\s*```\s*$/.test(line);
  if (fenceOpen) {
    state.roadmapBlockLines = [];
    return;
  }
  if (fenceClose && state.roadmapBlockLines != null) {
    state.roadmapBlockLines.push(null);
    return;
  }
  if (state.roadmapBlockLines != null && state.roadmapBlockLines[state.roadmapBlockLines.length - 1] !== null) {
    state.roadmapBlockLines.push(line);
  }
  return;
}

// Per-person work order: same fenced-block pattern again.
export function collectQueuesLine(state, line) {
  const fenceOpen = /^\s*```planr-queues\s*$/i.test(line);
  const fenceClose = /^\s*```\s*$/.test(line);
  if (fenceOpen) {
    state.queueBlockLines = [];
    return;
  }
  if (fenceClose && state.queueBlockLines != null) {
    state.queueBlockLines.push(null);
    return;
  }
  if (state.queueBlockLines != null && state.queueBlockLines[state.queueBlockLines.length - 1] !== null) {
    state.queueBlockLines.push(line);
  }
  return;
}

export function collectChangesLine(state, line) {
  const fenceOpen = /^\s*```planr-changes\s*$/i.test(line);
  const fenceClose = /^\s*```\s*$/.test(line);
  if (fenceOpen) {
    state.changeBlockLines = [];
    return;
  }
  if (fenceClose && state.changeBlockLines != null) {
    state.changeBlockLines.push(null);
    return;
  }
  if (state.changeBlockLines != null && state.changeBlockLines[state.changeBlockLines.length - 1] !== null)
    state.changeBlockLines.push(line);
  return;
}

// Scenarios: one JSON line each inside ```planr-scenarios (utils/scenario.js).
export function collectScenariosLine(state, line) {
  const fenceOpen = /^\s*```planr-scenarios\s*$/i.test(line);
  const fenceClose = /^\s*```\s*$/.test(line);
  if (fenceOpen) {
    state.scenarioBlockLines = [];
    return;
  }
  if (fenceClose && state.scenarioBlockLines != null) {
    state.scenarioBlockLines.push(null);
    return;
  }
  if (state.scenarioBlockLines != null && state.scenarioBlockLines[state.scenarioBlockLines.length - 1] !== null) {
    state.scenarioBlockLines.push(line);
  }
  return;
}

export function collectLogLine(state, line) {
  if (/^\s*```planr-log\s*$/i.test(line)) {
    state.logBlockLines = [];
    return;
  }
  if (/^\s*```\s*$/.test(line) && state.logBlockLines != null) {
    state.logBlockLines.push(null);
    return;
  }
  if (state.logBlockLines != null && state.logBlockLines[state.logBlockLines.length - 1] !== null) state.logBlockLines.push(line);
  return;
}
