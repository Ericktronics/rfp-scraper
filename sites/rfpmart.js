const cheerio = require('cheerio');
const { http } = require('../lib/http');
const { matchesKeywords } = require('../lib/keywords');
const { normalizedBlockText, extractLabeledFields, detectFocusAreas } = require('../lib/text');

const id = 'rfpmart.com';

async function scrapeListings() {
  const url = 'https://www.rfpmart.com/marketing-and-branding-rfp-government-contract.html';
  const { data } = await http.get(url);
  const $ = cheerio.load(data);
  const script = $('script[type="application/ld+json"]').first().html();
  if (!script) return [];

  const json = JSON.parse(script);
  const items = (json['@itemListElement'] || []).map((entry) => entry.item);

  const results = items.map((item) => ({
    source: id,
    title: item.name,
    url: item.url,
    location: '',
    agency: '',
    deadline: item.offers ? item.offers.priceValidUntil : '',
  }));

  return results.filter((r) => matchesKeywords(r.title));
}

// Paid aggregator. The scope-of-work / eligibility / submission text is free
// to read, which is genuinely useful for drafting a proposal, but the
// issuing agency's name and any contact person/phone/email are not shown -
// only unlocked by buying the document or subscribing.
//
// The detail page has no per-field markup (everything's a plain <p>), so
// fields can't be selected by class/id. Instead we flatten the whole block
// to text and use extractLabeledFields to slice out the value after each
// label up to the next one - order in this array doesn't matter, it's
// resolved by where each label actually appears on the page.
// Every label is \b-bounded so it can only match a whole word/phrase, never
// a substring - without this, bare /State/i matches inside a product ID
// like "ESTATE-11763" (at the "STATE" in "E|STATE|-11763"), truncating
// everything captured before it. Confirmed live: this was silently
// corrupting projectName/fundingDonor to garbage on that exact listing.
const FIELD_LABELS = [
  ['postedDate', '\\bPosted Date\\b'],
  ['productId', '\\bProduct \\(RFP\\/RFQ\\/RFI\\/Solicitation\\/Tender\\/Bid Etc\\.\\) ID\\b'],
  ['budget', '\\[\\*\\]\\s*Budget\\b'],
  ['scopeOfService', '\\[\\*\\]\\s*Scope of Service\\b'],
  ['eligibility', '\\[\\*\\]\\s*Eligibility\\b'],
  ['workPerformance', '\\[\\*\\]\\s*Work Performance\\b'],
  ['proposalSubmission', '\\[\\*\\]\\s*Proposal Submission\\b'],
  ['expiryDate', '\\bExpiry Date\\b'],
  ['questionDeadline', '\\bQuestion Answer Deadline\\b'],
  ['category', '\\bCategory\\b'],
  ['country', '\\bCountry\\b'],
  ['state', '\\bState\\b'],
  ['costToDownload', '\\bCost to Download This RFP Document\\b'],
];

async function scrapeDetail(url) {
  const { data } = await http.get(url);
  const $ = cheerio.load(data);
  const text = normalizedBlockText($, '.cat-des.p15');
  const fields = extractLabeledFields(text, FIELD_LABELS);

  // The page's one-sentence "Government Authority located in ..." blurb sits
  // between the product ID and the "[*] Budget" label with no label of its
  // own, so extractLabeledFields sweeps it into the productId slice as a
  // second line. Split it back out here rather than teaching the extractor
  // about unlabeled text.
  const productLines = (fields.productId || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const productId = productLines[0] || null;
  const agencyHint = productLines.slice(1).join(' ') || null;

  return {
    projectName: productId,
    opportunityTitle: null, // filled in from the listing entry by the caller
    opportunityDescription: fields.scopeOfService || null,
    fundingDonor: agencyHint,
    budget: fields.budget || null,
    targetLocation: [fields.state, fields.country].filter(Boolean).join(', ') || null,
    deadline: fields.expiryDate || null,
    questionDeadline: fields.questionDeadline || null,
    eligibility: fields.eligibility || null,
    // rfpmart's own Category is a broad site taxonomy (e.g. "Marketing and
    // Branding") - prefer the more specific discipline tags detected in the
    // actual scope of work when any are found, falling back to the site's
    // category otherwise.
    focusArea: detectFocusAreas(fields.scopeOfService) || fields.category || null,
    workPerformance: fields.workPerformance || null,
    proposalSubmission: fields.proposalSubmission || null,
    category: fields.category || null,
    postedDate: fields.postedDate || null,
    costToDownloadUSD: fields.costToDownload || null,
    contactPerson: null,
    contactNumber: null,
    contactEmail: null,
    contactRaw: null,
    accessNote:
      'rfpmart.com does not publish the issuing agency name or any contact person/number/email for free. ' +
      (fields.costToDownload
        ? `The full RFP document ($${fields.costToDownload}) or a paid subscription likely contains the actual contact details.`
        : 'A paid subscription is required to unlock the full RFP document, which likely contains contact details.'),
  };
}

module.exports = { id, scrapeListings, scrapeDetail };
