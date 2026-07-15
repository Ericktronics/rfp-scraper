// Visits each RFP's detail page (from a rfp-results-*.json produced by
// rfp-scraper.js) and pulls out the fields useful for writing a proposal:
// funding donor/agency, opportunity title & description, budget, target
// location, project name, and contact info (person, number, email) where
// the source actually publishes it.
//
// Reality check per source:
// - philgeps.gov.ph is a public government portal and freely publishes full
//   contact details.
// - findrfp.com, rfpdb.com and rfpmart.com are paid aggregators. They gate
//   contact info behind a login/subscription/document purchase. Each site
//   module pulls whatever is genuinely free on the page and sets
//   `accessNote` explaining what's missing and why - nothing is invented.
//
// Per-site parsing lives in sites/*.js; this file only orchestrates.
const fs = require('fs');
const path = require('path');
const { toCsv } = require('./lib/csv');
const { delay } = require('./lib/delay');
const { byId: sitesById } = require('./sites');

const REQUEST_DELAY_MS = 1200;
const OUTPUT_DIR = path.join(__dirname, 'output');

const CSV_HEADERS = [
  'source',
  'projectName',
  'opportunityTitle',
  'fundingDonor',
  'budget',
  'targetLocation',
  'deadline',
  'contactPerson',
  'contactNumber',
  'contactEmail',
  'opportunityDescription',
  'accessNote',
  'url',
];

function findLatestResultsFile() {
  if (!fs.existsSync(OUTPUT_DIR)) return null;
  const files = fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => /^rfp-results-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  return files.length ? path.join(OUTPUT_DIR, files[files.length - 1]) : null;
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : findLatestResultsFile();
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('No rfp-results-*.json file found. Run `node rfp-scraper.js` first, or pass a path.');
    process.exit(1);
  }

  const listings = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  console.log(`Deep-diving ${listings.length} listings from ${path.basename(inputPath)}...`);

  const deepDives = [];
  for (const listing of listings) {
    const site = sitesById[listing.source];
    if (!site || !listing.url) {
      console.log(`  skip (no detail scraper/url): ${listing.title}`);
      continue;
    }

    try {
      const details = await site.scrapeDetail(listing.url);
      deepDives.push({
        source: listing.source,
        url: listing.url,
        ...details,
        opportunityTitle: details.opportunityTitle || listing.title,
        targetLocation: details.targetLocation || listing.location || null,
        deadline: details.deadline || listing.deadline || null,
      });
      console.log(`  ok: [${listing.source}] ${listing.title}`);
    } catch (err) {
      console.error(`  FAILED: [${listing.source}] ${listing.title} - ${err.message}`);
    }

    await delay(REQUEST_DELAY_MS);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `rfp-deepdive-${timestamp}.json`),
    JSON.stringify(deepDives, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `rfp-deepdive-${timestamp}.csv`),
    toCsv(deepDives, CSV_HEADERS)
  );

  console.log(`\nDone. ${deepDives.length} deep-dived results saved to output/rfp-deepdive-${timestamp}.json/.csv`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
