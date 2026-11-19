# Public-demo hardening - apply now

This app will be publicly reachable. Add proportionate abuse and data-isolation controls. Do not change existing function, copy, disclosures, or the new light visuals. Build and typecheck must pass.

## Identity (lightweight, anonymous)
- On any write request, ensure an anonymous owner id: a random uid set as an httpOnly cookie (gl_uid), created on first write, 1-year expiry. No login, no personal data.
- policies and vote_runs rows store owner_id. Seed/preset rows have owner 'system'.

## Rules
1. Preset policies: never editable or deletable (already true - keep).
2. Custom policies: anyone can read/list; only the owner (matching gl_uid) can rename, edit rules, or delete. Others get 403 {error:{code:'forbidden'}}.
3. Vote runs: anyone can record and read; only the owner can delete a run (if delete exists).
4. Company adds (POST /api/companies): per-owner limit 5 adds/hour; global cap 20 companies stored - beyond it return 429 {error:{code:'company_cap'}}. Ticker resolution stays strictly via SEC company_tickers.json (no arbitrary URLs).
5. All write endpoints: per-owner rate limit 30 writes/hour returning 429 {error:{code:'rate_limited', retryAfterSec}}. An in-memory limiter is fine (single instance); keep it in one small module with a comment noting the single-instance caveat.
6. JSON bodies capped at 20KB; reject larger with 413. String fields capped (names 80 chars, reasons 500).
7. UI: surface 403/429/413 errors as plain inline messages near the action (no alert()). Deleting something you don't own shows the forbidden message.
8. Audit log stays append-only; deletes are recorded as audit entries.

## Verify
- curl-level tests: over-limit add returns 429; delete without owner cookie returns 403; with owner cookie succeeds; 21st company returns company_cap; oversized body returns 413. Write results into IMPLEMENTATION.md's hardening section. Do not deploy or push.
