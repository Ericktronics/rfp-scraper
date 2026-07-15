const findrfp = require('./findrfp');
const rfpdb = require('./rfpdb');
const rfpmart = require('./rfpmart');
const philgeps = require('./philgeps');
const odwyerpr = require('./odwyerpr');
const samgov = require('./samgov');

// Every site module implements the same shape:
//   { id, scrapeListings(): Promise<Listing[]>, scrapeDetail(url): Promise<Details> }
// Adding a new source means adding one file here and registering it below -
// nothing else in the project needs to change (open/closed).
//
// samgov requires SAM_GOV_API_KEY to be set (see sites/samgov.js) - without
// it, its scrapeListings() throws and rfp-scraper.js's per-site try/catch
// logs it as a normal failure, same as any other source being down.
const all = [findrfp, rfpdb, rfpmart, philgeps, odwyerpr, samgov];
const byId = Object.fromEntries(all.map((site) => [site.id, site]));

module.exports = { all, byId };
