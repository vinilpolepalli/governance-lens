# Implementation notes

## Run

```bash
npm install
npm run dev                 # SQLite file ./governance-lens.db (gitignored), seeded on first request
npm run build && npm start  # production server
npm run typecheck
npm run test:engine         # scripts/engine-check.mts (rule engine + policy validator)
BASE=http://localhost:3000 node scripts/api-check.mjs MSFT   # end-to-end API check, calls live EDGAR
```

Environment: `DATABASE_URL` (Postgres; if unset, SQLite), `SQLITE_PATH` (default `./governance-lens.db`), `SEC_USER_AGENT` (recommended: `"Your Name you@example.com"`; default identifies the app but has no contact).

Production (Vercel hobby or any Node host): set `DATABASE_URL` to a Postgres database and optionally `SEC_USER_AGENT`. SQLite is dev-only (serverless filesystems are not persistent). Tables are created idempotently from `lib/db/ddl.ts` on first use; no migration step. `next.config.mjs` no longer sets `output: 'export'`. `POST /api/companies` can take tens of seconds (`maxDuration = 60`; Vercel hobby's own function limit applies).

## Schema (Drizzle: `lib/db/schema.sqlite.ts`, twin `schema.pg.ts`)

All ids are text; timestamps are ISO-8601 text; JSON is JSON-in-text (SQLite) / jsonb (Postgres).

| Table | Columns |
|---|---|
| `companies` | id, ticker (unique), name, cik, sector, exchange, `filing` JSON (form, filingDate, accession, sourceUrl, indexUrl, `origin` seed/edgar-live, `extraction` {method, version, automated, gaps[]}), `meeting` JSON, fetched_at |
| `ballot_items` | id, company_id, item_key, position, type, title, subtitle, board_rec (nullable = not extracted), facts JSON, evidence JSON |
| `policies` | id, name, tagline, rules JSON, is_preset, created_at, updated_at |
| `vote_runs` | id, policy_id, company_id, created_at, policy_name + policy_snapshot JSON (so runs survive policy edits/deletes), filing_accession |
| `votes` | id, run_id, item_id, item_key, item_title, item_type, board_rec, original_decision, decision (effective), reasoning, overridden, override_reason, overridden_at, `evidence` JSON snapshot {rules trace, filing quotes} |
| `audit_log` | id, entity, entity_id, action, detail JSON, created_at |

Deviations from the literal spec columns: extra columns are snapshots needed for a truthful audit trail. `policy_id` has no foreign key on purpose (deleting a policy keeps its runs).

## Routes (all JSON; errors are `{error:{code,message}}`)

| Route | |
|---|---|
| `GET /api/companies` | stored companies with items |
| `POST /api/companies` `{ticker}` | resolve CIK (`company_tickers.json`) → latest DEF 14A (`data.sec.gov/submissions` JSON) → download → extract → store. 201 new, 200 `{cached:true}` if the stored accession equals the latest; a newer filing refreshes the company in place. Errors: 400 invalid ticker, 404 `unknown_ticker` / `no_def14a`, 429 `sec_rate_limited`, 502 EDGAR unreachable/error, 422 extraction failed or nothing recognized |
| `GET /api/companies/:ticker` | one company |
| `GET/POST /api/policies`, `GET/PUT/PATCH/DELETE /api/policies/:id`, `POST /api/policies/:id/duplicate` | presets are read-only (403) |
| `GET/POST /api/runs` | POST `{policyId, ticker}` evaluates the saved policy server-side and stores votes; GET filters `ticker`, `policyId`, `limit`, `votes=1` |
| `GET /api/runs/:id` | run with votes |
| `PATCH /api/votes/:id` `{decision, reason}` | override (reason required); choosing the engine's own decision clears it. `DELETE` restores the engine decision |
| `GET /api/audit` | event log + runs with votes |

Every mutation (ingest/refresh, policy create/rename/update/duplicate/delete, run, override, override cleared) writes an `audit_log` row.

## Layout

- `lib/extract/` pure extraction (shared by the API and `scripts/fetch-proxies.mjs`); `lib/sec.ts` EDGAR client (identifying User-Agent, throttle, 429/403 → clean error); `lib/ingest.ts`; `lib/db/` connection, DDL, repo, seed; `lib/engine.ts` rule engine (unchanged semantics, hardened so null facts are skipped rather than evaluated).
- UI: client components read/write through the API (`lib/client.ts`).

## Honesty decisions

- Deviation: the spec says "EDGAR browse-edgar JSON"; browse-edgar does not return JSON, so the documented `data.sec.gov/submissions` JSON is used.
- Seed data: the three sample filings (TSLA, AAPL, JPM) load from committed snapshots, labelled "SAMPLE DATA" with `fetched_at` taken from the snapshot file's timestamp (not re-fetched).
- Live companies use a **generic extractor**; it was built and verified against Microsoft's 2026 proxy only. Every company shows an "Automated extraction" disclosure with its list of not-extracted items; missing facts render "Not extracted" and the rule is skipped (decision REVIEW if nothing could be evaluated). For MSFT, e.g., CEO pay/TSR and a "over 91%" say-on-pay result are not extracted.
- Vote runs are labelled simulated: they only write to this database; nothing is submitted anywhere.
- No login. Public-demo hardening (below) adds anonymous per-browser ownership and abuse limits; it is not authentication.

## Verification status

- `npm run build`, `npm run typecheck`, `npm run test:engine` pass.
- `scripts/api-check.mjs` passes against SQLite in dev and production mode (live MSFT add, cached duplicate add, policy create/edit/rename/duplicate/delete, run, override, audit). The 429 path was checked against a fake local server. A ticker without proxies (TSM) returns `no_def14a`.
- UI exercised with Playwright (add-company error state, duplicate/edit/save/reload, run, override persists after reload, audit, compare; no horizontal overflow at 390px).
- **Not tested: the Postgres path** (no Postgres server available here). Its schema and DDL mirror SQLite's; treat it as unverified until run against a real database.

## Hardening (public demo)

Implemented per HARDENING.md:

- **Identity**: `lib/owner.ts`. Any write request creates an httpOnly `gl_uid` cookie (random UUID, SameSite=Lax, 1 year, `Secure` over https) if absent. `policies.owner_id` and `vote_runs.owner_id` store it; presets/seed are `'system'`. Existing databases are migrated by adding the column (old custom policies become `'system'`, so nobody can edit/delete them). Owner ids are never returned by the API or written to the audit log (it is a bearer secret).
- **Policies**: presets stay read-only (`preset_readonly`); custom policies are readable by all, but rename/edit/delete need the owner cookie, else 403 `{error:{code:'forbidden'}}`. Vote runs: anyone can record/read; there is no run-delete endpoint, so no owner check is needed yet. Vote overrides (PATCH/DELETE `/api/votes/:id`) are only rate limited, not owner-gated (not specified).
- **Limits**: `lib/rate-limit.ts` (in-memory sliding window; single-instance caveat documented there). All write endpoints: 30/hour per owner, then 429 `{code:'rate_limited', retryAfterSec}` (+ `Retry-After`). `POST /api/companies`: additionally 5 adds/hour per owner (attempts count, including cached/failed ones) and a global cap of 20 stored companies (seed samples included), checked before any network call and again before saving, then 429 `company_cap`. Re-adding an already stored ticker is not blocked by the cap. Ticker resolution is still only via SEC `company_tickers.json`.
- **Sizes**: JSON bodies capped at 20KB (declared length and streamed) -> 413 `payload_too_large`. Names 80, taglines 240, override reasons 500 (was 1000), ids/tickers length-checked.
- **UI**: no code change needed; existing components already render server error messages inline (`role=alert/status`), so 403/429/413 appear next to the action. No `alert()` is used (only the pre-existing delete `confirm`).
- **Audit**: still append-only; policy deletes already write a `delete` entry (verified below).

### Verification (2026-11-17; `next start` on a temporary SQLite DB, live EDGAR reachable)

`npm run typecheck` and `npm run build` pass.

| Check | Result |
|---|---|
| Create policy without cookie | 201, `Set-Cookie: gl_uid=...; HttpOnly; Max-Age=31536000` |
| DELETE / PUT another owner's policy (no cookie) | 403 `forbidden` |
| DELETE preset (even with a cookie) | 403 `preset_readonly` |
| DELETE own policy with owner cookie | 200; audit has `delete` entry; owner uid appears nowhere in `/api/audit` |
| 6th company add by one owner in an hour | 429 `rate_limited`, `retryAfterSec: 3600` (adds 1-5 returned 404 `unknown_ticker`, still counted) |
| 31st write by one owner | 429 `rate_limited` (30 passed) |
| Add a new ticker with 20 companies stored | 429 `company_cap` (filled with 17 synthetic rows by SQL, since 5/hour/owner makes 17 real adds slow); existing ticker (TSLA) still 200 |
| 30KB body (content-length, and chunked) | 413 `payload_too_large` |

Not tested: Postgres path (migration uses `ADD COLUMN IF NOT EXISTS`); browser UI of the new error states (messages are existing generic render paths). Caveats: limits are per anonymous cookie, so a client that discards cookies gets a fresh per-owner bucket; the global company cap and 20KB/field caps bound the damage, but add IP-level limiting at the host/CDN for a truly public deployment.
