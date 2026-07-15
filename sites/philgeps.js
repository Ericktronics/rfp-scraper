const cheerio = require('cheerio');
const { http } = require('../lib/http');
const { matchesKeywords } = require('../lib/keywords');
const { textOf, normalizedBlockText, PHONE_RE, EMAIL_RE, detectFocusAreas } = require('../lib/text');

const id = 'philgeps.gov.ph';

// The abstract's eligibility-relevant text isn't a dedicated field and its
// surrounding structure varies by agency/template (confirmed against two
// real, differently-formatted listings), so instead of trying to isolate
// "the eligibility paragraph" positionally, we scan for phrases that
// reliably introduce genuine per-listing bidder criteria and keep whatever
// clause follows each one, up to the next period. A generic RA 9184
// boilerplate paragraph ("All particulars relative to Eligibility
// Statement... shall be governed by the pertinent provisions of R.A. 9184
// and its IRR") is stripped first since it's identical across nearly every
// listing and carries no listing-specific information.
const PHILGEPS_BOILERPLATE_RE =
  /all particulars relative to eligibility statement[\s\S]*?pertinent provisions of r\.?a\.?\s*9184[^.]*\./i;

// A "sentence end" is a period followed by whitespace and then either an
// uppercase letter, a new numbered item like "4)", or end of string. Plain
// "[^.]*\." stops at the FIRST period no matter what, which breaks on
// abbreviations like "RA No. 5183." - it would cut the match off right
// after "No." and silently drop "5183" entirely. Confirmed live: this was
// the actual bug on the SBMA listing below before this fix.
const SENTENCE_END = String.raw`[\s\S]*?\.(?=\s+(?:[A-Z]|\d+\)|$))`;

const PHILGEPS_ELIGIBILITY_MARKERS = [
  new RegExp(String.raw`identified bidder has experienced?${SENTENCE_END}`, 'i'),
  new RegExp(String.raw`bidders?\s+(?:should|must)\s+have\s+completed${SENTENCE_END}`, 'i'),
  new RegExp(String.raw`bidding is restricted to${SENTENCE_END}`, 'i'),
  new RegExp(String.raw`description of an eligible bidder${SENTENCE_END}`, 'i'),
];

// Line breaks in PhilGEPS's abstract are often just word-wrap (a single
// numbered item can span a dozen short lines), not paragraph boundaries -
// reflowing to one line before matching avoids splitting a marker phrase
// across two array entries.
function extractPhilgepsEligibility(descriptionLines) {
  if (!descriptionLines.length) return null;
  const flat = descriptionLines.join(' ').replace(PHILGEPS_BOILERPLATE_RE, ' ').replace(/\s+/g, ' ');

  const matches = PHILGEPS_ELIGIBILITY_MARKERS.map((re) => flat.match(re))
    .filter(Boolean)
    // Sort by where each match actually appears in the text, not by the
    // order markers happen to be listed above - otherwise a later-in-text
    // clause (e.g. "restricted to...") could get joined before an
    // earlier one (e.g. "description of an eligible bidder..."),
    // producing an order that doesn't match the source.
    .sort((a, b) => a.index - b.index)
    .map((m) => m[0].trim());

  return matches.length ? matches.join(' ') : null;
}

async function scrapeListings(keyword = 'marketing') {
  const baseUrl =
    'https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/SplashOpportunitiesSearchUI.aspx?menuIndex=3&ClickFrom=OpenOpp&DirectFrom=OpenOpp&SearchDirectFrom=SearchOpenOpp';

  // Step 1: load the search form to get a session cookie + ASP.NET viewstate.
  const initial = await http.get(baseUrl);
  const cookies = (initial.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const $form = cheerio.load(initial.data);

  const formData = new URLSearchParams({
    __VIEWSTATE: $form('#__VIEWSTATE').val() || '',
    __VIEWSTATEGENERATOR: $form('#__VIEWSTATEGENERATOR').val() || '',
    __EVENTVALIDATION: $form('#__EVENTVALIDATION').val() || '',
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    txtKeyword: keyword,
    btnSearch: 'Search',
  });

  // Step 2: submit the search as a POST, replaying the session cookie.
  const searchRes = await http.post(baseUrl, formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
      Referer: baseUrl,
    },
  });

  const $ = cheerio.load(searchRes.data);
  const results = [];

  $('tr.GridItem, tr.GridAltItem').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    const link = $(cells[3]).find('a[id*="hyLinkTitle"]');
    const title = link.text().trim();
    const href = link.attr('href');
    const orgAndCat = $(cells[3]).find('span[id*="lblOrgAndBusCat"]').text().trim();

    results.push({
      source: id,
      title,
      url: href ? new URL(href, baseUrl).toString() : null,
      deadline: $(cells[2]).text().trim(), // closing date
      location: $(cells[1]).text().trim(), // publish date (PhilGEPS doesn't expose location here)
      agency: orgAndCat,
    });
  });

  // Already keyword-searched server-side; re-checking the title guards
  // against PhilGEPS matching the keyword only in agency/category text.
  return results.filter((r) => matchesKeywords(r.title));
}

