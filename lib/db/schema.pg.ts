import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import type { BallotItem, Evidence, FilingMeta, Policy, RuleResult } from "../types";

// Postgres twin of schema.sqlite.ts (jsonb + boolean instead of JSON-in-text + 0/1). All ids are text (uuid or slug); all timestamps are ISO-8601 strings, so the SQLite and
// Postgres schemas (schema.pg.ts) have identical column names and the repo layer is shared.

export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    cik: text("cik").notNull(),
    sector: text("sector").notNull(),
    exchange: text("exchange").notNull(),
    filing: jsonb("filing").$type<FilingMeta>().notNull(),
    meeting: jsonb("meeting").$type<{ year: number; date: string | null; fiscalYear: number | null }>().notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => ({ tickerIdx: uniqueIndex("companies_ticker_uq").on(t.ticker) })
);

export const ballotItems = pgTable(
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
    facts: jsonb("facts").$type<BallotItem["facts"]>().notNull(),
    evidence: jsonb("evidence").$type<Evidence[]>().notNull(),
  },
  (t) => ({ keyIdx: uniqueIndex("ballot_items_company_key_uq").on(t.companyId, t.itemKey) })
);

export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  rules: jsonb("rules").$type<Policy["rules"]>().notNull(),
  /** Anonymous owner (gl_uid cookie value); 'system' for presets/seed. Never returned by the API. */
  ownerId: text("owner_id").notNull().default("system"),
  isPreset: boolean("is_preset").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const voteRuns = pgTable(
  "vote_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().default("system"),
    policyId: text("policy_id").notNull(),
    companyId: text("company_id").notNull(),
    createdAt: text("created_at").notNull(),
    /** Snapshots so the audit trail stays meaningful after a policy is edited or deleted. */
    policyName: text("policy_name").notNull(),
    policySnapshot: jsonb("policy_snapshot").$type<Policy>().notNull(),
    filingAccession: text("filing_accession"),
  },
  (t) => ({ byCompany: index("vote_runs_company_idx").on(t.companyId, t.policyId, t.createdAt) })
);

export const votes = pgTable(
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
    overridden: boolean("overridden").notNull(),
    overrideReason: text("override_reason"),
    overriddenAt: text("overridden_at"),
    evidence: jsonb("evidence").$type<{ rules: RuleResult[]; filing: Evidence[] }>().notNull(),
  },
  (t) => ({ byRun: index("votes_run_idx").on(t.runId) })
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ byTime: index("audit_log_time_idx").on(t.createdAt) })
);
