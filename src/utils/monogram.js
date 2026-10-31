/**
 * Generates an authentic 2-letter monogram for organizations when no logo is uploaded.
 * Examples:
 *   Microsoft -> MC
 *   BCG -> BG
 *   Infosys -> IN
 *   TCS -> TS
 *   PotentPolicy Demo Institute -> PO
 */
export function getOrgMonogram(name) {
  if (!name || typeof name !== 'string') return 'PP';
  const clean = name.trim();
  if (!clean) return 'PP';

  const lower = clean.toLowerCase();

  // Explicit user-specified mappings
  if (lower.startsWith('microsoft')) return 'MC';
  if (lower === 'bcg' || lower.startsWith('boston consulting')) return 'BG';
  if (lower.startsWith('infosys')) return 'IN';
  if (lower === 'tcs' || lower.startsWith('tata consultancy')) return 'TS';

  // Words breakdown
  const words = clean.split(/\s+/).filter(Boolean);

  // If exact 3-4 letter uppercase acronym (e.g. BCG, TCS, IBM)
  if (words.length === 1 && /^[A-Z]{3,4}$/.test(words[0])) {
    const w = words[0];
    return (w[0] + w[w.length - 1]).toUpperCase();
  }

  // Filter out institutional stop words to identify the primary brand keyword
  const stopWords = new Set([
    'demo', 'institute', 'institution', 'company', 'ltd', 'limited', 'inc',
    'corporation', 'corp', 'llc', 'university', 'college', 'group', 'the',
    'of', '&', 'and', 'global', 'international', 'services', 'solutions'
  ]);

  const meaningful = words.filter(w => !stopWords.has(w.toLowerCase()));
  const primaryList = meaningful.length > 0 ? meaningful : words;

  // If 2 or more distinct core words (e.g. "Alpha Beta")
  if (primaryList.length >= 2) {
    return (primaryList[0][0] + primaryList[1][0]).toUpperCase();
  }

  // If 1 primary word (e.g. "PotentPolicy", "Infosys")
  const single = primaryList[0];
  if (/^[A-Z]{3,}$/.test(single)) {
    return (single[0] + single[single.length - 1]).toUpperCase();
  }

  if (single.length >= 2) {
    return single.slice(0, 2).toUpperCase();
  }

  return clean.slice(0, 2).toUpperCase();
}

