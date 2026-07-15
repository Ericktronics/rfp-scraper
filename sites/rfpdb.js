const cheerio = require('cheerio');
const { http, rfpdbAgent } = require('../lib/http');
const { matchesKeywords } = require('../lib/keywords');
const { textOf, detectFocusAreas } = require('../lib/text');

const id = 'rfpdb.com';

async function scrapeListings() {
  // rfpdb.com's homepage doesn't list RFPs directly; its "marketing"
  // category page does, using schema.org microdata.
  const url = 'https://www.rfpdb.com/view/category/name/marketing';
  const { data } = await http.get(url, { httpsAgent: rfpdbAgent });
  const $ = cheerio.load(data);
  const results = [];

  $('li[itemtype="http://schema.org/CreativeWork/RequestForProposal"]').each((i, el) => {
    const $el = $(el);
    const titleLink = $el.find('h3 a');
    const title = titleLink.find('[itemprop="name"]').text().trim() || titleLink.text().trim();
    const href = titleLink.attr('href');
    const description = $el.find('[itemprop="description"]').text().trim();
    const deadline =
      $el.find('time[itemprop="endDate"]').attr('datetime') || $el.find('time').text().trim();
    const location = $el.find('.location').text().replace(/\s+/g, ' ').trim();
    const categories = $el
      .find('.categories li')
      .map((_, li) => $(li).text().trim())
      .get()
      .join(', ');

    results.push({
      source: id,
      title,
      url: href ? new URL(href, url).toString() : null,
      location,
      agency: '',
      deadline,
      categories,
      description,
    });
  });

  return results.filter((r) => matchesKeywords(`${r.title} ${r.description} ${r.categories}`));
}

// Paid aggregator. The visible description is intentionally redacted (words
// masked with asterisks) for non-members, and contact info requires a
// login. BUT the page's SEO <meta name="description"> tag is generated from
// the original, unredacted text (truncated to ~160 characters) - it's
// public markup served to every visitor/crawler, not a bypass of any access
// control, and it often reveals the actual agency name the body hides.
async function scrapeDetail(url) {
  const { data } = await http.get(url, { httpsAgent: rfpdbAgent });
  const $ = cheerio.load(data);

  const bodyDescription = textOf($, 'p#content[itemprop="description"]') || null;
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  const isRedacted = /\*{2,}/.test(bodyDescription || '');
  const usedMeta = Boolean(isRedacted && metaDescription);
  const description = usedMeta ? metaDescription : bodyDescription;

  // Meta descriptions here tend to open with the agency's name, e.g.
  // "The X is seeking..." or "X is pleased to release...". Only matches
  // these common openings - anything else is left null rather than guessed.
  const agencyMatch = usedMeta
    ? metaDescription.match(/^(?:The\s+)?(.+?)\s+(?:is|are)\s+(?:seeking|pleased|soliciting|requesting)\b/i)
    : null;

  // rfpdb's own tags (Branding, Graphic Design, Advertising, Public
  // Relations, Web Development, ...) are already specific marketing
  // disciplines, unlike e.g. philgeps' generic procurement category - use
  // them as focusArea directly rather than re-deriving from the (often
  // truncated-to-160-chars) description.
  const categoryTags = $('ul.categories li').map((_, el) => $(el).text().trim()).get().join(', ') || null;

  return {
    projectName: textOf($, 'h1[itemprop="name"]') || null,
    opportunityTitle: textOf($, 'h1[itemprop="name"]') || null,
    opportunityDescription: description,
    fundingDonor: agencyMatch ? agencyMatch[1].trim() : null,
    budget: null,
    targetLocation: textOf($, '[itemprop="location"]') || null,
    deadline: textOf($, 'time[itemprop="endDate"]') || null,
    category: categoryTags,
    focusArea: categoryTags || detectFocusAreas(description),
    // No dedicated eligibility field, and the description is either
    // redacted or truncated to ~160 chars, nowhere near deep enough to
    // reliably reach any bidder-eligibility criteria.
    eligibility: null,
    contactPerson: null,
    contactNumber: null,
    contactEmail: null,
    contactRaw: null,
    accessNote:
      (usedMeta
        ? "Body description is redacted for non-members; the description above was recovered from the page's public SEO meta tag instead, so it's likely truncated to ~160 characters. "
        : isRedacted
          ? 'Description is partially redacted for non-members. '
          : '') +
      'rfpdb.com requires a free account login to see full RFP details, including any contact person or number.',
  };
}

module.exports = { id, scrapeListings, scrapeDetail };
