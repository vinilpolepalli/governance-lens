// Unit check for lib/engine.ts and the policy validator. Run: npm run test:engine
import fs from "node:fs";
import assert from "node:assert/strict";
import { decide, decideAll, tally } from "../lib/engine.ts";
import { GOVERNANCE_FIRST, LONG_TERM } from "../lib/policies.ts";
import { parsePolicyInput } from "../lib/policy-validate.ts";
import type { BallotItem, Company } from "../lib/types.ts";

const load = (t: string) => JSON.parse(fs.readFileSync(new URL(`../app/data/${t}.json`, import.meta.url), "utf8")) as Company;
const [tsla, aapl, jpm] = ["tsla", "aapl", "jpm"].map(load);
let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("  ok -", name);
};

ok("seed ballots: 5 / 12 / 17 items, every item gets a decision under both presets", () => {
  assert.deepEqual([tsla, aapl, jpm].map((c) => c.items.length), [5, 12, 17]);
  for (const c of [tsla, aapl, jpm]) for (const p of [LONG_TERM, GOVERNANCE_FIRST]) assert.equal(Object.keys(decideAll(c, p)).length, c.items.length);
});
ok("tally sums to item count", () => {
  const t = tally(decideAll(jpm, GOVERNANCE_FIRST));
  assert.equal(t.FOR + t.AGAINST + t.FLAG + t.REVIEW, jpm.items.length);
});
ok("JPM Dimon: AGAINST under Governance-first (combined Chair/CEO), not under Long-term", () => {
  const dimon = jpm.items.find((i) => i.type === "director" && i.facts.combinedChairCeo)!;
  assert.equal(decide(dimon, GOVERNANCE_FIRST, jpm).vote, "AGAINST");
  assert.notEqual(decide(dimon, LONG_TERM, jpm).vote, "AGAINST");
});
ok("Tesla: skipped rules (missing facts) never become a clean FOR", () => {
  const sop = tsla.items.find((i) => i.type === "say-on-pay")!;
  const d = decide(sop, LONG_TERM, tsla);
  assert.ok(d.rules.some((r) => r.status === "skipped"));
});
ok("missing facts => REVIEW, never a guess", () => {
  const item: BallotItem = { id: "x", type: "say-on-pay", title: "t", subtitle: "", boardRec: null, evidence: [], facts: { ceoName: null, ceoPayLatest: null, ceoPayPrior: null, ceoPayGrowthPct: null, tsrOneYearPct: null, priorYearSupportPct: null } };
  const d = decide(item, LONG_TERM, tsla);
  assert.equal(d.vote, "REVIEW");
  assert.ok(d.rules.every((r) => r.status === "skipped" && r.text.length > 10));
});
ok("director with null tenure/independence/chair facts is skipped, not passed", () => {
  const item: BallotItem = { id: "d", type: "director", title: "t", subtitle: "", boardRec: null, evidence: [], facts: { name: "A B", age: null, directorSince: null, tenureYears: null, independent: null, combinedChairCeo: null, otherPublicBoards: null, classifiedBoard: null } };
  const d = decide(item, GOVERNANCE_FIRST, tsla);
  assert.equal(d.vote, "REVIEW");
  assert.ok(d.rules.every((r) => r.status === "skipped"));
});
ok("auditor tenure threshold respected", () => {
  const item: BallotItem = { id: "a", type: "auditor", title: "t", subtitle: "", boardRec: "FOR", evidence: [], facts: { firm: "F LLP", auditorSince: 1986, tenureYears: 40, nonAuditSharePct: 5.9, feeYear: 2026 } };
  assert.equal(decide(item, LONG_TERM, tsla).vote, "FOR"); // limit 40, 40 is not > 40
  assert.equal(decide(item, GOVERNANCE_FIRST, tsla).vote, "AGAINST"); // limit 20
});
ok("policy validator accepts presets and rejects bad input", () => {
  const p = parsePolicyInput({ name: " Mine ", rules: LONG_TERM.rules });
  assert.equal(p.name, "Mine");
  assert.throws(() => parsePolicyInput({ name: "", rules: LONG_TERM.rules }));
  assert.throws(() => parsePolicyInput({ name: "x", rules: { ...LONG_TERM.rules, tenure: { enabled: true, action: "NOPE", maxYears: 5 } } }));
  assert.throws(() => parsePolicyInput({ name: "x", rules: { ...LONG_TERM.rules, age: { enabled: true, action: "FLAG", maxAge: "old" } } }));
});
console.log(`engine-check: ${n} checks passed`);
