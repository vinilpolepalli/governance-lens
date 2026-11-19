import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { decideAll } from "../engine";
import { ApiError } from "../errors";
import { PRESETS } from "../policies";
import { SYSTEM_OWNER } from "../owner";
import type { AuditEntry, BallotItem, Company, DecisionVote, Policy, StoredPolicy, StoredVote, VoteRun } from "../types";
import type { Conn } from "./index";

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

type Detail = Record<string, unknown>;

export async function audit(c: Conn, entity: string, entityId: string, action: string, detail: Detail = {}): Promise<void> {
  await c.db.insert(c.schema.auditLog).values({ id: uid(), entity, entityId, action, detail, createdAt: now() });
}

// ---------- companies ----------
type CompanyRow = Conn["schema"]["companies"]["$inferSelect"];
type ItemRow = Conn["schema"]["ballotItems"]["$inferSelect"];

function toItem(r: ItemRow): BallotItem {
  return { id: r.itemKey, type: r.type as BallotItem["type"], title: r.title, subtitle: r.subtitle, boardRec: (r.boardRec as BallotItem["boardRec"]) ?? null, facts: r.facts, evidence: r.evidence };
}
function toCompany(r: CompanyRow, items: ItemRow[]): Company {
  return { ticker: r.ticker, name: r.name, cik: r.cik, sector: r.sector, exchange: r.exchange, filing: r.filing, meeting: r.meeting, fetchedAt: r.fetchedAt, items: items.sort((a, b) => a.position - b.position).map(toItem) };
}

export async function listCompanies(c: Conn): Promise<Company[]> {
  const s = c.schema;
  const rows = await c.db.select().from(s.companies).orderBy(asc(s.companies.ticker));
  const items = await c.db.select().from(s.ballotItems);
  return rows.map((r) => toCompany(r, items.filter((i) => i.companyId === r.id)));
}

export async function getCompanyRow(c: Conn, ticker: string): Promise<CompanyRow | undefined> {
  const s = c.schema;
  const rows = await c.db.select().from(s.companies).where(eq(s.companies.ticker, ticker.toUpperCase()));
  return rows[0];
}

export async function getCompany(c: Conn, ticker: string): Promise<Company | undefined> {
  const row = await getCompanyRow(c, ticker);
  if (!row) return undefined;
  const items = await c.db.select().from(c.schema.ballotItems).where(eq(c.schema.ballotItems.companyId, row.id));
  return toCompany(row, items);
}

export async function saveCompany(c: Conn, co: Company, auditDetail: Detail = {}): Promise<Company> {
  const s = c.schema;
  const id = uid();
  await c.db.insert(s.companies).values({ id, ticker: co.ticker.toUpperCase(), name: co.name, cik: co.cik, sector: co.sector, exchange: co.exchange, filing: co.filing, meeting: co.meeting, fetchedAt: co.fetchedAt });
  try {
    if (co.items.length)
      await c.db.insert(s.ballotItems).values(
        co.items.map((it, position) => ({ id: uid(), companyId: id, itemKey: it.id, position, type: it.type, title: it.title, subtitle: it.subtitle, boardRec: it.boardRec, facts: it.facts, evidence: it.evidence }))
      );
  } catch (e) {
    await c.db.delete(s.companies).where(eq(s.companies.id, id)); // no half-stored companies
    throw e;
  }
  await audit(c, "company", co.ticker.toUpperCase(), "ingest", { accession: co.filing.accession, origin: co.filing.origin, items: co.items.length, ...auditDetail });
  return (await getCompany(c, co.ticker))!;
}

// ---------- policies ----------
type PolicyRow = Conn["schema"]["policies"]["$inferSelect"];
const toPolicy = (r: PolicyRow): StoredPolicy => ({ id: r.id, name: r.name, tagline: r.tagline, rules: r.rules, isPreset: r.isPreset, createdAt: r.createdAt, updatedAt: r.updatedAt });

