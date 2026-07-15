// Terms used to confirm a listing is actually marketing-related.
// Widen/narrow the filter by editing this list.
const KEYWORDS = [
  'marketing',
  'branding',
  'advertising',
  'promotion',
  'promotional',
  'public relations',
  'social media',
  'digital media',
];

// Short acronyms are only safe to match as a whole word - matching "pr" as a
// plain substring would false-positive on "procurement", "project",
// "provide", "print", etc.
const WORD_BOUNDARY_KEYWORDS = ['pr'];

function matchesKeywords(text) {
  const lower = (text || '').toLowerCase();
  if (KEYWORDS.some((k) => lower.includes(k))) return true;
  return WORD_BOUNDARY_KEYWORDS.some((k) => new RegExp(`\\b${k}\\b`, 'i').test(lower));
}

module.exports = { KEYWORDS, WORD_BOUNDARY_KEYWORDS, matchesKeywords };
