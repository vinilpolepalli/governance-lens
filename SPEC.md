# Governance Lens - high-fidelity rebuild spec

Rebuild this static demo into a real working product. Keep everything that is truthful today; remove nothing that discloses data provenance. Function first; visual style pass comes later (do not redesign visuals beyond keeping them clean and consistent with the current look).

## Current state
- Next.js 14 static export. 3 hardcoded companies (TSLA, AAPL, JPM) extracted from real SEC DEF 14A filings, stored as JSON with filing metadata + sourceUrl.
- 2 preset voting policies, client-side rules engine (lib/engine.ts) evaluates ballot items against a policy.
- Nothing persists; users cannot add companies or save policies.

## Target state (real backend, real workflows)
1. **Server runtime, not static export.** Remove `output: 'export'` so API routes run. App still deploys to Vercel hobby.
2. **Database layer.** Drizzle ORM. Abstract so dev runs on local SQLite (better-sqlite3, file in project root, gitignored) and prod takes Postgres via DATABASE_URL. Tables: companies (ticker, name, cik, sector, exchange, filing metadata JSON, fetched_at), ballot_items (company_id, type, title, subtitle, board_rec, facts JSON, evidence JSON), policies (id, name, tagline, rules JSON, is_preset, created_at, updated_at), vote_runs (policy_id, company_id, created_at), votes (run_id, item_id, decision, overridden, override_reason, evidence snapshot), audit_log (entity, entity_id, action, detail JSON, created_at).
3. **Live SEC EDGAR ingestion.** POST /api/companies { ticker }: resolve CIK via SEC company_tickers.json, find latest DEF 14A via EDGAR browse-edgar JSON, download the proxy, extract ballot items using the existing scripts/fetch-proxies.mjs logic (refactor into lib/ so the route reuses it), store company + items + filing metadata, return the company. Header User-Agent must identify the app politely. Handle: unknown ticker, no DEF 14A found, EDGAR rate limit (429) with a clean error. Cache: if company already stored with same accession, return stored. Show fetched_at and filing date in the UI wherever data appears. Automated extraction stays labeled as automated extraction.
4. **Persistent policies.** Preset policies seed the DB. Users can create, edit, rename, duplicate, delete custom policies through the existing PolicyPanel UI; changes save via API routes and survive reload.
5. **Vote runs with audit.** Running a policy against a company creates a vote_run + votes rows. User can override any item's decision with a reason; overrides persist and are marked. An audit view lists every run and override with timestamps.
6. **UI wiring.** Existing screens (ballot list, company view, compare, policy panel) read/write through the API. Add-company-by-ticker flow on the home page with progress and error states. Loading, empty, and error states everywhere. Mobile stays usable (no clipped tables; stacked rows under 640px).
7. **Honesty requirements (hard constraints).** All filing data shows source (EDGAR link), filing date, and fetch timestamp. Extraction gaps stay visible as "not extracted", never filled with guesses. Any simulated action is labeled simulated. No capability claims in UI copy beyond what the routes actually do. Sample/seed content is labeled.
8. **Quality bar.** `npm run build` passes, `npm run typecheck` passes, engine unit check (scripts/engine-check.mts) still passes. Test the API routes locally against the SQLite dev DB (curl or a small script): add company (a real ticker not in the seed, e.g. MSFT), duplicate add (cache path), create/edit/delete policy, run votes, override one, read audit log. Fix everything found.
9. Do not touch deploy config or push anywhere. Do not add paid dependencies. Keep dependencies free and minimal.

Deliver: working app per above, plus a short IMPLEMENTATION.md describing schema, routes, and how to run dev/prod.
