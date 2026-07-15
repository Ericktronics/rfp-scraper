const cheerio = require('cheerio');
const { http } = require('../lib/http');
const { detectFocusAreas } = require('../lib/text');

const id = 'odwyerpr.com';

// odwyerpr.com declares charset=iso-8859-1, but - like virtually all legacy
// web content labeled that way - it's actually windows-1252: true
// ISO-8859-1 leaves bytes 0x80-0x9F as unprintable control codes, while
// windows-1252 maps that range to printable characters (curly quotes,
// em-dashes, ellipsis) that show up constantly in prose. Browsers already
// treat an "iso-8859-1" label as windows-1252 for this reason (WHATWG
// Encoding Standard); axios's default UTF-8 decoding does neither and
// mangles non-ASCII bytes into "�". Node has no built-in windows-1252
// decoder, so: decode as latin1 (matches byte-for-byte up to 0x7F), then
// remap the one range where the two encodings actually differ.
const CP1252_C1_OVERRIDES = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
};

async function getLatin1(url) {
  const { data } = await http.get(url, { responseType: 'arraybuffer' });
  const raw = Buffer.from(data).toString('latin1');
  return raw.replace(/[\x80-\x9f]/g, (c) => CP1252_C1_OVERRIDES[c.charCodeAt(0)] || c);
}

// O'Dwyer's is a PR trade publication that curates this listing page itself
// - every entry here is already a PR/marketing/comms opportunity by
// definition. Unlike the other sources, listings are NOT run through the
// shared keyword filter: titles are creative one-liners (e.g. "DFW's
// EpicCentral Seeks Marcom Support") that often don't contain any of our
// literal keywords, so filtering would incorrectly drop real matches.
async function scrapeListings() {
  const url = 'https://www.odwyerpr.com/rfps/index.html';
  const $ = cheerio.load(await getLatin1(url));
  const results = [];

  // Only the direct text of a cell, skipping any nested element (used below
  // to pull the desktop value out of cells that also carry a hidden
  // mobile-only sub-label in a nested <div>).
  const directText = (el) =>
    $(el)
      .contents()
      .filter((_, node) => node.type === 'text')
      .text()
      .trim();

  $('tr').each((_, row) => {
    // Each listing row repeats every column twice: a "mixed" cell that also
    // carries a mobile-only nested <div> for narrow screens, followed by a
    // clean "data-hide-mobile" cell with just the desktop value. We read
    // the clean cells directly and pull direct text (not the nested div's
    // text) from the mixed ones. A row that doesn't have all 6 is some
    // other row on the page (header, spacer), not a listing.
    const cells = $(row).find('td.rfps-list-tablecell');
    if (cells.length < 6) return;

    const titleLink = $(cells[1]).find('a').first();
    const title = titleLink.text().trim();
    const href = titleLink.attr('href');
    if (!title || !href) return;

    results.push({
      source: id,
      title,
      url: new URL(href, url).toString(),
      location: $(cells[3]).text().trim(),
      agency: '',
      deadline: $(cells[5]).text().trim(),
      category: directText(cells[2]),
      postedDate: directText(cells[4]),
    });
  });

  return results;
}

// O'Dwyer's stories consistently open by naming the hiring organization
// before a verb like "is seeking"/"wants"/"issues", either directly or
// after a comma-led appositive clause ("Kent County, which is on
// Maryland's Eastern Shore, is looking for..."). Matched against all 14
// live descriptions at the time this was written with zero misses - but
// it's still a heuristic on free-form prose, not a structured field, so a
// non-match (or a boundary appearing implausibly early/late) returns null
// rather than guessing.
const AGENCY_BOUNDARY =
  /,\s*(?:which|a|the)\s|\bis\s+(?:looking for|seeking|searching for|creating)\b|\bwants(?:\s+to)?\b|\bseeks\b|\bissues\b|\bhas\s+issued\b/i;

function extractAgencyName(description) {
  if (!description) return null;
  const match = description.match(AGENCY_BOUNDARY);
  if (!match || match.index < 2) return null;
  const candidate = description.slice(0, match.index).trim();
  return candidate.length >= 2 && candidate.length <= 80 ? candidate : null;
}

// The listing's own story page has a real, un-gated description, but the
// actual RFP document/link ("See RFP") sits behind O'Dwyer's paid
// subscription, so no contact info is available for free here either.
async function scrapeDetail(url) {
  const $ = cheerio.load(await getLatin1(url));

  // Prefer the actual published article paragraph over the SEO meta tag:
  // the meta tag is occasionally broken/truncated by their CMS (confirmed
  // live on a DoD listing - "The Department of Defense Defense has issued
  // a" cuts off mid-sentence with a duplicated word) while the body text is
  // the real, complete, human-facing content. Meta is only a fallback for
  // if the body selector ever fails to match (e.g. a layout change).
  const description =
    $('.article-body p').first().text().replace(/\s+/g, ' ').trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    null;

  const secondaryCategories = $('p.story-bottom-links')
    .filter((_, el) => /Secondary Categories:/i.test($(el).text()))
    .find('a')
    .map((_, el) => $(el).text().trim())
    .get()
    .join(', ');

  return {
    projectName: $('h1, h2').first().text().trim() || null,
    opportunityTitle: null, // filled in from the listing entry by the caller
    opportunityDescription: description,
    fundingDonor: extractAgencyName(description),
    budget: null,
    targetLocation: null,
    deadline: null,
    category: secondaryCategories || null,
    focusArea: secondaryCategories || detectFocusAreas(description),
    // No dedicated eligibility field - the free story is a short news
    // blurb about the RFP, not the solicitation itself, so it doesn't
    // carry formal bidder-eligibility criteria (that would be in the
    // gated document).
    eligibility: null,
    contactPerson: null,
    contactNumber: null,
    contactEmail: null,
    contactRaw: null,
    accessNote:
      "odwyerpr.com gates the actual RFP document/link behind a paid subscription (\"Join O'Dwyer's & Get RFP Access\") - it never publishes a client contact person, number, or email even to subscribers; you'd need to follow up with the issuing organization directly.",
  };
}

module.exports = { id, scrapeListings, scrapeDetail };
