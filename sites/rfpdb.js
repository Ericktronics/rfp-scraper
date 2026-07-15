const cheerio = require('cheerio');
const { http, rfpdbAgent } = require('../lib/http');
const { matchesKeywords } = require('../lib/keywords');
const { textOf } = require('../lib/text');

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

// Paid aggregator. The description is intentionally redacted (words masked
// with asterisks) for non-members, and contact info requires a login.
async function scrapeDetail(url) {
  const { data } = await http.get(url, { httpsAgent: rfpdbAgent });
  const $ = cheerio.load(data);

  const description = textOf($, 'p#content[itemprop="description"]') || null;
  const isRedacted = /\*{2,}/.test(description || '');

  return {
    projectName: textOf($, 'h1[itemprop="name"]') || null,
    opportunityTitle: textOf($, 'h1[itemprop="name"]') || null,
    opportunityDescription: description,
    fundingDonor: null,
    budget: null,
    targetLocation: textOf($, '[itemprop="location"]') || null,
    deadline: textOf($, 'time[itemprop="endDate"]') || null,
    category: $('ul.categories li').map((_, el) => $(el).text().trim()).get().join(', ') || null,
    contactPerson: null,
    contactNumber: null,
    contactEmail: null,
    contactRaw: null,
    accessNote:
      (isRedacted ? 'Description is partially redacted for non-members. ' : '') +
      'rfpdb.com requires a free account login to see full RFP details, including any contact person or number.',
  };
}

module.exports = { id, scrapeListings, scrapeDetail };
