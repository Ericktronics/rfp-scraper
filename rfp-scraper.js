// Runs every registered site's scrapeListings() and saves the combined,
// keyword-matched results. Per-site logic lives in sites/*.js - this file
// only orchestrates and writes output.
const fs = require('fs');
const path = require('path');
const { toCsv } = require('./lib/csv');
const { all: sites } = require('./sites');

const CSV_HEADERS = ['source', 'title', 'url', 'deadline', 'location', 'agency'];
const OUTPUT_DIR = path.join(__dirname, 'output');

async function main() {
  console.log('Scraping RFP sources for marketing-related opportunities...');

  const allResults = [];
  for (const site of sites) {
    try {
      const results = await site.scrapeListings();
      console.log(`  ${site.id}: ${results.length} matching RFPs`);
      allResults.push(...results);
    } catch (err) {
      console.error(`  ${site.id}: FAILED - ${err.message}`);
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `rfp-results-${timestamp}.json`),
    JSON.stringify(allResults, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `rfp-results-${timestamp}.csv`),
    toCsv(allResults, CSV_HEADERS)
  );

  console.log(`\nDone. ${allResults.length} total results saved to output/rfp-results-${timestamp}.json/.csv`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
