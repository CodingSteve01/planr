// Closing fix-up 5: the per-person work order, resolved against the ids this
// load has just handed out. Returns the queues or null.
export function readPersonQueues(state, teamsArr, teamLookup, memberIdByShort) {
  const { tree, mems } = state;
  // v2 names the owner as the
  // file names everybody — "@SL | B.1 A.1", "#Backend | C.2 C.1" — and it is
  // resolved here against the ids this load has just handed out. A line
  // without " | " is v1, "M1 B.1 A.1": the id as it was in memory. In both
  // forms an owner this plan does not have is dropped — a queue for nobody
  // orders nothing. For v1 that is every person's line: their ids are new
  // with this load. A v1 TEAM line does not say which team it means either:
  // team ids are handed out in the order teams first appear in the tree, so
  // `team:T1` is whichever team that is today. What does say it is the queue
  // itself — an order of one team's work. So the line goes to the team that
  // more than half of the tasks it names sit with, and is dropped when no
  // team has that majority.
  let personQueues = null;
  if (state.queueBlockLines && state.queueBlockLines.length) {
    const out = {};
    const queueOwners = new Set([...mems.map(m => m.id), ...teamsArr.map(tm => `team:${tm.id}`)]);
    const treeById = new Map(tree.map(n => [n.id, n]));
    state.queueBlockLines
      .filter(l => l !== null)
      .forEach(line => {
        const cut = line.indexOf(' | ');
        if (cut >= 0) {
          const owner = line.slice(0, cut).trim();
          const ids = line
            .slice(cut + 3)
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          if (ids.length < 2) return;
          const key = owner.startsWith('@')
            ? memberIdByShort.get(owner.slice(1))
            : owner.startsWith('#')
              ? teamLookup[owner.slice(1)]
                ? `team:${teamLookup[owner.slice(1)]}`
                : null
              : null;
          if (key) out[key] = ids;
          return;
        }
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3 || parts[0] === 'v1' || parts[0] === 'v2') return;
        const owner = parts[0],
          ids = parts.slice(1);
        if (owner.startsWith('team:')) {
          const count = new Map();
          let known = 0;
          ids.forEach(id => {
            const n = treeById.get(id);
            if (!n) return;
            known++;
            if (n.team) count.set(n.team, (count.get(n.team) || 0) + 1);
          });
          const [teamId, votes] = [...count.entries()].sort((a, b) => b[1] - a[1])[0] || [];
          if (teamId && votes * 2 > known && queueOwners.has(`team:${teamId}`)) out[`team:${teamId}`] = ids;
          return;
        }
        if (queueOwners.has(owner)) out[owner] = ids;
      });
    if (Object.keys(out).length) personQueues = out;
  }
  return personQueues;
}
