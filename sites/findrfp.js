const cheerio = require('cheerio');
const { http } = require('../lib/http');
const { matchesKeywords } = require('../lib/keywords');

const id = 'findrfp.com';

async function scrapeListings() {
  const url = 'https://www.findrfp.com/marketing-contracts/bid.aspx';
  const { data } = await http.get(url);
  const $ = cheerio.load(data);
  const results = [];

  $('table[tabindex="4"] tr').each((i, row) => {
    if (i === 0) return; // header row
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    const link = $(cells[1]).find('a');
    const title = link.text().trim();
    const href = link.attr('href');
    results.push({
      source: id,
      title,
      url: href ? new URL(href, url).toString() : null,
      location: $(cells[2]).text().trim(),
      agency: $(cells[3]).text().trim(),
      deadline: '',
    });
  });

  return results.filter((r) => matchesKeywords(r.title));
}

// findrfp.com is fully paywalled: the detail page is just a subscribe-now
// pitch with no RFP content at all unless you're a paying member.
async function scrapeDetail() {
  return {
    projectName: null,
    opportunityTitle: null,
    opportunityDescription: null,
    fundingDonor: null,
    budget: null,
    targetLocation: null,
    deadline: null,
    contactPerson: null,
    contactNumber: null,
    contactEmail: null,
    contactRaw: null,
    accessNote:
      'findrfp.com shows nothing beyond the title/location without a paid subscription - the detail page is a subscribe-now pitch with no RFP content.',
  };
}

module.exports = { id, scrapeListings, scrapeDetail };
