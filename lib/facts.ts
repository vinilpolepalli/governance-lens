import type { BallotItem } from "./types";
import { pctFmt, usd } from "./format";

/** Human-readable fact chips for a ballot item. Only facts present in the filing are shown. */
export function keyFacts(item: BallotItem): [string, string][] {
  const f = item.facts;
  const out: [string, string | null][] = [];
  switch (item.type) {
    case "director":
      out.push(["Director since", f.directorSince != null ? `${f.directorSince} (${f.tenureYears} yrs)` : f.sinceNote ? `${f.sinceNote} (tenure not computed)` : "Not extracted"]);
      out.push(["Age", f.age != null ? String(f.age) : "Not extracted"]);
      out.push(["Independent", f.independent == null ? "Not extracted" : f.independent ? "Yes" : "No"]);
      out.push(["Other public boards", f.otherPublicBoards != null ? String(f.otherPublicBoards) : "Not extracted"]);
      if (f.otherPublicBoardNames?.length) out.push(["Boards", f.otherPublicBoardNames.join(", ")]);
      if (f.committees?.length) out.push(["Committees", f.committees.join(", ")]);
      if (f.combinedChairCeo) out.push(["Role", "Chairman & CEO"]);
      if (f.classifiedBoard) out.push(["Board structure", "Classified (staggered terms)"]);
      else if (f.classifiedBoard === null) out.push(["Board structure", "Not extracted"]);
      break;
    case "say-on-pay":
      out.push([f.ceoName ? `${f.ceoName}${f.fiscalYear ? ` FY${f.fiscalYear}` : ""} total pay` : "CEO total pay", f.ceoPayLatest != null ? usd(f.ceoPayLatest) : "Not extracted"]);
      out.push(["Prior-year total", f.ceoPayPrior != null ? usd(f.ceoPayPrior) : f.ceoPayLatest != null ? "Reported as “-”" : "Not extracted"]);
      out.push(["Pay change", f.ceoPayGrowthPct != null ? pctFmt(f.ceoPayGrowthPct) : "Not extracted"]);
      out.push(["1-yr TSR (from $100 index)", f.tsrOneYearPct != null ? `${pctFmt(f.tsrOneYearPct)} (${f.tsrIndexPrior} → ${f.tsrIndexLatest})` : "Not extracted"]);
      out.push(["Prior say-on-pay support", f.priorYearSupportPct != null ? `${f.priorYearSupportPct}%` : "Not extracted"]);
      break;
    case "auditor": {
      const money = (n: number | null) =>
        n == null ? "Not extracted" : f.feeUnit === "USD millions" ? `$${n.toFixed(1)}M` : f.feeUnit === "USD thousands" ? `$${n.toLocaleString("en-US")}K` : f.feeUnit === "USD" ? `$${n.toLocaleString("en-US")}` : `${n.toLocaleString("en-US")} (unit not stated)`;
      out.push(["Auditor", f.firm]);
      out.push(["Auditor since", f.auditorSince != null ? `${f.auditorSince} (${f.tenureYears} yrs)` : "Not extracted"]);
      out.push([f.feeYear ? `Audit fees FY${f.feeYear}` : "Audit fees", money(f.auditFees)]);
      out.push(["Total fees", money(f.totalFees)]);
      out.push(["Tax + other (non-audit) share", f.nonAuditSharePct != null ? `${f.nonAuditSharePct}%` : "Not extracted"]);
      break;
    }
    case "equity-plan":
      out.push(["Share reserve", f.shareReserve.toLocaleString("en-US")]);
      out.push(["Shares remaining", f.sharesRemaining.toLocaleString("en-US")]);
      out.push(["Requests more shares", f.requestsShareIncrease ? "Yes" : "No"]);
      out.push(["Term extended to", f.extendsTermTo]);
      break;
    case "shareholder-proposal":
      out.push(["Proponent", f.proponent ?? "Not extracted"]);
      out.push(["Category", f.categoryLabel]);
      out.push(["Asks for", f.requestType]);
      break;
  }
  return out.filter((x): x is [string, string] => x[1] !== null);
}

export const TYPE_LABEL: Record<string, string> = {
  director: "Director election",
  "say-on-pay": "Say-on-pay",
  auditor: "Auditor ratification",
  "equity-plan": "Equity plan",
  "shareholder-proposal": "Shareholder proposal",
};
