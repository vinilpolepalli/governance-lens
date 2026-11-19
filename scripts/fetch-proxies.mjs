#!/usr/bin/env node
/**
 * Governance Lens - CLI data pipeline for the committed sample snapshot (app/data/*.json).
 * The extraction logic lives in lib/extract/ (shared with POST /api/companies).
 *
 * Usage:  SEC_USER_AGENT="Your Name you@example.com" node scripts/fetch-proxies.mjs [TICKER ...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractBallot } from "../lib/extract/proxy-extractors.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const OUT = path.join(ROOT, "app", "data");
const UA = process.env.SEC_USER_AGENT;
if (!UA) {
  console.error('Set SEC_USER_AGENT to "Your Name your@email" (SEC fair-access policy).');
  process.exit(1);
}

const COMPANIES = [
  { ticker: "TSLA", name: "Tesla, Inc.", cik: "0001318605", sector: "Automotive & Energy", exchange: "Nasdaq" },
  { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", sector: "Technology", exchange: "Nasdaq" },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", cik: "0000019617", sector: "Financials", exchange: "NYSE" },
];
const only = process.argv.slice(2).map((s) => s.toUpperCase());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, asJson) {
  await sleep(300); // well under SEC's 10 req/s limit
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return asJson ? res.json() : res.text();
}

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
for (const c of COMPANIES.filter((x) => !only.length || only.includes(x.ticker))) {
  console.log(`\n== ${c.name}`);
  const subs = await get(`https://data.sec.gov/submissions/CIK${c.cik}.json`, true);
  const r = subs.filings.recent;
  const i = r.form.findIndex((f) => f === "DEF 14A");
  if (i < 0) throw new Error("no DEF 14A found for " + c.name);
  const accession = r.accessionNumber[i];
  const filingDate = r.filingDate[i];
  const cikNum = String(parseInt(c.cik, 10));
  const folder = accession.replace(/-/g, "");
  const sourceUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${folder}/${r.primaryDocument[i]}`;
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${folder}/${accession}-index.htm`;
  console.log(`   DEF 14A filed ${filingDate}  ${accession}\n   ${sourceUrl}`);
  const cacheFile = path.join(CACHE, `${c.ticker}-${accession}.htm`);
  let html;
  let fetchedAt = new Date().toISOString();
  if (fs.existsSync(cacheFile)) {
    html = fs.readFileSync(cacheFile, "utf8");
    fetchedAt = fs.statSync(cacheFile).mtime.toISOString();
  } else {
    html = await get(sourceUrl, false);
    fs.writeFileSync(cacheFile, html);
  }
  const { items, meta, extraction } = extractBallot({ html, accession, filingDate });
  console.log(`   extractor: ${extraction.method}; ${items.length} ballot items: ${items.map((x) => x.type).join(", ")}`);
  const out = {
    ticker: c.ticker, name: c.name, cik: c.cik, sector: c.sector, exchange: c.exchange,
    filing: { form: "DEF 14A", filingDate, accession, sourceUrl, indexUrl },
    meeting: { year: meta.meetingYear, date: meta.meetingDate, fiscalYear: meta.fiscalYear },
    generatedBy: "scripts/fetch-proxies.mjs",
    fetchedAt,
    items,
  };
  fs.writeFileSync(path.join(OUT, `${c.ticker.toLowerCase()}.json`), JSON.stringify(out, null, 2) + "\n");
}
console.log("\nDone.");