export async function listPolicies(c: Conn): Promise<StoredPolicy[]> {
  const rows = await c.db.select().from(c.schema.policies);
  // presets first (in their defined order), then custom by creation time
  const order = PRESETS.map((p) => p.id);
  return rows.map(toPolicy).sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function getPolicy(c: Conn, id: string): Promise<StoredPolicy | undefined> {
  const rows = await c.db.select().from(c.schema.policies).where(eq(c.schema.policies.id, id));
  return rows[0] ? toPolicy(rows[0]) : undefined;
}

async function assertOwns(c: Conn, id: string, owner: string, verb: string): Promise<void> {
  const row = (await c.db.select({ ownerId: c.schema.policies.ownerId }).from(c.schema.policies).where(eq(c.schema.policies.id, id)))[0];
  if (!row || row.ownerId === SYSTEM_OWNER || row.ownerId !== owner) throw new ApiError(403, "forbidden", `Only the person who created this policy can ${verb} it. Duplicate it to get your own editable copy.`);
}

async function requirePolicy(c: Conn, id: string): Promise<StoredPolicy> {
  const p = await getPolicy(c, id);
  if (!p) throw new ApiError(404, "policy_not_found", `No policy with id "${id}".`);
  return p;
}

export async function createPolicy(c: Conn, owner: string, input: { name: string; tagline?: string; rules: Policy["rules"] }, extra: Detail = {}): Promise<StoredPolicy> {
  const id = uid();
  const t = now();
  await c.db.insert(c.schema.policies).values({ id, name: input.name, tagline: input.tagline ?? "Custom policy.", rules: input.rules, ownerId: owner, isPreset: false, createdAt: t, updatedAt: t });
  await audit(c, "policy", id, extra.duplicatedFrom ? "duplicate" : "create", { name: input.name, ...extra });
  return (await getPolicy(c, id))!;
}

export async function updatePolicy(c: Conn, owner: string, id: string, input: { name?: string; tagline?: string; rules?: Policy["rules"] }): Promise<StoredPolicy> {
  const cur = await requirePolicy(c, id);
  if (cur.isPreset) throw new ApiError(403, "preset_readonly", "Preset policies are read-only. Duplicate it to make an editable copy.");
  await assertOwns(c, id, owner, "edit");
  const patch: Partial<PolicyRow> = { updatedAt: now() };
  const changed: string[] = [];
  if (input.name !== undefined && input.name !== cur.name) { patch.name = input.name; changed.push("name"); }
  if (input.tagline !== undefined && input.tagline !== cur.tagline) { patch.tagline = input.tagline; changed.push("tagline"); }
  if (input.rules !== undefined && JSON.stringify(input.rules) !== JSON.stringify(cur.rules)) { patch.rules = input.rules; changed.push("rules"); }
  if (changed.length === 0) return cur;
  await c.db.update(c.schema.policies).set(patch).where(eq(c.schema.policies.id, id));
  await audit(c, "policy", id, changed.length === 1 && changed[0] === "name" ? "rename" : "update", {
    changed,
    ...(patch.name ? { from: cur.name, to: patch.name } : {}),
    name: patch.name ?? cur.name,
  });
  return (await getPolicy(c, id))!;
}

export async function deletePolicy(c: Conn, owner: string, id: string): Promise<void> {
  const cur = await requirePolicy(c, id);
  if (cur.isPreset) throw new ApiError(403, "preset_readonly", "Preset policies cannot be deleted.");
  await assertOwns(c, id, owner, "delete");
  await c.db.delete(c.schema.policies).where(eq(c.schema.policies.id, id));
  const runs = await c.db.select({ id: c.schema.voteRuns.id }).from(c.schema.voteRuns).where(eq(c.schema.voteRuns.policyId, id));
  await audit(c, "policy", id, "delete", { name: cur.name, vote_runs_retained: runs.length });
}

// ---------- vote runs ----------
type RunRow = Conn["schema"]["voteRuns"]["$inferSelect"];
type VoteRow = Conn["schema"]["votes"]["$inferSelect"];

const toVote = (v: VoteRow): StoredVote => ({
  id: v.id, runId: v.runId, itemId: v.itemKey, itemTitle: v.itemTitle, itemType: v.itemType as StoredVote["itemType"], boardRec: (v.boardRec as StoredVote["boardRec"]) ?? null,
  originalDecision: v.originalDecision as DecisionVote, decision: v.decision as DecisionVote, reasoning: v.reasoning, overridden: v.overridden,
  overrideReason: v.overrideReason, overriddenAt: v.overriddenAt, evidence: v.evidence,
});

async function toRuns(c: Conn, rows: RunRow[], withVotes: boolean): Promise<VoteRun[]> {
  if (!rows.length) return [];
  const s = c.schema;
  const cos = await c.db.select().from(s.companies).where(inArray(s.companies.id, [...new Set(rows.map((r) => r.companyId))]));
  const votes = withVotes ? await c.db.select().from(s.votes).where(inArray(s.votes.runId, rows.map((r) => r.id))) : [];
  return rows.map((r) => {
    const co = cos.find((x) => x.id === r.companyId);
    return {
      id: r.id, policyId: r.policyId, policyName: r.policyName, companyId: r.companyId, ticker: co?.ticker ?? "?", companyName: co?.name ?? "(removed)",
      createdAt: r.createdAt, filingAccession: r.filingAccession,
      ...(withVotes ? { votes: votes.filter((v) => v.runId === r.id).map(toVote) } : {}),
    };
  });
}

export async function createRun(c: Conn, owner: string, policyId: string, ticker: string): Promise<VoteRun> {
  const s = c.schema;
  const policy = await requirePolicy(c, policyId);
  const company = await getCompany(c, ticker);
  const crow = await getCompanyRow(c, ticker);
  if (!company || !crow) throw new ApiError(404, "company_not_found", `Company "${ticker}" is not stored.`);
  const itemRows = await c.db.select().from(s.ballotItems).where(eq(s.ballotItems.companyId, crow.id));
  const decisions = decideAll(company, policy);
  const runId = uid();
  await c.db.insert(s.voteRuns).values({ id: runId, ownerId: owner, policyId, companyId: crow.id, createdAt: now(), policyName: policy.name, policySnapshot: { id: policy.id, name: policy.name, tagline: policy.tagline, rules: policy.rules }, filingAccession: company.filing.accession });
  try {
    if (company.items.length)
      await c.db.insert(s.votes).values(
        company.items.map((it) => {
          const d = decisions[it.id];
          return {
            id: uid(), runId, itemId: itemRows.find((r) => r.itemKey === it.id)!.id, itemKey: it.id, itemTitle: it.title, itemType: it.type, boardRec: it.boardRec,
            originalDecision: d.vote, decision: d.vote, reasoning: d.reasoning, overridden: false, overrideReason: null, overriddenAt: null,
            evidence: { rules: d.rules, filing: it.evidence },
          };
        })
      );
  } catch (e) {
    await c.db.delete(s.voteRuns).where(eq(s.voteRuns.id, runId));
    throw e;
  }
  const tally: Record<string, number> = {};
  Object.values(decisions).forEach((d) => (tally[d.vote] = (tally[d.vote] ?? 0) + 1));
  await audit(c, "vote_run", runId, "run", { ticker: company.ticker, policyId, policyName: policy.name, accession: company.filing.accession, items: company.items.length, tally });
  return (await getRun(c, runId))!;
}

export async function getRun(c: Conn, id: string): Promise<VoteRun | undefined> {
  const rows = await c.db.select().from(c.schema.voteRuns).where(eq(c.schema.voteRuns.id, id));
  return (await toRuns(c, rows, true))[0];
}

export async function listRuns(c: Conn, f: { ticker?: string; policyId?: string; limit?: number; withVotes?: boolean } = {}): Promise<VoteRun[]> {
  const s = c.schema;
  const conds = [];
  if (f.ticker) {
    const row = await getCompanyRow(c, f.ticker);
    if (!row) return [];
    conds.push(eq(s.voteRuns.companyId, row.id));
  }
  if (f.policyId) conds.push(eq(s.voteRuns.policyId, f.policyId));
  const rows = await c.db.select().from(s.voteRuns).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.voteRuns.createdAt)).limit(Math.min(f.limit ?? 50, 200));
  return toRuns(c, rows, !!f.withVotes);
}

