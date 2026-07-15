function textOf($, sel) {
  return $(sel).first().text().replace(/\s+/g, ' ').trim();
}

// Turns an element's inner HTML into clean, line-broken text: <br>/</p>
// become newlines, all other tags are stripped, entities are decoded, and
// blank/whitespace-only lines are dropped.
function normalizedBlockText($, sel) {
  let html = $(sel).first().html() || '';
  html = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&bull;/gi, '-')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ');
  return html
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

const PHONE_RE = /(\+?\d[\d\-\s().]{6,}\d)/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

// Scans `text` for each `[key, labelPattern]` in `labels`, in whatever order
// they actually appear, and slices out the text between one label and the
// next as that label's value. Labels not found are simply omitted.
//
// IMPORTANT: bound each labelPattern with \b (or otherwise anchor it) - an
// unbounded word like "State" will match mid-word inside unrelated text
// (e.g. inside a product ID like "ESTATE-11763"), silently truncating
// whatever came before that false match.
function extractLabeledFields(text, labels) {
  const positions = [];
  for (const [key, pattern] of labels) {
    const match = text.match(new RegExp(pattern, 'i'));
    if (match) positions.push({ key, index: match.index, end: match.index + match[0].length });
  }
  positions.sort((a, b) => a.index - b.index);

  const result = {};
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].end;
    const end = i + 1 < positions.length ? positions[i + 1].index : text.length;
    // Leading whitespace can precede the ':' (e.g. "State :  \nIllinois"), so
    // trim before stripping the colon, then trim again.
    result[positions[i].key] = text.slice(start, end).trim().replace(/^:\s*/, '').trim();
  }
  return result;
}

// Marketing/PR/comms disciplines to tag an RFP with, distinct from a
// site's own generic procurement category (e.g. philgeps' "Consulting
// Services" or "Goods" says nothing about what kind of marketing work is
// needed - this does). [label, matchPattern] - short/ambiguous words like
// "SEO" are \b-bounded so they only match as a whole word (see
// extractLabeledFields' comment above for why that matters); longer
// phrases are unambiguous enough as plain substrings.
const FOCUS_AREA_TAGS = [
  ['Branding', 'branding'],
  ['Advertising', 'advertising'],
  ['Public Relations', 'public relations'],
  ['Social Media', 'social media'],
  ['Digital Media', 'digital media'],
  ['Digital Marketing', 'digital marketing'],
  ['Market Research', 'market research'],
  ['Graphic Design', 'graphic design'],
  ['Media Buying', 'media buying'],
  ['Media Relations', 'media relations'],
  ['Event Marketing', 'event (?:marketing|planning)'],
  ['Content Marketing', 'content (?:marketing|creation)'],
  ['Web Development', 'web development'],
  ['SEO', '\\bseo\\b'],
  ['Email Marketing', 'email marketing'],
  ['Video Production', 'video production'],
  ['Strategic Communications', 'strategic communications'],
  ['Crisis Communications', 'crisis communications'],
  ['Community Engagement', 'community engagement'],
  ['Public Engagement', 'public engagement'],
  ['Promotional', 'promotional'],
];

// Best-effort, transparent tagging: returns the comma-joined labels whose
// pattern literally appears in `text`, or null if none do. Never guesses -
// a source with genuinely richer category data of its own (rfpdb's schema
// categories, odwyerpr's secondary categories) should prefer that over
// this and only fall back here.
function detectFocusAreas(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const matched = FOCUS_AREA_TAGS.filter(([, pattern]) => new RegExp(pattern, 'i').test(lower)).map(
    ([label]) => label
  );
  return matched.length ? matched.join(', ') : null;
}

module.exports = {
  textOf,
  normalizedBlockText,
  PHONE_RE,
  EMAIL_RE,
  extractLabeledFields,
  detectFocusAreas,
};
