// Pure filter/rank logic for the `/` command palette. No React, no DOM —
// CommandPalette.jsx resolves each command's `labelKey` to a `label` string
// via useT() and hands the resolved array in here.
//
// Matching: an empty query returns everything, in the given order. A
// non-empty query first tries a plain substring match (ranked by how early
// it appears — an earlier hit ranks higher), then falls back to an
// in-order subsequence match ("fuzzy": every query character must appear in
// the label in order, not necessarily adjacent) so "expt" still finds
// "Export…". Substring matches always outrank fuzzy-only matches.
//
// A command may also carry `keywords`: a second, invisible set of names for
// the word you actually reach for. "Urlaub eintragen…" is what the command
// says in German, and somebody thinking in English types "vacation"; a job
// whose label is a sentence ("Take somebody on…") is one noun in your head
// ("onboard"). Keywords rank below every label match, so they never push a
// real hit down — they only stop the palette coming up empty.
export function filterCommands(commands, query) {
  const list = commands || [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return list;

  const scored = [];
  for (const cmd of list) {
    // `keywords` lets a command keep a label that says what it does while
    // staying findable by the word people actually type for it — you look for
    // "backdate", not for "work as of an earlier date".
    const label = String(cmd.label ?? cmd.labelKey ?? cmd.id ?? '');
    const l = (label + ' ' + (cmd.keywords || []).join(' ')).toLowerCase();
    const subIdx = l.indexOf(q);
    if (subIdx !== -1) {
      // Substring hit: rank by earliness, tie-broken by shorter label.
      scored.push({ cmd, tier: 0, key: subIdx * 10000 + label.length });
      continue;
    }
    let qi = 0;
    for (let i = 0; i < l.length && qi < q.length; i++) {
      if (l[i] === q[qi]) qi++;
    }
    if (qi === q.length) {
      scored.push({ cmd, tier: 1, key: label.length });
      continue;
    }
    const hit = (cmd.keywords || []).find(k => String(k).toLowerCase().includes(q));
    if (hit) scored.push({ cmd, tier: 2, key: l.length });
  }
  scored.sort((a, b) => (a.tier - b.tier) || (a.key - b.key));
  return scored.map(s => s.cmd);
}