const DECISIONS = ["FOR", "AGAINST", "FLAG", "REVIEW"];

export async function overrideVote(c: Conn, voteId: string, decision: unknown, reason: unknown): Promise<StoredVote> {
  const s = c.schema;
  if (typeof decision !== "string" || !DECISIONS.includes(decision)) throw new ApiError(400, "invalid_decision", `decision must be one of ${DECISIONS.join(", ")}.`);
  if (typeof reason !== "string" || reason.trim().length < 3) throw new ApiError(400, "reason_required", "An override reason of at least 3 characters is required.");
  if (reason.trim().length > 500) throw new ApiError(400, "reason_too_long", "Override reason must be 500 characters or fewer.");
  const rows = await c.db.select().from(s.votes).where(eq(s.votes.id, voteId));
  const cur = rows[0];
  if (!cur) throw new ApiError(404, "vote_not_found", "No such vote.");
  const t = now();
  await c.db.update(s.votes).set({ decision, overridden: decision !== cur.originalDecision, overrideReason: decision !== cur.originalDecision ? reason.trim() : null, overriddenAt: decision !== cur.originalDecision ? t : null }).where(eq(s.votes.id, voteId));
  if (decision === cur.originalDecision) {
    await audit(c, "vote", voteId, "override_cleared", { runId: cur.runId, itemKey: cur.itemKey, decision, note: "override set back to the engine decision", reason: reason.trim() });
  } else {
    await audit(c, "vote", voteId, "override", { runId: cur.runId, itemKey: cur.itemKey, itemTitle: cur.itemTitle, from: cur.decision, to: decision, originalDecision: cur.originalDecision, reason: reason.trim() });
  }
  return toVote((await c.db.select().from(s.votes).where(eq(s.votes.id, voteId)))[0]);
}

export async function clearOverride(c: Conn, voteId: string): Promise<StoredVote> {
  const s = c.schema;
  const cur = (await c.db.select().from(s.votes).where(eq(s.votes.id, voteId)))[0];
  if (!cur) throw new ApiError(404, "vote_not_found", "No such vote.");
  if (!cur.overridden) return toVote(cur);
  await c.db.update(s.votes).set({ decision: cur.originalDecision, overridden: false, overrideReason: null, overriddenAt: null }).where(eq(s.votes.id, voteId));
  await audit(c, "vote", voteId, "override_cleared", { runId: cur.runId, itemKey: cur.itemKey, restoredTo: cur.originalDecision, previousOverride: cur.decision, previousReason: cur.overrideReason });
  return toVote((await c.db.select().from(s.votes).where(eq(s.votes.id, voteId)))[0]);
}

// ---------- audit ----------
export async function listAudit(c: Conn, limit = 200): Promise<AuditEntry[]> {
  const rows = await c.db.select().from(c.schema.auditLog).orderBy(desc(c.schema.auditLog.createdAt)).limit(Math.min(limit, 1000));
  return rows.map((r) => ({ id: r.id, entity: r.entity, entityId: r.entityId, action: r.action, detail: r.detail, createdAt: r.createdAt }));
}

export { now };
