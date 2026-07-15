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

module.exports = { textOf, normalizedBlockText, PHONE_RE, EMAIL_RE, extractLabeledFields };
