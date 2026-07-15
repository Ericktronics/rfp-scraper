# rfp-scraper

Scrapes marketing-related RFPs (Request for Proposals) from several sources, then
deep-dives each listing to pull out the details useful for writing a
proposal: contact person, contact number, funding donor/agency, budget,
scope of work, and deadlines.

## Sources

| Source | Listings | Contact info |
| --- | --- | --- |
| [philgeps.gov.ph](https://notices.philgeps.gov.ph) | Philippine government procurement portal | Free & public - name, position, phone, email |
| [sam.gov](https://sam.gov) | US federal contract opportunities (official API) | Free & public, but disabled until you set `SAM_GOV_API_KEY` - see below |
| [odwyerpr.com](https://www.odwyerpr.com/rfps/index.html) | PR trade publication's curated PR/marketing RFP listing | Free listing (title, type, region, dates, description) - the actual RFP document is subscriber-gated and never includes a contact person even to subscribers |
| [rfpmart.com](https://www.rfpmart.com) | Paid aggregator | Not free - but full scope of work, eligibility, and submission instructions are |
| [rfpdb.com](https://www.rfpdb.com) | Paid aggregator | Requires login - description is partially redacted for non-members |
| [findrfp.com](https://www.findrfp.com) | Paid aggregator | Fully paywalled - detail page is a subscribe-now pitch only |

The scraper never invents data. Where a site doesn't publish something for
free, the field is `null` and `accessNote` explains why.

### Enabling sam.gov

sam.gov requires a free API key tied to a SAM.gov account. Registering an
individual account doesn't require being a US business, but it does go
through login.gov identity verification, which in practice requires a
US-issued ID - so this source is optional and disabled by default. If you
ever get a key:

```bash
cp .env.example .env
# then edit .env and paste your key into SAM_GOV_API_KEY=
npm run scrape
```

`.env` is gitignored - it's never committed. You can also skip the file and
pass it inline instead: `SAM_GOV_API_KEY=xxxxx npm run scrape`.

Without a key, `sam.gov` just logs a normal per-source failure and every
other source still runs. Note: `sites/samgov.js` was built from SAM.gov's
published API docs and hasn't been exercised against a live response - sanity
check its field mapping the first time you run it with a real key.

## Setup

Requires Node 18+.

```bash
npm install
```

## Usage

```bash
npm run scrape     # search all sources, save matching listings
npm run deepdive    # visit each listing's detail page, extract proposal details
npm run all         # both, in sequence
```

Output is written to `output/`:

- `rfp-results-<date>.json` / `.csv` - listings (source, title, url, location, agency, deadline)
- `rfp-deepdive-<date>.json` / `.csv` - full details per listing (projectName,
  opportunityDescription, fundingDonor, budget, targetLocation, solicitationNumber,
  deliveryPeriod, remarks, contactPerson, contactNumber, contactEmail, accessNote, ...).
  A few fields are source-specific and only appear in the JSON, not the CSV -
  e.g. philgeps' `preBidConference` (date/time/venue) and rfpmart's
  `eligibility`/`workPerformance`/`proposalSubmission`.

`deepdive` reads the most recent `rfp-results-*.json` in `output/` by
default, or accepts an explicit path: `node rfp-deepdive.js output/rfp-results-2026-07-15.json`.

## Adjusting the keyword filter

Most sources (philgeps, rfpmart, rfpdb, findrfp) keep a listing only if it
matches a keyword in `lib/keywords.js`. Edit `KEYWORDS` there to widen or
narrow what counts as "marketing-related" for those sources. Two sources are
deliberate exceptions:

- **odwyerpr.com** skips the keyword filter entirely - its whole listing
  page is already scoped to PR/marketing RFPs, and running titles like
  "DFW's EpicCentral Seeks Marcom Support" through the filter would drop
  real matches that don't happen to contain a literal keyword.
- **sam.gov** filters by NAICS code (`NAICS_CODES` in `sites/samgov.js`)
  instead, since it searches federal contracts by industry classification,
  not free-text keywords.
- **philgeps.gov.ph** does both: it searches server-side with the literal
  keyword `"marketing"`, then re-applies `matchesKeywords()` client-side as
  a guard against PhilGEPS matching that word only in an unrelated field.

## Project structure

```
lib/            shared helpers (HTTP client, keyword filter, text/HTML
                parsing, CSV writer, delay)
sites/          one file per source, each exporting the same
                { id, scrapeListings, scrapeDetail } interface
rfp-scraper.js  orchestrator for npm run scrape
rfp-deepdive.js orchestrator for npm run deepdive
output/         generated results (gitignored)
```

Adding a new source means adding one file to `sites/` and registering it in
`sites/index.js` - nothing else needs to change.
