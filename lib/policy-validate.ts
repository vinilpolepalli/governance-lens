import { ApiError } from "./errors";
import { LONG_TERM } from "./policies";
import type { Policy, ProposalCategory } from "./types";

const bad = (msg: string) => new ApiError(400, "invalid_policy", msg);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const NUMERIC: Record<string, [string, number, number]> = {
  overboarding: ["maxBoards", 1, 20],
  tenure: ["maxYears", 1, 80],
  age: ["maxAge", 30, 120],
  payTsrGap: ["thresholdPp", -1000, 10000],
  payCap: ["maxUsdMillions", 0, 1_000_000],
  priorSupport: ["minPct", 0, 100],
  auditorTenure: ["maxYears", 1, 200],
  nonAuditFees: ["maxPct", 0, 100],
};
const TOGGLES = ["overboarding", "tenure", "age", "chairCeo", "classified", "payTsrGap", "payCap", "priorSupport", "auditorTenure", "nonAuditFees", "equityPlanIncrease"] as const;

/** Validate and normalize a policy body. Unknown keys are dropped; every rule must be present. */
export function parsePolicyInput(body: unknown, partial = false): { name?: string; tagline?: string; rules?: Policy["rules"] } {
  if (!isObj(body)) throw bad("Body must be a JSON object.");
  const out: { name?: string; tagline?: string; rules?: Policy["rules"] } = {};
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== "string" || !body.name.trim()) throw bad("name is required.");
    if (body.name.trim().length > 80) throw bad("name must be 80 characters or fewer.");
    out.name = body.name.trim();
  }
  if (body.tagline !== undefined) {
    if (typeof body.tagline !== "string" || body.tagline.length > 240) throw bad("tagline must be a string of 240 characters or fewer.");
    out.tagline = body.tagline.trim();
  }
  if (body.rules !== undefined || !partial) {
    const r = body.rules;
    if (!isObj(r)) throw bad("rules is required.");
    const rules: Record<string, unknown> = {};
    for (const key of TOGGLES) {
      const t = r[key];
      if (!isObj(t)) throw bad(`rules.${key} is missing.`);
      if (typeof t.enabled !== "boolean") throw bad(`rules.${key}.enabled must be boolean.`);
      if (t.action !== "AGAINST" && t.action !== "FLAG") throw bad(`rules.${key}.action must be AGAINST or FLAG.`);
      const clean: Record<string, unknown> = { enabled: t.enabled, action: t.action };
      const n = NUMERIC[key];
      if (n) {
        const v = t[n[0]];
        if (typeof v !== "number" || !Number.isFinite(v) || v < n[1] || v > n[2]) throw bad(`rules.${key}.${n[0]} must be a number between ${n[1]} and ${n[2]}.`);
        clean[n[0]] = v;
      }
      rules[key] = clean;
    }
    const p = r.proposals;
    if (!isObj(p)) throw bad("rules.proposals is missing.");
    const proposals: Record<string, string> = {};
    for (const cat of Object.keys(LONG_TERM.rules.proposals) as ProposalCategory[]) {
      const v = p[cat];
      if (v !== "FOR" && v !== "AGAINST" && v !== "FLAG") throw bad(`rules.proposals.${cat} must be FOR, AGAINST or FLAG.`);
      proposals[cat] = v;
    }
    rules.proposals = proposals;
    out.rules = rules as unknown as Policy["rules"];
  }
  return out;
}
