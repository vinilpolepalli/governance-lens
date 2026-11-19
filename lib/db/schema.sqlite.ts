import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { BallotItem, Evidence, FilingMeta, Policy, RuleResult } from "../types";

// All ids are text (uuid or slug); all timestamps are ISO-8601 strings, so the SQLite and
// Postgres schemas (schema.pg.ts) have identical column names and the repo layer is shared.

export const companies = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    cik: text("cik").notNull(),
    sector: text("sector").notNull(),
    exchange: text("exchange").notNull(),
    filing: text("filing", { mode: "json" }).$type<FilingMeta>().notNull(),
    meeting: text("meeting", { mode: "json" }).$type<{ year: number; date: string | null; fiscalYear: number | null }>().notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => ({ tickerIdx: uniqueIndex("companies_ticker_uq").on(t.ticker) })
);

export const ballotItems = sqliteTable(
  "ballot_items",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    /** Stable per-filing item id from the extractor, e.g. "say-on-pay", "dir-elon-musk". */
    itemKey: text("item_key").notNull(),
    position: integer("position").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull(),
    boardRec: text("board_rec"),
    facts: text("facts", { mode: "json" }).$type<BallotItem["facts"]>().notNull(),
    evidence: text("evidence", { mode: "json" }).$type<Evidence[]>().notNull(),
  },
  (t) => ({ keyIdx: uniqueIndex("ballot_items_company_key_uq").on(t.companyId, t.itemKey) })
);

export const policies = sqliteTable("policies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  rules: text("rules", { mode: "json" }).$type<Policy["rules"]>().notNull(),
  /** Anonymous owner (gl_uid cookie value); 'system' for presets/seed. Never returned by the API. */
  ownerId: text("owner_id").notNull().default("system"),
  isPreset: integer("is_preset", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const voteRuns = sqliteTable(
  "vote_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().default("system"),
    policyId: text("policy_id").notNull(),
    companyId: text("company_id").notNull(),
    createdAt: text("created_at").notNull(),
    /** Snapshots so the audit trail stays meaningful after a policy is edited or deleted. */
    policyName: text("policy_name").notNull(),
    policySnapshot: text("policy_snapshot", { mode: "json" }).$type<Policy>().notNull(),
    filingAccession: text("filing_accession"),
  },
  (t) => ({ byCompany: index("vote_runs_company_idx").on(t.companyId, t.policyId, t.createdAt) })
);

export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    itemId: text("item_id").notNull(),
    itemKey: text("item_key").notNull(),
    itemTitle: text("item_title").notNull(),
    itemType: text("item_type").notNull(),
    boardRec: text("board_rec"),
    originalDecision: text("original_decision").notNull(),
    decision: text("decision").notNull(),
    reasoning: text("reasoning").notNull(),
    overridden: integer("overridden", { mode: "boolean" }).notNull(),
    overrideReason: text("override_reason"),
    overriddenAt: text("overridden_at"),
    evidence: text("evidence", { mode: "json" }).$type<{ rules: RuleResult[]; filing: Evidence[] }>().notNull(),
  },
  (t) => ({ byRun: index("votes_run_idx").on(t.runId) })
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ byTime: index("audit_log_time_idx").on(t.createdAt) })
);