// Public government procurement portal - full contact details are published
// for anyone to read, no login required.
async function scrapeDetail(url) {
  const { data } = await http.get(url);
  const $ = cheerio.load(data);

  // PhilGEPS crams name, position, full address, phone(s) and email into one
  // <br>-separated blob with no separate fields per piece of data, and the
  // line order/count varies per listing (a title line isn't always present).
  // Pulling phone/email out by pattern is more reliable than trying to
  // guess a fixed line position for each.
  const contactLines = normalizedBlockText($, '#lblDisplayContactPerson').split('\n').filter(Boolean);
  const contactRaw = contactLines.join(' | ') || null;
  const phoneMatch = contactRaw ? contactRaw.match(PHONE_RE) : null;
  const emailMatch = contactRaw ? contactRaw.match(EMAIL_RE) : null;

  const descriptionLines = normalizedBlockText($, '#lblAbstractText').split('\n').filter(Boolean);
  const description = descriptionLines.join('\n') || null;
  const projectNameLine = descriptionLines.find((l) => /^project name\s*:/i.test(l));
  const projectName = projectNameLine
    ? projectNameLine.replace(/^project name\s*:\s*/i, '').trim()
    : textOf($, '#lblDisplayTitle') || null;

  // The currency label sits in its own unnamed span next to the amount
  // (id="Label34" in the markup) rather than a stable named field, and
  // PhilGEPS's Approved Budget for the Contract is always quoted in PHP -
  // so it's simpler and just as reliable to hardcode the prefix.
  const budgetValue = textOf($, '#lblDisplayBudget');

  // Pre-bid Conference is conditionally rendered - only present on listings
  // that actually have one scheduled, so these are often empty.
  const preBidDate = textOf($, '#lblPreBidDate');
  const preBidTime = textOf($, '#lblPreBidTime');
  const preBidVenue = textOf($, '#lblPreBidVenue');

  return {
    projectName,
    opportunityTitle: textOf($, '#lblDisplayTitle') || null,
    opportunityDescription: description,
    fundingDonor: textOf($, '#lblDisplayProcuringEntity') || null,
    budget: budgetValue ? `PHP ${budgetValue}` : null,
    targetLocation: textOf($, '#lblDisplayAOD') || null,
    deadline: textOf($, '#lblDisplayCloseDateTime') || null,
    datePublished: textOf($, '#lblDisplayDatePublish') || null,
    procurementMode: textOf($, '#lblDisplayProcureMode') || null,
    // lblDisplayCategory is PhilGEPS's own procurement category (Goods,
    // Consulting Services, Vehicles, ...) - says nothing about the kind of
    // marketing work involved, so it's not a substitute for focusArea.
    category: textOf($, '#lblDisplayCategory') || null,
    focusArea: detectFocusAreas(`${textOf($, '#lblDisplayTitle')} ${description || ''}`) || null,
    // Best-effort marker-based extraction (see extractPhilgepsEligibility
    // above) - many listings (especially small Negotiated Procurement /
    // RFQ ones) simply don't state any bidder-eligibility criteria at all,
    // in which case this is null, same as before.
    eligibility: extractPhilgepsEligibility(descriptionLines),
    solicitationNumber: textOf($, '#lblDisplaySolNumber') || null,
    classification: textOf($, '#lblDisplayClass') || null,
    deliveryPeriod: textOf($, '#lblDisplayPeriod') || null,
    clientAgency: textOf($, '#lblDisplayClient') || null,
    preBidConference: preBidDate ? { date: preBidDate, time: preBidTime || null, venue: preBidVenue || null } : null,
    remarks: textOf($, '#lblReason') || null,
    contactPerson: contactLines[0] || null,
    contactNumber: phoneMatch ? phoneMatch[0].trim() : null,
    contactEmail: emailMatch ? emailMatch[0] : null,
    contactRaw,
    accessNote: null,
  };
}

module.exports = { id, scrapeListings, scrapeDetail };
