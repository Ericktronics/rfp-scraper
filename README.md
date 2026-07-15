# rfp-scraper

Scrapes marketing-related RFPs (Request for Proposals) from four sources, then
deep-dives each listing to pull out the details useful for writing a
proposal: contact person, contact number, funding donor/agency, budget,
scope of work, and deadlines.

## Sources

| Source | Listings | Contact info |
| --- | --- | --- |
| [philgeps.gov.ph](https://notices.philgeps.gov.ph) | Philippine government procurement portal | Free & public - name, position, phone, email |
| [rfpmart.com](https://www.rfpmart.com) | Paid aggregator | Not free - but full scope of work, eligibility, and submission instructions are |
| [rfpdb.com](https://www.rfpdb.com) | Paid aggregator | Requires login - description is partially redacted for non-members |
| [findrfp.com](https://www.findrfp.com) | Paid aggregator | Fully paywalled - detail page is a subscribe-now pitch only |

The scraper never invents data. Where a site doesn't publish something for
free, the field is `null` and `accessNote` explains why.

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

- `rfp-results-<date>.json` / `.csv` - listings (title, url, location, agency, deadline)
- `rfp-deepdive-<date>.json` / `.csv` - full details per listing (projectName,
  opportunityDescription, fundingDonor, budget, targetLocation, contactPerson,
  contactNumber, contactEmail, accessNote, ...)

`deepdive` reads the most recent `rfp-results-*.json` in `output/` by
default, or accepts an explicit path: `node rfp-deepdive.js output/rfp-results-2026-07-15.json`.

## Adjusting the keyword filter

Listings are kept only if they match a keyword in `lib/keywords.js`. Edit
`KEYWORDS` there to widen or narrow what counts as "marketing-related".

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
