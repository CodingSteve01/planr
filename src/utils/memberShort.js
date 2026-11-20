// Build unique short-name map for members (initials, with collision suffixes on ALL collisions)
export function buildMemberShortMap(members) {
  const map = {};
  if (!members?.length) return map;
  // Pass 1: compute base initials per member
  const bases = members.map(m => {
    const words = (m.name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words.length === 1
      ? words[0].slice(0, 2).toUpperCase()
      : words
          .map(w => w[0])
          .join('')
          .toUpperCase();
  });
  // Pass 2: count occurrences
  const counts = {};
  bases.forEach(b => {
    counts[b] = (counts[b] || 0) + 1;
  });
  // Pass 3: assign — append index suffix when there's any collision
  const seen = {};
  members.forEach((m, i) => {
    const base = bases[i];
    if (counts[base] === 1) {
      map[m.id] = base;
    } else {
      seen[base] = (seen[base] || 0) + 1;
      map[m.id] = base + seen[base];
    }
  });
  return map;
}
