#!/usr/bin/env node
/**
 * End-to-end API check against a running server (live SEC calls for the ingest step).
 *   npm run dev   (use a scratch DB: SQLITE_PATH=/tmp/x.db npm run dev)
 *   BASE=http://localhost:3000 node scripts/api-check.mjs [TICKER=MSFT]
 */
import assert from "node:assert/strict";
const BASE = process.env.BASE || "http://localhost:3000";
const TICKER = process.argv[2] || "MSFT";
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
};
let n = 0;
const step = (name) => console.log(`${String(++n).padStart(2)}. ${name}`);

step("presets seeded"); {
  const { json } = await call("GET", "/api/policies/");
  assert.deepEqual(json.policies.filter((p) => p.isPreset).map((p) => p.id), ["long-term", "governance-first"]);
}
step("seed companies present and labeled seed"); {
  const { json } = await call("GET", "/api/companies/");
  for (const t of ["TSLA", "AAPL", "JPM"]) {
    const c = json.companies.find((x) => x.ticker === t);
    assert.ok(c, t); assert.equal(c.filing.origin, "seed"); assert.ok(c.fetchedAt && c.filing.sourceUrl);
  }
}
step("validation + error paths"); {
  assert.equal((await call("POST", "/api/companies/", { ticker: "not a ticker!" })).status, 400);
  const u = await call("POST", "/api/companies/", { ticker: "ZZZZNOPE" });
  assert.equal(u.status, 404); assert.equal(u.json.error.code, "unknown_ticker");
  assert.equal((await call("GET", "/api/companies/NOPE/")).status, 404);
  assert.equal((await call("PUT", "/api/policies/long-term/", { name: "x" })).status, 403);
  assert.equal((await call("DELETE", "/api/policies/long-term/")).status, 403);
  assert.equal((await call("POST", "/api/policies/", { name: "bad" })).status, 400);
}
step(`add ${TICKER} from live EDGAR`); {
  const r = await call("POST", "/api/companies/", { ticker: TICKER });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const c = r.json.company;
  assert.equal(r.json.cached, false); assert.equal(c.filing.origin, "edgar-live"); assert.equal(c.filing.form, "DEF 14A");
  assert.match(c.filing.sourceUrl, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//); assert.ok(c.fetchedAt); assert.ok(c.items.length > 0);
  assert.equal(c.filing.extraction.automated, true);
  console.log(`    ${c.name}: ${c.items.length} items, filed ${c.filing.filingDate}, extractor ${c.filing.extraction.method}`);
}
step("duplicate add hits the cache"); {
  const r = await call("POST", "/api/companies/", { ticker: TICKER.toLowerCase() });
  assert.equal(r.status, 200); assert.equal(r.json.cached, true);
}
let pol;
step("create / rename / edit / duplicate / delete policy"); {
  const base = (await call("GET", "/api/policies/long-term/")).json.policy.rules;
  let r = await call("POST", "/api/policies/", { name: "API test policy", tagline: "t", rules: base });
  assert.equal(r.status, 201); pol = r.json.policy; assert.equal(pol.isPreset, false);
  r = await call("PUT", `/api/policies/${pol.id}/`, { name: "API test renamed" });
  assert.equal(r.json.policy.name, "API test renamed");
  const rules = structuredClone(base); rules.auditorTenure.maxYears = 10;
  r = await call("PUT", `/api/policies/${pol.id}/`, { rules });
  assert.equal(r.json.policy.rules.auditorTenure.maxYears, 10);
  assert.equal((await call("PUT", `/api/policies/${pol.id}/`, { rules: { ...rules, age: { enabled: true, action: "X", maxAge: 5 } } })).status, 400);
  r = await call("POST", `/api/policies/${pol.id}/duplicate/`);
  assert.equal(r.status, 201); assert.match(r.json.policy.name, /\(copy\)/);
  assert.equal((await call("DELETE", `/api/policies/${r.json.policy.id}/`)).status, 200);
  assert.equal((await call("GET", `/api/policies/${r.json.policy.id}/`)).status, 404);
  const again = (await call("GET", `/api/policies/${pol.id}/`)).json.policy; // survives "reload"
  assert.equal(again.rules.auditorTenure.maxYears, 10);
}
let run;
step("run votes with the custom policy"); {
  const r = await call("POST", "/api/runs/", { policyId: pol.id, ticker: TICKER });
  assert.equal(r.status, 201); run = r.json.run;
  const co = (await call("GET", `/api/companies/${TICKER}/`)).json.company;
  assert.equal(run.votes.length, co.items.length);
  assert.ok(run.votes.every((v) => v.decision === v.originalDecision && !v.overridden));
  assert.equal((await call("POST", "/api/runs/", { policyId: "nope", ticker: TICKER })).status, 404);
}
step("override one vote (reason required), then read it back"); {
  const v = run.votes[0];
  assert.equal((await call("PATCH", `/api/votes/${v.id}/`, { decision: "FLAG" })).status, 400);
  const to = v.decision === "AGAINST" ? "FOR" : "AGAINST";
  const r = await call("PATCH", `/api/votes/${v.id}/`, { decision: to, reason: "Analyst disagrees with rule outcome" });
  assert.equal(r.status, 200); assert.equal(r.json.vote.overridden, true); assert.equal(r.json.vote.originalDecision, v.originalDecision);
  const back = (await call("GET", `/api/runs/${run.id}/`)).json.run.votes.find((x) => x.id === v.id);
  assert.equal(back.decision, to); assert.equal(back.overrideReason, "Analyst disagrees with rule outcome"); assert.ok(back.overriddenAt);
  const latest = (await call("GET", `/api/runs/?ticker=${TICKER}&policyId=${pol.id}&limit=1&votes=1`)).json.runs[0];
  assert.equal(latest.id, run.id);
  const c = await call("DELETE", `/api/votes/${v.id}/`);
  assert.equal(c.json.vote.overridden, false); assert.equal(c.json.vote.decision, v.originalDecision);
  await call("PATCH", `/api/votes/${v.id}/`, { decision: to, reason: "Re-applied for audit check" });
}
step("delete the policy: runs are retained with snapshots"); {
  assert.equal((await call("DELETE", `/api/policies/${pol.id}/`)).status, 200);
  const r = await call("GET", `/api/runs/${run.id}/`);
  assert.equal(r.status, 200); assert.equal(r.json.run.policyName, "API test renamed");
}
step("audit log lists company, policy, run and override events with timestamps"); {
  const { json } = await call("GET", "/api/audit/");
  const acts = new Set(json.entries.map((e) => `${e.entity}:${e.action}`));
  for (const a of ["company:ingest", "policy:create", "policy:rename", "policy:update", "policy:duplicate", "policy:delete", "vote_run:run", "vote:override", "vote:override_cleared"]) assert.ok(acts.has(a), `missing audit ${a}; have ${[...acts]}`);
  assert.ok(json.entries.every((e) => !Number.isNaN(Date.parse(e.createdAt))));
  assert.ok(json.runs.some((r) => r.id === run.id));
}
console.log(`\napi-check: all ${n} steps passed`);
