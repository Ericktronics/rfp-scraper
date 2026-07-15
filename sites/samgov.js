const { http } = require('../lib/http');

const id = 'sam.gov';

// Official U.S. federal contract opportunities API:
// https://open.gsa.gov/api/get-opportunities-public-api/
//
// Needs a free SAM.gov account + API key (sam.gov > your profile > "API
// Keys"). Registering an individual SAM.gov account does NOT require being
// a US entity/vendor, but it does go through login.gov identity
// verification, which in practice requires a US-issued ID - so this source
// stays disabled (throws a clear error) until SAM_GOV_API_KEY is set:
//   SAM_GOV_API_KEY=xxxxx npm run scrape
// Never commit a real key - keep it in your shell env only.
//
// UNVERIFIED: built from SAM.gov's published API docs, not a live
// response (no key was available to test against in this session). The
// endpoint, param names, and especially the opportunitiesData/
// pointOfContact response shape should be sanity-checked against a real
// call the first time this runs with a key, before trusting its output.
const API_URL = 'https://api.sam.gov/opportunities/v2/search';

// Advertising, PR, and marketing-consulting NAICS codes. SAM.gov's ncode
// param takes a comma-separated list. Widen/narrow by editing this list.
// Doubles as the focusArea lookup below, so keep the two in sync.
const NAICS_CODES = ['541810', '541613', '541820', '541830', '541840'];

const NAICS_FOCUS_AREAS = {
  541810: 'Advertising',
  541613: 'Marketing Consulting',
  541820: 'Public Relations',
  541830: 'Media Buying',
  541840: 'Media Representation',
};

function requireApiKey() {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    throw new Error(
      'SAM_GOV_API_KEY is not set. Get a free key at https://sam.gov (profile > API Keys), then run with SAM_GOV_API_KEY=xxxx npm run scrape'
    );
  }
  return apiKey;
}

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function emptyDetails(accessNote) {
  return {
    projectName: null,
    opportunityTitle: null,
    opportunityDescription: null,
    fundingDonor: null,
    budget: null,
    targetLocation: null,
    deadline: null,
    focusArea: null,
    eligibility: null,
    contactPerson: null,
    contactNumber: null,
    contactEmail: null,
    contactRaw: null,
    accessNote,
  };
}

async function scrapeListings() {
  const apiKey = requireApiKey();

  // postedFrom/postedTo are mandatory on this endpoint; look back 30 days
  // for anything newly posted.
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);

  const { data } = await http.get(API_URL, {
    params: {
      api_key: apiKey,
      postedFrom: formatDate(from),
      postedTo: formatDate(to),
      ncode: NAICS_CODES.join(','),
      limit: 100,
    },
  });

  const opportunities = data.opportunitiesData || [];

  return opportunities
    .filter((opp) => opp.noticeId && opp.title)
    .map((opp) => ({
      source: id,
      title: opp.title,
      // Round-trips back to a noticeId in scrapeDetail() below.
      url: `https://sam.gov/opp/${opp.noticeId}/view`,
      location: [opp.placeOfPerformance?.city?.name, opp.placeOfPerformance?.state?.code]
        .filter(Boolean)
        .join(', '),
      agency: [opp.department, opp.subTier, opp.office].filter(Boolean).join(' / '),
      deadline: opp.responseDeadLine || '',
      naicsCode: opp.naicsCode || null,
    }));
}

// SAM.gov publishes full point-of-contact info for free, no login required
// - same tier as philgeps.gov.ph.
async function scrapeDetail(url) {
  const apiKey = requireApiKey();

  const noticeId = url?.match(/\/opp\/([^/]+)\/view/)?.[1];
  if (!noticeId) {
    return emptyDetails(`Could not extract a SAM.gov notice ID from URL: ${url}`);
  }

  const { data } = await http.get(API_URL, { params: { api_key: apiKey, noticeid: noticeId } });
  const opp = (data.opportunitiesData || [])[0];
  if (!opp) {
    return emptyDetails('SAM.gov returned no matching opportunity for this notice ID on re-fetch.');
  }

  const contacts = opp.pointOfContact || [];
  const primary = contacts.find((c) => c.type === 'primary') || contacts[0] || {};

  return {
    projectName: opp.solicitationNumber || opp.title || null,
    opportunityTitle: opp.title || null,
    opportunityDescription: opp.description || null,
    fundingDonor: [opp.department, opp.subTier, opp.office].filter(Boolean).join(' / ') || null,
    budget: null, // not part of this endpoint's response
    targetLocation:
      [opp.placeOfPerformance?.city?.name, opp.placeOfPerformance?.state?.code].filter(Boolean).join(', ') ||
      null,
    deadline: opp.responseDeadLine || null,
    focusArea: NAICS_FOCUS_AREAS[opp.naicsCode] || null,
    // typeOfSetAsideDescription is SAM.gov's own eligibility field (e.g.
    // "Total Small Business Set-Aside", "Service-Disabled Veteran-Owned
    // Small Business Set-Aside") - same UNVERIFIED caveat as the rest of
    // this module applies to the exact field name.
    eligibility: opp.typeOfSetAsideDescription || null,
    contactPerson: primary.fullName || null,
    contactNumber: primary.phone || null,
    contactEmail: primary.email || null,
    contactRaw:
      contacts.map((c) => `${c.fullName || ''} ${c.email || ''} ${c.phone || ''}`.trim()).join(' | ') || null,
    accessNote: null,
  };
}

module.exports = { id, scrapeListings, scrapeDetail };
