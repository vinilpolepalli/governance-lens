export type Vote = "FOR" | "AGAINST" | "FLAG";
/** Engine output: REVIEW = assessment incomplete (no rule could evaluate the item). */
export type DecisionVote = Vote | "REVIEW";
export type RuleAction = "AGAINST" | "FLAG";

export interface Evidence {
  label: string;
  quote: string;
  derived?: boolean;
  truncated?: boolean;
}

export type ItemType = "director" | "say-on-pay" | "auditor" | "equity-plan" | "shareholder-proposal";

export interface BallotItem {
  id: string;
  type: ItemType;
  title: string;
  subtitle: string;
  /** null = the recommendation was not extracted from the filing. */
  boardRec: "FOR" | "AGAINST" | null;
  // Facts are heterogeneous per item type; the engine narrows them.
  facts: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  evidence: Evidence[];
}

export interface Extraction {
  /** "generic" | "custom:TSLA" ... - which extractor produced the items. */
  method: string;
  version: string;
  automated: true;
  /** Human-readable list of what was NOT extracted / simplified. */
  gaps: string[];
}

export interface FilingMeta {
  form: string;
  filingDate: string;
  accession: string;
  sourceUrl: string;
  indexUrl: string;
  /** "seed" = committed sample snapshot loaded at first run; "edgar-live" = fetched by POST /api/companies. */
  origin: "seed" | "edgar-live";
  extraction?: Extraction;
}

export interface Company {
  ticker: string;
  name: string;
  cik: string;
  sector: string;
  exchange: string;
  filing: FilingMeta;
  meeting: { year: number; date: string | null; fiscalYear: number | null };
  /** ISO timestamp when the filing data was fetched/loaded into this database. */
  fetchedAt: string;
  items: BallotItem[];
}

/** A stored policy (preset or user-created). */
export interface StoredPolicy extends Policy {
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredVote {
  id: string;
  runId: string;
  itemId: string;
  itemTitle: string;
  itemType: ItemType;
  boardRec: "FOR" | "AGAINST" | null;
  /** Engine decision at run time. */
  originalDecision: DecisionVote;
  /** Effective decision: override if overridden, else engine decision. */
  decision: DecisionVote;
  reasoning: string;
  overridden: boolean;
  overrideReason: string | null;
  overriddenAt: string | null;
  /** Snapshot of rule trace + filing evidence at run time. */
  evidence: { rules: RuleResult[]; filing: Evidence[] };
}

export interface VoteRun {
  id: string;
  policyId: string;
  policyName: string;
  companyId: string;
  ticker: string;
  companyName: string;
  createdAt: string;
  filingAccession: string | null;
  votes?: StoredVote[];
}

export interface AuditEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export type ProposalCategory = "independent-chair" | "political-lobbying" | "sustainability-report" | "risk-disclosure" | "other";

interface Toggle {
  enabled: boolean;
  action: RuleAction;
}

export interface Policy {
  id: string;
  name: string;
  tagline: string;
  rules: {
    overboarding: Toggle & { maxBoards: number };
    tenure: Toggle & { maxYears: number };
    age: Toggle & { maxAge: number };
    chairCeo: Toggle;
    classified: Toggle;
    payTsrGap: Toggle & { thresholdPp: number };
    payCap: Toggle & { maxUsdMillions: number };
    priorSupport: Toggle & { minPct: number };
    auditorTenure: Toggle & { maxYears: number };
    nonAuditFees: Toggle & { maxPct: number };
    equityPlanIncrease: Toggle;
    proposals: Record<ProposalCategory, Vote>;
  };
}

export interface RuleResult {
  ruleId: string;
  label: string;
  status: "triggered" | "passed" | "skipped";
  action?: RuleAction;
  text: string;
}

export interface Decision {
  vote: DecisionVote;
  reasoning: string;
  rules: RuleResult[];
}
