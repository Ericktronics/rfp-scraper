const findrfp = require('./findrfp');
const rfpdb = require('./rfpdb');
const rfpmart = require('./rfpmart');
const philgeps = require('./philgeps');

// Every site module implements the same shape:
//   { id, scrapeListings(): Promise<Listing[]>, scrapeDetail(url): Promise<Details> }
// Adding a new source means adding one file here and registering it below -
// nothing else in the project needs to change (open/closed).
const all = [findrfp, rfpdb, rfpmart, philgeps];
const byId = Object.fromEntries(all.map((site) => [site.id, site]));

module.exports = { all, byId };
