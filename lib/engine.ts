import type { BallotItem, Company, Decision, DecisionVote, Policy, RuleAction, RuleResult, Vote } from "./types";
import { CATEGORY_LABELS } from "./policies";
import { pctFmt, usd, usdM } from "./format";

/**
 * Deterministic rule engine. Each rule reads facts extracted from the filing; if a
 * required fact is missing (null) the rule is SKIPPED, never guessed.
 * Severity order: AGAINST > FLAG > FOR. The reasoning sentence cites the fact that
 * drove the winning rule.
 */

const rank: Record<Vote, number> = { FOR: 0, FLAG: 1, AGAINST: 2 };

function res(
  ruleId: string,
  label: string,
  enabled: boolean,
  action: RuleAction,
  test: () => { applicable: boolean; hit: boolean; hitText: string; passText: string; skipText: string } | null
): RuleResult | null {
  if (!enabled) return null;
  const t = test();
  if (!t || !t.applicable) return { ruleId, label, status: "skipped", text: t?.skipText || "Required fact not extracted from the filing." };
  return t.hit
    ? { ruleId, label, status: "triggered", action, text: t.hitText }
    : { ruleId, label, status: "passed", text: t.passText };
}

function directorRules(item: BallotItem, p: Policy, company: Company): (RuleResult | null)[] {
  const f = item.facts;
  const r = p.rules;
  return [
    res("overboarding", "Public board seats", r.overboarding.enabled, r.overboarding.action, () => {
      if (f.otherPublicBoards === null || f.otherPublicBoards === undefined)
        return { applicable: false, hit: false, hitText: "", passText: "", skipText: "Other public board seats are not reliably extractable from this filing's free-text bios, so this rule was skipped." };
      const total = 1 + f.otherPublicBoards;
      return {
        applicable: true,
        hit: total > r.overboarding.maxBoards,
        hitText: `${f.name} sits on ${total} public company boards including ${company.name.replace(/,? Inc\.$/, "")}, above the policy limit of ${r.overboarding.maxBoards}.`,
        passText: `${f.name} sits on ${total} public company board${total === 1 ? "" : "s"} including this one, within the limit of ${r.overboarding.maxBoards}.`,
        skipText: "",
      };
    }),
    res("chairCeo", "Combined Chair/CEO", r.chairCeo.enabled, r.chairCeo.action, () => ({
      applicable: typeof f.combinedChairCeo === "boolean",
      hit: !!f.combinedChairCeo,
      hitText: `${f.name} serves as both Chairman and CEO, concentrating board leadership and management in one person.`,
      passText: f.isCeo ? `${f.name} is CEO but the Chair role is held separately.` : `${f.name} does not hold a combined Chair/CEO role.`,
      skipText: "Whether the Chair and CEO roles are combined was not extracted from this filing.",
    })),
    res("tenure", "Independent director tenure", r.tenure.enabled, r.tenure.action, () => {
      if (f.independent === null || f.independent === undefined) return { applicable: false, hit: false, hitText: "", passText: "", skipText: `Independence of ${f.name} was not extracted, so the independent-director tenure rule was skipped.` };
      if (!f.independent) return { applicable: false, hit: false, hitText: "", passText: "", skipText: `${f.name} is not an independent director; the tenure rule applies to independents only.` };
      if (typeof f.tenureYears !== "number") return { applicable: false, hit: false, hitText: "", passText: "", skipText: `${f.name}'s "director since" year was not extracted as a number, so tenure was not computed.` };
      return {
        applicable: true,
        hit: f.tenureYears > r.tenure.maxYears,
        hitText: `${f.name}, an independent director, has served ${f.tenureYears} years (since ${f.directorSince}), beyond the ${r.tenure.maxYears}-year threshold.`,
        passText: `${f.name} has served ${f.tenureYears} years (since ${f.directorSince}), within the ${r.tenure.maxYears}-year threshold.`,
        skipText: "",
      };
    }),
    res("age", "Director age", r.age.enabled, r.age.action, () => ({
      applicable: typeof f.age === "number",
      hit: f.age > r.age.maxAge,
      hitText: `${f.name} is ${f.age}, above the policy age limit of ${r.age.maxAge}.`,
      passText: `${f.name} is ${f.age}, within the age limit of ${r.age.maxAge}.`,
      skipText: "",
    })),
    res("classified", "Classified board", r.classified.enabled, r.classified.action, () => ({
      applicable: typeof f.classifiedBoard === "boolean",
      hit: !!f.classifiedBoard,
      hitText: `${company.name.replace(/,? Inc\.$/, "")}'s board is divided into classes with staggered terms, limiting annual accountability${f.termExpires ? ` (${f.name}'s term expires ${f.termExpires})` : ""}.`,
      passText: `Directors stand for election annually${f.termExpires ? ` (${f.termExpires})` : ""}.`,
      skipText: "Whether the board is classified was not extracted from this filing.",
    })),
  ];
}

function sayOnPayRules(item: BallotItem, p: Policy): (RuleResult | null)[] {
  const f = item.facts;
  const r = p.rules;
  return [
    res("payTsrGap", "Pay growth vs TSR", r.payTsrGap.enabled, r.payTsrGap.action, () => {
      if (f.ceoPayGrowthPct == null || f.tsrOneYearPct == null)
        return {
          applicable: false, hit: false, hitText: "", passText: "",
          skipText: f.ceoPayLatest == null
            ? "CEO pay history and pay-vs-performance data were not extracted from this filing, so pay growth vs TSR can't be computed."
            : f.ceoPayPrior === null
            ? `${f.ceoName}'s prior-year Summary Compensation Table total is reported as "-", so year-over-year pay growth can't be computed.`
            : "Pay or TSR history was not extractable.",
        };
      const gap = Math.round((f.ceoPayGrowthPct - f.tsrOneYearPct) * 10) / 10;
      return {
        applicable: true,
        hit: gap > r.payTsrGap.thresholdPp,
        hitText: `${f.ceoName}'s total pay changed ${pctFmt(f.ceoPayGrowthPct)} while one-year TSR was ${pctFmt(f.tsrOneYearPct)}, a ${gap.toFixed(1)}pp gap above the ${r.payTsrGap.thresholdPp}pp threshold.`,
        passText: `${f.ceoName}'s total pay changed ${pctFmt(f.ceoPayGrowthPct)} vs one-year TSR of ${pctFmt(f.tsrOneYearPct)} (gap ${gap.toFixed(1)}pp, threshold ${r.payTsrGap.thresholdPp}pp).`,
        skipText: "",
      };
    }),
    res("payCap", "CEO pay level", r.payCap.enabled, r.payCap.action, () => ({
      applicable: typeof f.ceoPayLatest === "number",
      hit: f.ceoPayLatest / 1e6 > r.payCap.maxUsdMillions,
      hitText: `${f.ceoName}'s reported FY${f.fiscalYear} total compensation is ${usd(f.ceoPayLatest)}, above the ${usdM(r.payCap.maxUsdMillions)} ceiling.`,
      passText: `${f.ceoName}'s reported FY${f.fiscalYear} total compensation is ${usd(f.ceoPayLatest)}, under the ${usdM(r.payCap.maxUsdMillions)} ceiling.`,
      skipText: "CEO total pay was not extracted from this filing.",
    })),
    res("priorSupport", "Prior-year say-on-pay support", r.priorSupport.enabled, r.priorSupport.action, () => ({
      applicable: typeof f.priorYearSupportPct === "number",
      hit: f.priorYearSupportPct < r.priorSupport.minPct,
      hitText: `Last year's say-on-pay received only ${f.priorYearSupportPct}% support, below the ${r.priorSupport.minPct}% floor.`,
      passText: `Last year's say-on-pay received ${f.priorYearSupportPct}% support, above the ${r.priorSupport.minPct}% floor.`,
      skipText: "",
    })),
  ];
}

function auditorRules(item: BallotItem, p: Policy): (RuleResult | null)[] {
  const f = item.facts;
  const r = p.rules;
  return [
    res("auditorTenure", "Auditor tenure", r.auditorTenure.enabled, r.auditorTenure.action, () => ({
      applicable: typeof f.tenureYears === "number",
      hit: f.tenureYears > r.auditorTenure.maxYears,
      hitText: `${f.firm} has audited the company since ${f.auditorSince} (${f.tenureYears} years), beyond the ${r.auditorTenure.maxYears}-year tenure limit.`,
      passText: `${f.firm} has audited the company since ${f.auditorSince} (${f.tenureYears} years), within the ${r.auditorTenure.maxYears}-year limit.`,
      skipText: "",
    })),
    res("nonAuditFees", "Non-audit fees", r.nonAuditFees.enabled, r.nonAuditFees.action, () => ({
      applicable: typeof f.nonAuditSharePct === "number",
      hit: f.nonAuditSharePct > r.nonAuditFees.maxPct,
      hitText: `Tax and other non-audit fees were ${f.nonAuditSharePct}% of total ${f.firm} fees in ${f.feeYear}, above the ${r.nonAuditFees.maxPct}% limit.`,
      passText: `Tax and other non-audit fees were ${f.nonAuditSharePct}% of total ${f.firm} fees in ${f.feeYear}, within the ${r.nonAuditFees.maxPct}% limit.`,
      skipText: "",
    })),
  ];
}

function equityRules(item: BallotItem, p: Policy): (RuleResult | null)[] {
  const f = item.facts;
  const r = p.rules;
  return [
    res("equityPlanIncrease", "Share reserve increase", r.equityPlanIncrease.enabled, r.equityPlanIncrease.action, () => ({
      applicable: typeof f.requestsShareIncrease === "boolean",
      hit: !!f.requestsShareIncrease,
      hitText: `The plan asks for additional shares beyond the existing reserve of ${f.shareReserve.toLocaleString("en-US")}.`,
      passText: `The proposal does not increase the ${f.shareReserve.toLocaleString("en-US")}-share reserve (${f.sharesRemaining.toLocaleString("en-US")} remain available); it only extends the plan term to ${f.extendsTermTo}.`,
      skipText: "",
    })),
  ];
}

function proposalDecision(item: BallotItem, p: Policy, company: Company): Decision {
  const f = item.facts;
  const stance: Vote = p.rules.proposals[f.category as keyof Policy["rules"]["proposals"]] ?? p.rules.proposals.other;
  const label = CATEGORY_LABELS[f.category] ?? "Other proposals";
  let base = `${f.proponent} asks the board for a ${f.requestType} in the "${label.toLowerCase()}" category.`;
  if (f.category === "independent-chair") {
    const ceoChair = company.items.find((i) => i.type === "director" && i.facts.combinedChairCeo);
    base = ceoChair
      ? `${ceoChair.facts.name} is both Chairman and CEO, and ${f.proponent} asks that the chair be independent${f.hasLeadIndependentDirector ? " (the company points to its Lead Independent Director)" : ""}.`
      : `${f.proponent} asks that the board chair be independent.`;
  }
  const tail =
    stance === "FLAG"
      ? ` The policy treats this category as case-by-case, so it is flagged for analyst review (board recommends ${item.boardRec}).`
      : ` The policy votes ${stance} on this category (board recommends ${item.boardRec}).`;
  const rule: RuleResult = {
    ruleId: "proposal-category",
    label: `Category stance: ${label}`,
    status: stance === "FOR" ? "passed" : "triggered",
    action: stance === "AGAINST" ? "AGAINST" : "FLAG",
    text: base + tail,
  };
  return { vote: stance, reasoning: base + tail, rules: [rule] };
}

export function decide(item: BallotItem, policy: Policy, company: Company): Decision {
  if (item.type === "shareholder-proposal") return proposalDecision(item, policy, company);
  let rules: (RuleResult | null)[] = [];
  if (item.type === "director") rules = directorRules(item, policy, company);
  else if (item.type === "say-on-pay") rules = sayOnPayRules(item, policy);
  else if (item.type === "auditor") rules = auditorRules(item, policy);
  else if (item.type === "equity-plan") rules = equityRules(item, policy);
  const list = rules.filter((x): x is RuleResult => !!x);
  const triggered = list.filter((x) => x.status === "triggered");
  let vote: Vote = "FOR";
  let lead: RuleResult | undefined;
  for (const t of triggered) {
    const v = (t.action ?? "FLAG") as Vote;
    if (rank[v] > rank[vote]) {
      vote = v;
      lead = t;
    }
  }
  const extra = triggered.length > 1 ? ` (${triggered.length - 1} additional rule${triggered.length > 2 ? "s" : ""} also triggered.)` : "";
  const passed = list.filter((x) => x.status === "passed");
  const skipped = list.filter((x) => x.status === "skipped");
  let outVote: DecisionVote = vote;
  let reasoning: string;
  if (lead) reasoning = lead.text + extra;
  else if (passed.length) {
    reasoning = passed[0].text + " No enabled rule triggered.";
    if (skipped.length) reasoning += ` (${skipped.length} other rule${skipped.length > 1 ? "s were" : " was"} skipped for missing facts.)`;
  } else {
    // Nothing evaluated: an incomplete assessment, never a clean FOR.
    outVote = "REVIEW";
    reasoning = skipped.length
      ? `No enabled rule could evaluate this item - ${skipped.length} rule${skipped.length > 1 ? "s" : ""} skipped for missing facts. Default board-alignment FOR not applied. ${skipped[0].text}`
      : "No enabled rule applies to this item, so nothing was evaluated. Default board-alignment FOR not applied.";
  }
  return { vote: outVote, reasoning, rules: list };
}

export function decideAll(company: Company, policy: Policy): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const it of company.items) out[it.id] = decide(it, policy, company);
  return out;
}

export function tally(decisions: Record<string, Decision>): Record<DecisionVote, number> {
  const t: Record<DecisionVote, number> = { FOR: 0, AGAINST: 0, FLAG: 0, REVIEW: 0 };
  for (const d of Object.values(decisions)) t[d.vote]++;
  return t;
}
