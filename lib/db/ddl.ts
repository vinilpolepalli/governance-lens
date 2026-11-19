/** Idempotent bootstrap DDL (no migration tool needed to run the app). Mirrors schema.*.ts. */
const common = (json: string, bool: string) => [
  `CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY, ticker TEXT NOT NULL, name TEXT NOT NULL, cik TEXT NOT NULL, sector TEXT NOT NULL,
    exchange TEXT NOT NULL, filing ${json} NOT NULL, meeting ${json} NOT NULL, fetched_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS companies_ticker_uq ON companies (ticker)`,
  `CREATE TABLE IF NOT EXISTS ballot_items (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE, item_key TEXT NOT NULL,
    position INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL, board_rec TEXT,
    facts ${json} NOT NULL, evidence ${json} NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ballot_items_company_key_uq ON ballot_items (company_id, item_key)`,
  `CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT NOT NULL, rules ${json} NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'system', is_preset ${bool} NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS vote_runs (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT 'system', policy_id TEXT NOT NULL, company_id TEXT NOT NULL, created_at TEXT NOT NULL,
    policy_name TEXT NOT NULL, policy_snapshot ${json} NOT NULL, filing_accession TEXT)`,
  `CREATE INDEX IF NOT EXISTS vote_runs_company_idx ON vote_runs (company_id, policy_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES vote_runs(id) ON DELETE CASCADE, item_id TEXT NOT NULL,
    item_key TEXT NOT NULL, item_title TEXT NOT NULL, item_type TEXT NOT NULL, board_rec TEXT,
    original_decision TEXT NOT NULL, decision TEXT NOT NULL, reasoning TEXT NOT NULL, overridden ${bool} NOT NULL,
    override_reason TEXT, overridden_at TEXT, evidence ${json} NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS votes_run_idx ON votes (run_id)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
    detail ${json} NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_log_time_idx ON audit_log (created_at)`,
];

export const SQLITE_DDL = common("TEXT", "INTEGER");
export const PG_DDL = common("JSONB", "BOOLEAN");

/** Databases created before owner_id existed: add the column (existing rows become 'system' = nobody can edit/delete them). */
export const PG_MIGRATIONS = ["policies", "vote_runs"].map((t) => `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'system'`);
export const SQLITE_OWNER_TABLES = ["policies", "vote_runs"];
