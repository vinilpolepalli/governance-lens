# Governance Lens

Analyze real proxy ballots from real public companies against **your own voting policy**, with a cited, one-sentence reason for every FOR / AGAINST / FLAG.

Built as a working demo for [Pennant](https://getpennant.ai) (AI-native proxy voting and governance intelligence). Demo built by Vinil Polepalli; data: SEC EDGAR.

Companies analyzed (latest DEF 14A at build time): **Tesla** (filed 2026-10-19), **Apple** (2026-01-08), **JPMorgan Chase** (2026-04-06) - 34 ballot items in total.

## Why this maps to Pennant's problem

- **Manual review of thousands of pages.** A proxy statement is 100-150 dense pages. The ballot facts that matter (board seats, tenure, pay tables, pay-vs-performance, auditor fees and tenure) are scattered across them. The pipeline pulls them out once and keeps a verbatim evidence quote per item.
- **The ISS / Glass Lewis duopoly.** Most institutions outsource the reading *and* the opinion. Here the policy is the investor's: rules are explicit, editable and applied uniformly, so the "house view" is not a vendor's black box. The *Policy divergence* page shows how much the votes move when the policy changes.
- **Reasoning per ballot item, humans in the loop.** Every decision carries a rule trace (triggered / passed / skipped) and the fact that drove it. FLAG is a first-class outcome meaning "route to an analyst", and rules whose facts could not be extracted are *skipped and say so* rather than guessing.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000, local SQLite file ./governance-lens.db (created and seeded on first request)
npm run build && npm start   # production server (needs a Node runtime; not a static export)
```

Adding a company calls SEC EDGAR live (no API key). Set `SEC_USER_AGENT="Your Name you@example.com"` so requests identify you, as SEC fair-access rules ask. With `DATABASE_URL` set, Postgres is used instead of SQLite. See `IMPLEMENTATION.md` for schema, routes and deployment notes.

## Data pipeline

Extraction code lives in `lib/extract/` and is shared by `POST /api/companies` and the CLI that regenerates the bundled sample snapshot:

```bash
SEC_USER_AGENT="Your Name your@email.com" npm run fetch   # rewrites app/data/*.json for TSLA/AAPL/JPM
```

1. Resolve the ticker via `sec.gov/files/company_tickers.json`, then the latest `DEF 14A` via `data.sec.gov/submissions/CIK##########.json`.
2. Download the primary document from `sec.gov/Archives` (requests are throttled well below SEC's 10 req/s limit).
3. Convert HTML to text and extract the ballot. The three sample filings have hand-written extractors for those exact layouts; **any other filing uses a generic extractor** that recognizes common layouts (director profile blocks, the proposals summary table, the auditor fee table, "Proposal N:" shareholder proposals) and reports everything else as "Not extracted".

Integrity rules baked into the extractors:

- Facts come from regex/table parsing of the filing text. If an anchor is missing the field is `null` and dependent rules are skipped. Nothing is estimated.
- Each item has `evidence` quotes; every quote is verified to occur verbatim in the filing text and dropped otherwise. Items labelled "values read from the cited table" assemble numbers from the cited table rows.
- Derived numbers are simple arithmetic on extracted values: tenure = meeting year - "director since" / "auditor since"; 1-year TSR = change in the filing's "value of initial fixed $100 investment"; non-audit share = (tax + all other fees) / total fees.
- Every stored company records its extraction method and a list of what was not extracted; the UI shows it as "Automated extraction".

### What is and isn't extracted

| Item | Extracted |
|---|---|
| Director elections | name, age, director since, committees, independence, Chair/CEO roles, term structure; other public boards (Apple: "Other Public Company Boards" lists; JPMorgan: nominee table) |
| Say-on-pay | CEO Summary Compensation Table total (current and prior year), PvP TSR index, prior-year say-on-pay support |
| Auditor | firm, "since" year, fee table |
| Equity plan (Apple) | share reserve, remaining shares, whether more shares are requested |
| Shareholder proposals | proponent, title, resolved clause, category, board recommendation |

Known gaps (shown in the UI rather than papered over): Tesla's other public board seats are free text in bios and are **not** extracted, so the overboarding rule is skipped for Tesla nominees. Tesla's CEO has no prior-year SCT total (reported as "-"), so the pay-growth-vs-TSR rule is skipped for Tesla. Tesla's 2026 ballot has no shareholder proposals. Tesla's $158.4 billion figure is the grant-date accounting value of the 2025 CEO Performance Award as reported in the SCT, not cash paid. Proposal categories are assigned from title keywords and are a simplification.

## How the policy engine works

`lib/engine.ts` is a deterministic TypeScript rule engine (no LLM calls).

- A **policy** (`lib/policies.ts`) is a set of toggleable rules with thresholds and an action (AGAINST or FLAG), plus a FOR / AGAINST / FLAG stance for each shareholder-proposal category.
- Each rule evaluates facts from the filing and returns `triggered`, `passed` or `skipped` (fact missing).
- The vote is the most severe triggered action (AGAINST > FLAG > FOR). The one-sentence reasoning is the text of the leading rule, quoting the fact and threshold, e.g. *"PricewaterhouseCoopers LLP has audited the company since 2005 (21 years), beyond the 20-year tenure limit."*
- Rules: public-board count, independent-director tenure, age, combined Chair/CEO, classified board, CEO pay growth vs 1-year TSR, CEO pay ceiling, prior say-on-pay support, auditor tenure, non-audit fee share, equity-plan share increases.
- Presets: **Long-term value focus** (escalate only clear outliers) and **Governance-first** (structural independence and tight limits). Presets are read-only; duplicate one to get an editable custom policy stored in the database.

## Pages

- `/` add a company by ticker; company list with live-preview tallies and provenance
- `/company/<ticker>/` ballot cards, policy panel (create / edit / rename / duplicate / delete), recorded vote runs with overrides
- `/compare/` how two policies diverge on the same ballots
- `/audit/` vote runs, overrides and every data/policy change, with timestamps

## Stack

Next.js 14 (App Router, route handlers) · TypeScript · Tailwind CSS · Drizzle ORM (better-sqlite3 in dev, Postgres via `DATABASE_URL`).

## Limitations

The generic extractor was developed against one live filing (Microsoft) and will miss or skip fields on layouts it does not recognize; the three sample filings use hand-written extractors; Pennant's real challenge is exactly that long tail. Outputs are rule results for analyst review, not voting or investment advice.
