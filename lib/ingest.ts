import { extractBallot } from "./extract/proxy-extractors.mjs";
import { getConn } from "./db";
import { audit, getCompany, getCompanyRow, now, saveCompany } from "./db/repo";
import { eq } from "drizzle-orm";
import { ApiError } from "./errors";
import { filingUrls, findLatestDef14a, resolveTicker, secGet } from "./sec";
import type { Company } from "./types";

/** Global cap on stored companies (seed samples included). Refreshing an already-stored ticker never counts. */
export const MAX_COMPANIES = 20;

const inflight = new Map<string, Promise<{ company: Company; cached: boolean }>>();

export function ingestTicker(raw: unknown) {
  if (typeof raw !== "string" || !/^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(raw.trim())) throw new ApiError(400, "invalid_ticker", "ticker must be 1-10 letters/digits (e.g. MSFT).");
  const ticker = raw.trim().toUpperCase();
  let p = inflight.get(ticker);
  if (!p) {
    p = run(ticker).finally(() => inflight.delete(ticker));
    inflight.set(ticker, p);
  }
  return p;
}

async function run(input: string): Promise<{ company: Company; cached: boolean }> {
  const c = await getConn();
  const capped = async () => {
    if ((await c.db.select({ id: c.schema.companies.id }).from(c.schema.companies)).length >= MAX_COMPANIES) throw new ApiError(429, "company_cap", `This demo stores at most ${MAX_COMPANIES} companies and the limit has been reached. Open one of the stored companies instead.`);
  };
  // Cheap pre-check before any network call (tickers are unique, so a stored ticker is a refresh, not an add).
  if (!(await getCompanyRow(c, input))) await capped();
  const r = await resolveTicker(input);
  const stored = await getCompany(c, r.ticker);
  const { filing, name, sector, exchange } = await findLatestDef14a(r.cik);
  if (stored && stored.filing.accession === filing.accession) return { company: stored, cached: true };

  const urls = filingUrls(r.cik, filing);
  const html = (await secGet(urls.sourceUrl, "text")) as string;
  let out;
  try {
    out = extractBallot({ html, accession: filing.accession, filingDate: filing.filingDate });
  } catch (e) {
    throw new ApiError(422, "extraction_failed", `The proxy was downloaded but ballot extraction failed: ${e instanceof Error ? e.message : "unknown error"}.`, { sourceUrl: urls.sourceUrl });
  }
  if (out.items.length === 0)
    throw new ApiError(422, "nothing_extracted", "The proxy was downloaded but no ballot items could be recognized in its layout, so nothing was stored.", { sourceUrl: urls.sourceUrl, gaps: out.extraction.gaps });

  const company: Company = {
    ticker: r.ticker,
    name,
    cik: r.cik,
    sector,
    exchange,
    filing: { form: "DEF 14A", filingDate: filing.filingDate, accession: filing.accession, ...urls, origin: "edgar-live", extraction: out.extraction },
    meeting: { year: out.meta.meetingYear, date: out.meta.meetingDate, fiscalYear: out.meta.fiscalYear },
    fetchedAt: now(),
    items: out.items,
  };
  if (!stored) await capped(); // re-check: other adds may have landed during the download
  if (!stored) return { company: await saveCompany(c, company), cached: false };

  // A newer proxy exists for an already-stored ticker: refresh in place (keeps the company id so past runs stay linked).
  const s = c.schema;
  const row = (await getCompanyRow(c, r.ticker))!;
  await c.db.update(s.companies).set({ name, cik: company.cik, sector, exchange, filing: company.filing, meeting: company.meeting, fetchedAt: company.fetchedAt }).where(eq(s.companies.id, row.id));
  await c.db.delete(s.ballotItems).where(eq(s.ballotItems.companyId, row.id));
  await c.db.insert(s.ballotItems).values(company.items.map((it, position) => ({ id: crypto.randomUUID(), companyId: row.id, itemKey: it.id, position, type: it.type, title: it.title, subtitle: it.subtitle, boardRec: it.boardRec, facts: it.facts, evidence: it.evidence })));
  await audit(c, "company", r.ticker, "refresh", { fromAccession: stored.filing.accession, toAccession: filing.accession, items: company.items.length });
  return { company: (await getCompany(c, r.ticker))!, cached: false };
}
