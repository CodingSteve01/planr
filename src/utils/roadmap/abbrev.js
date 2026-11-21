/**
 * Generate a short abbreviation for a station name (up to 3 chars).
 * Takes first letter of each word; falls back to first 2 chars.
 */
function makeAbbrev(name) {
  if (!name) return '?';
  // Strip parenthetical content, leading articles/prefixes, technical noise
  const clean = name
    .replace(/\(.*?\)/g, '')
    .replace(/\b(Ursache|Erstellung|Anpassung|Entwicklung|Umstellung|Integration|Domain|UI\s+Migration)\b:?\s*/gi, '')
    .trim();
  // Keep only words starting with a letter (drop arrows, symbols, numerals-only)
  const words = (clean || name)
    .trim()
    .split(/\s+/)
    .filter(w => /^[A-Za-zÄÖÜäöüß]/.test(w));
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map(w => w[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 3);
  }
  return (words[0] || name)
    .replace(/[^A-Za-zÄÖÜäöüß0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
}

/**
 * Ensure abbreviations are unique within a line by appending numeric suffixes.
 */
function deduplicateAbbrevs(stations) {
  const counts = {};
  stations.forEach(st => {
    counts[st.abbrev] = (counts[st.abbrev] || 0) + 1;
  });
  const seen = {};
  stations.forEach(st => {
    if (counts[st.abbrev] > 1) {
      seen[st.abbrev] = (seen[st.abbrev] || 0) + 1;
      st.abbrev = st.abbrev + seen[st.abbrev];
    }
  });
}

export { makeAbbrev, deduplicateAbbrevs };
