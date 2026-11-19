import { ApiError } from "./errors";

/** SEC fair-access: identify the app and a contact. Override with SEC_USER_AGENT="App contact@example.com". */
export const userAgent = () =>
  process.env.SEC_USER_AGENT || "GovernanceLens/1.0 (open-source proxy-ballot demo; set SEC_USER_AGENT to add a contact email)";

let last = 0;
async function throttle() {
  // Stay far below SEC's 10 requests/second limit.
  const wait = last + 250 - Date.now();
  last = Math.max(Date.now(), last + 250);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

const MAX_BYTES = 40 * 1024 * 1024;

export async function secGet(url: string, as: "json" | "text"): Promise<unknown> {
  await throttle();
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": userAgent(), "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(45_000), cache: "no-store" });
  } catch (e) {
    throw new ApiError(502, "sec_unreachable", `Could not reach SEC EDGAR (${e instanceof Error ? e.message : "network error"}). Try again shortly.`);
  }
  if (res.status === 429 || res.status === 403) {
    const retry = res.headers.get("retry-after");
    throw new ApiError(429, "sec_rate_limited", `SEC EDGAR is rate-limiting requests (HTTP ${res.status}). Wait a minute and try again.`, retry ? { retryAfterSeconds: Number(retry) || undefined } : undefined);
  }
  if (res.status === 404) throw new ApiError(404, "sec_not_found", `SEC EDGAR returned 404 for ${url}.`);
  if (!res.ok) throw new ApiError(502, "sec_error", `SEC EDGAR returned HTTP ${res.status}.`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new ApiError(502, "sec_too_large", "The filing is larger than this app will download.");
  return as === "json" ? res.json() : res.text();
}

interface TickerEntry { cik_str: number; ticker: string; title: string }
let tickerCache: { at: number; byTicker: Map<string, TickerEntry> } | null = null;

export async function resolveTicker(ticker: string): Promise<{ cik: string; title: string; ticker: string }> {
  if (!tickerCache || Date.now() - tickerCache.at > 6 * 3600_000) {
    const raw = (await secGet("https://www.sec.gov/files/company_tickers.json", "json")) as Record<string, TickerEntry>;
    tickerCache = { at: Date.now(), byTicker: new Map(Object.values(raw).map((e) => [e.ticker.toUpperCase(), e])) };
  }
  const t = ticker.toUpperCase();
  const e = tickerCache.byTicker.get(t) ?? tickerCache.byTicker.get(t.replace(/\./g, "-"));
  if (!e) throw new ApiError(404, "unknown_ticker", `"${ticker}" is not in SEC's company_tickers.json. Check the symbol (class shares use a dash, e.g. BRK-B).`);
  return { cik: String(e.cik_str).padStart(10, "0"), title: e.title, ticker: e.ticker.toUpperCase() };
}

interface Submissions {
  name: string;
  sicDescription?: string;
  exchanges?: string[];
  filings: { recent: Recent; files?: { name: string }[] };
}
interface Recent { form: string[]; accessionNumber: string[]; primaryDocument: string[]; filingDate: string[] }

export interface Def14a { accession: string; primaryDocument: string; filingDate: string }

function newestDef14a(r: Recent): Def14a | null {
  const i = r.form.findIndex((f) => f === "DEF 14A");
  return i < 0 ? null : { accession: r.accessionNumber[i], primaryDocument: r.primaryDocument[i], filingDate: r.filingDate[i] };
}

/** Latest definitive proxy statement (form "DEF 14A") via data.sec.gov submissions JSON. */
export async function findLatestDef14a(cik: string): Promise<{ filing: Def14a; name: string; sector: string; exchange: string }> {
  const subs = (await secGet(`https://data.sec.gov/submissions/CIK${cik}.json`, "json")) as Submissions;
  let filing = newestDef14a(subs.filings.recent);
  // Infrequent filers: the DEF 14A may sit in an older paged file.
  for (const f of subs.filings.files ?? []) {
    if (filing) break;
    const page = (await secGet(`https://data.sec.gov/submissions/${f.name}`, "json")) as Recent;
    filing = newestDef14a(page);
  }
  if (!filing) throw new ApiError(404, "no_def14a", `No DEF 14A proxy statement was found on EDGAR for ${subs.name}. Companies that don't file proxy statements (e.g. many foreign issuers) can't be analyzed.`);
  return { filing, name: subs.name, sector: subs.sicDescription || "Not provided by EDGAR", exchange: subs.exchanges?.[0] || "Not provided by EDGAR" };
}

export function filingUrls(cik: string, f: Def14a) {
  const n = String(parseInt(cik, 10));
  const folder = f.accession.replace(/-/g, "");
  return {
    sourceUrl: `https://www.sec.gov/Archives/edgar/data/${n}/${folder}/${f.primaryDocument}`,
    indexUrl: `https://www.sec.gov/Archives/edgar/data/${n}/${folder}/${f.accession}-index.htm`,
  };
}
