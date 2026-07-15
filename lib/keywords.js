// Terms used to confirm a listing is actually marketing-related.
// Widen/narrow the filter by editing this list.
const KEYWORDS = ['marketing', 'branding', 'advertising', 'promotion', 'promotional', 'public relations'];

function matchesKeywords(text) {
  const lower = (text || '').toLowerCase();
  return KEYWORDS.some((k) => lower.includes(k));
}

module.exports = { KEYWORDS, matchesKeywords };
