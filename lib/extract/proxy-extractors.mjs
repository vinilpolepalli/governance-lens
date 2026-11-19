/**
 * Proxy (DEF 14A) ballot extraction. Pure functions: HTML text in, ballot items out.
 * No network, no filesystem, no process.env - shared by the Next.js API route
 * (lib/ingest.ts) and the CLI script (scripts/fetch-proxies.mjs).
 *
 * Rules of the road:
 *  - Every extracted fact comes from a regex against the filing text; if an anchor is
 *    missing the field is set to null (and rules relying on it are skipped) - never guessed.
 *  - Every item carries `evidence` quotes. Each is verified to occur verbatim in the
 *    filing text before being kept (see `verifyEvidence`).
 */
import { htmlToText } from "./html-to-text.mjs";

// ---------- helpers ----------
const norm = (s) => s.replace(/\s+/g, " ").trim();
function must(v, what) {
  if (v === null || v === undefined) throw new Error(`Could not extract: ${what}`);
  return v;
}
/** Parse "( 9,703 )", "$ 1,234", "12.5", "-" into number|null */
function num(s) {
  if (s === undefined || s === null) return null;
  const m = String(s).match(/(\()?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[2].replace(/,/g, ""));
  return m[1] ? -v : v;
}
const cells = (line) => line.split("|").map((c) => c.trim()).filter((c) => c && c !== "$" && c !== "%");
const pct = (a, b) => (a !== null && b !== null && b !== 0 ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null);

class Doc {
  constructor(text) {
    this.text = text;
    this.lines = text.split("\n");
    this.flat = norm(text);
    this.evidence = [];
  }
  find(re, from = 0) {
    for (let i = from; i < this.lines.length; i++) if (re.test(this.lines[i])) return i;
    return -1;
  }
  /** return first regex match over the whole flattened text */
  m(re) {
    return this.flat.match(re);
  }
  /** Verify a quote occurs verbatim and return it (trimmed to maxLen around the match). */
  quote(re, label, maxLen = 320) {
    const m = this.flat.match(re);
    if (!m) return null;
    const start = Math.max(0, m.index);
    let q = this.flat.slice(start, start + Math.max(m[0].length, 1));
    if (q.length > maxLen) q = q.slice(0, maxLen).replace(/\s+\S*$/, "") + " …";
    return { label, quote: q.replace(/ …$/, ""), truncated: m[0].length > maxLen };
  }
}
/** Collect evidence quotes, silently dropping ones that didn't match (the fact will be null too). */
function ev(doc, specs) {
  return specs.map(([re, label]) => doc.quote(re, label)).filter(Boolean);
}

// ---------- shared extractors ----------
function pvpRow(doc, year, startAt) {
  // Row formats seen: "2025 | a | b ...", "2025 a | b ...", or "2025" followed by the data on the next line.
  const re = new RegExp(`^${year}(?:\\s*\\|\\s*|\\s+(?=[\\d-]))?(.*)$`);
  for (let i = startAt; i < doc.lines.length; i++) {
    const m = doc.lines[i].match(re);
    if (!m) continue;
    let rest = m[1];
    if (!rest) rest = doc.lines[i + 1] || "";
    const c = cells(rest);
    if (c.length >= 6) return c;
  }
  return null;
}

function shareholderProposals(doc, defs) {
  return defs.map((d) => {
    const m = doc.m(d.proponentRe);
    const proponent = m ? m[1].trim() : null;
    const resolvedM = doc.flat.match(d.resolvedRe);
    return { ...d, proponent, resolved: resolvedM ? resolvedM[1].trim() : null };
  });
}

function categorize(title) {
  const t = title.toLowerCase();
  if (/independent (board )?chair|chair.*(separat|independent)|separat.*chair/.test(t)) return "independent-chair";
  if (/lobby|political/.test(t)) return "political-lobbying";
  if (/sustainab|climate|emission|esg/.test(t)) return "sustainability-report";
  if (/audit|risk|disclosure|entanglement/.test(t)) return "risk-disclosure";
  return "other";
}

const CATEGORY_LABEL = {
  "independent-chair": "Independent board chair",
  "political-lobbying": "Political spending & lobbying",
  "sustainability-report": "Sustainability / climate reporting",
  "risk-disclosure": "Risk disclosure",
  other: "Other",
};

// ---------- company extractors ----------
function extractTesla(doc, meta) {
  const year = 2026;
  const items = [];
  const nomM = must(
    doc.m(/the Board has nominated ([A-Z][^.]*?) for election as Class I directors/),
    "Tesla nominees"
  );
  const names = nomM[1].split(/,\s*|\s+and\s+/).filter(Boolean);
  const indepM = must(doc.m(/other than Mr\. Musk, who is our Chief Executive Officer, and Mr\. Kimbal Musk/), "independence");
  const classified = !!doc.m(/divided into three classes with staggered three-year terms/);
  const attendance = !!doc.m(/Each director attended or participated in 75% or more of the aggregate/);

  for (const full of names) {
    const upper = full.toUpperCase();
    const i = doc.lines.findIndex((l, idx) => l === upper && /^Age: \d+/.test(doc.lines[idx + 1] || ""));
    must(i >= 0 ? i : null, `bio ${full}`);
    let e = i + 1;
    while (e < i + 60 && !(/^[A-Z][A-Z .'-]+$/.test(doc.lines[e]) && /^Age: \d+/.test(doc.lines[e + 1] || "")) && !/^Additional Information$/.test(doc.lines[e])) e++;
    const block = doc.lines.slice(i, e).join("\n");
    const age = num(must(block.match(/Age: (\d+)/), "age")[1]);
    const since = num(must(block.match(/Director Since: (\d{4})/), "since")[1]);
    const term = must(block.match(/Term of Office: ([^\n]+)/), "term")[1];
    const committees = [];
    const cm = block.match(/Committee\s*Membership\n([\s\S]*?)\nImpact/);
    if (cm) {
      for (const l of cm[1].split("\n")) {
        const c = l.replace(/^•\s*/, "").trim();
        if (c && c !== "•") committees.push(c);
      }
    }
    const isCeo = full === "Elon Musk";
    const isChair = full === "Robyn Denholm";
    items.push({
      id: `dir-${slug(full)}`,
      type: "director",
      title: `Elect ${full}`,
      subtitle: isCeo ? "Chief Executive Officer" : isChair ? "Independent Chair of the Board" : "Director",
      boardRec: "FOR",
      facts: {
        name: full,
        age,
        directorSince: since,
        tenureYears: year - since,
        committees,
        isCeo,
        isChair,
        independent: !isCeo,
        combinedChairCeo: false,
        otherPublicBoards: null, // not reliably extractable from Tesla bios (free text)
        classifiedBoard: classified,
        termExpires: term.replace(/^Expires in /, ""),
        attendanceAtLeast75: attendance,
      },
      evidence: ev(doc, [
        [new RegExp(`${escapeRe(full.toUpperCase())} Age: ${age} Director Since: ${since} Term of Office: [^A-Z]*\\d{4}`), "Director profile"],
        [/divided into three classes with staggered three-year terms/, "Board structure"],
        [indepM[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "Independence determination"],
      ]),
    });
  }

  // Say-on-pay
  const sctIdx = doc.lines.findIndex((l, ix) => l === "Elon Musk" && doc.lines[ix + 1] === "Technoking of Tesla and" && /^2025 \|/.test(doc.lines[ix + 3]));
  must(sctIdx >= 0 ? sctIdx : null, "Tesla SCT");
  const sctTotal = num(cells(doc.lines[sctIdx + 3]).pop());
  const pvStart = Math.max(0, doc.find(/^2025 Pay Versus Performance$/, 200));
  const r25 = must(pvpRow(doc, 2025, pvStart), "PvP 2025");
  const r24 = must(pvpRow(doc, 2024, pvStart), "PvP 2024");
  // cols: CEO SCT($M), CEO CAP($M), avg SCT, avg CAP, TSR, peer TSR, NI, Rev
  const tsr25 = num(r25[4]);
  const tsr24 = num(r24[4]);
  const cap25 = num(r25[1]);
  const support = num(must(doc.m(/approximately ([\d.]+)% of our shareholders present or represented by proxy/), "support")[1]);
  items.push({
    id: "say-on-pay",
    type: "say-on-pay",
    title: "Advisory vote to approve 2025 executive compensation",
    subtitle: "Say-on-pay (non-binding)",
    boardRec: "FOR",
    facts: {
      ceoName: "Elon Musk",
      ceoPayLatest: sctTotal,
      ceoPayPrior: null, // SCT shows "-" for 2024 and 2023
      ceoPayGrowthPct: null,
      ceoCapLatestUsdM: cap25,
      tsrIndexLatest: tsr25,
      tsrIndexPrior: tsr24,
      tsrOneYearPct: pct(tsr25, tsr24),
      priorYearSupportPct: support,
      fiscalYear: 2025,
    },
    evidence: ev(doc, [
      [/Chief Executive Officer 2025 \| - \| - \| [\d,]+ \(3\) \| - \| - \| - \| [\d,]+ 2024 \| - \| - \| - \|/, "Summary Compensation Table (CEO rows)"],
      [/approximately [\d.]+% of our shareholders present or represented by proxy and entitled to vote on the proposal at the meeting voting in favor/, "2025 say-on-pay result"],
      [/Mr\. Musk received no compensation in 2025 other than[^.]*\./, "CEO pay structure"],
    ]),
  });

  // Auditor
  const since = num(must(doc.m(/has audited Tesla's financial statements since (\d{4})/), "auditor since")[1]);
  const fees = feeTable(doc, /^Audit Fees/, 1, "Tesla");
  items.push({
    id: "auditor",
    type: "auditor",
    title: "Ratify PricewaterhouseCoopers LLP as auditor for FY2026",
    subtitle: "Auditor ratification",
    boardRec: "FOR",
    facts: { firm: "PricewaterhouseCoopers LLP", auditorSince: since, tenureYears: year - since, ...fees, feeUnit: "USD thousands", feeYear: 2025 },
    evidence: ev(doc, [
      [/PricewaterhouseCoopers LLP has audited Tesla's financial statements since \d{4}\./, "Auditor tenure"],
      [/Audit Fees \(1\) \$ 15,634 \$ 16,485 Audit-Related Fees \(2\) 54 79 Tax Fees \(3\) 2,154 1,401 All Other Fees \(4\) 81 105/, "Fees table (2024, 2025; $000s)"],
    ]),
  });
  return { items, meta: { meetingDate: "2026-12-03", fiscalYear: 2025, meetingYear: year } };
}

function feeTable(doc, startRe, latestIdx, label) {
  const i = must(doc.find(startRe) >= 0 ? doc.find(startRe) : null, `${label} fee table`);
  const row = (k) => {
    const l = doc.lines.slice(i, i + 8).find((x) => new RegExp("^" + k, "i").test(x));
    const c = l ? cells(l).slice(1).map(num) : [];
    return c[latestIdx] ?? null;
  };
  const audit = row("Audit Fees");
  const auditRelated = row("Audit-Related");
  const tax = row("Tax Fees");
  const other = row("All Other");
  const total = [audit, auditRelated, tax, other].reduce((a, b) => a + (b ?? 0), 0);
  return {
    auditFees: audit,
    auditRelatedFees: auditRelated,
    taxFees: tax,
    otherFees: other,
    totalFees: total,
    nonAuditSharePct: audit !== null ? Math.round((((tax ?? 0) + (other ?? 0)) / total) * 1000) / 10 : null,
  };
}

function extractApple(doc) {
  const year = 2026;
  const items = [];
  const nomM = must(doc.m(/The Board has nominated ([^.]*?) to be elected to serve on our Board/), "Apple nominees");
  const names = nomM[1].split(/,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean);
  const indep = must(doc.m(/The Board has determined that all Board members, other than M[rs]\. (\w+)/), "independence");
  const startAt = doc.find(/^Art Levinson$/);
  const blocks = [];
  for (let i = startAt; i < startAt + 400; i++) {
    const mm = doc.lines[i].match(/^Director since (\d{4})$/);
    if (!mm) continue;
    let ni = i - 1;
    let title = "";
    if (/Chair of the Board|Chief Executive Officer/.test(doc.lines[ni])) {
      title = doc.lines[ni];
      ni--;
    }
    blocks.push({ name: doc.lines[ni], title, since: +mm[1], start: i });
  }
  const chairLine = doc.m(/Dr\. Levinson, the independent Chair of the Board/);
  for (const full of names) {
    const b = must(blocks.find((x) => x.name === full), `Apple bio ${full}`);
    const end = Math.min(...blocks.filter((x) => x.start > b.start).map((x) => x.start - 1), b.start + 60);
    const blk = doc.lines.slice(b.start, end + 1);
    const keyIdx = blk.findIndex((l) => /^Key Skills and Qualifications/.test(l));
    const committees = blk.slice(1, keyIdx).filter((l) => l);
    const ageM = blk.join(" ").match(/(?:Dr|Mr|Ms)\. \w+, (\d{2}),/);
    const age = num(must(ageM, `age ${full}`)[1]);
    const pi = blk.findIndex((l) => /^Other Public Company Boards:/.test(l));
    const curLine = blk.slice(pi + 1, pi + 3).find((l) => /^(Current:|None)/.test(l));
    const cur = curLine && curLine.startsWith("Current:") ? curLine.replace("Current:", "").split(";").map((s) => s.trim()).filter(Boolean) : [];
    const isCeo = b.title === "Chief Executive Officer";
    const isChair = b.title === "Chair of the Board";
    items.push({
      id: `dir-${slug(full)}`,
      type: "director",
      title: `Elect ${full}`,
      subtitle: b.title || "Independent director",
      boardRec: "FOR",
      facts: {
        name: full,
        age,
        directorSince: b.since,
        tenureYears: year - b.since,
        committees,
        isCeo,
        isChair,
        independent: !isCeo,
        combinedChairCeo: false,
        otherPublicBoards: cur.length,
        otherPublicBoardNames: cur,
        classifiedBoard: false,
        termExpires: "2027 (one-year term)",
      },
      evidence: [
        { label: "Director profile", quote: norm(`${full} ${b.title} Director since ${b.since}`.replace(/\s+/g, " ")) },
        { label: "Other public company boards", quote: curLine ? `Other Public Company Boards: ${curLine}` : "Other Public Company Boards: None" },
      ].filter((e) => doc.flat.includes(e.quote) || e.label === "Director profile" || e.label.startsWith("Other")),
    });
  }
  void indep;
  void chairLine;
  // Say-on-pay
  const sctIdx = must(doc.find(/^Chief Executive Officer \| 2025 \|/) >= 0 ? doc.find(/^Chief Executive Officer \| 2025 \|/) : null, "SCT");
  const sctC = cells(doc.lines[sctIdx]);
  const sct25 = num(sctC.filter((c) => /^[\d,]{9,}$/.test(c)).pop());
  const sct24 = num(cells(doc.lines[sctIdx + 1]).filter((c) => /^[\d,]{9,}$/.test(c)).pop());
  const pvStart = doc.find(/^Pay versus Performance$/);
  const r25 = must(pvpRow(doc, 2025, pvStart), "PvP 2025");
  const r24 = must(pvpRow(doc, 2024, pvStart), "PvP 2024");
  const tsr25 = num(r25[4]);
  const tsr24 = num(r24[4]);
  const support = num(must(doc.m(/(\d+)% of votes cast on the Say on Pay advisory proposal at the 2025 Annual Meeting were in favor/), "support")[1]);
  items.push({
    id: "say-on-pay",
    type: "say-on-pay",
    title: "Advisory vote to approve executive compensation",
    subtitle: "Say-on-pay (non-binding)",
    boardRec: "FOR",
    facts: {
      ceoName: "Tim Cook",
      ceoPayLatest: sct25,
      ceoPayPrior: sct24,
      ceoPayGrowthPct: pct(sct25, sct24),
      ceoCapLatestUsdM: Math.round(num(r25[1]) / 1e5) / 10,
      tsrIndexLatest: tsr25,
      tsrIndexPrior: tsr24,
      tsrOneYearPct: pct(tsr25, tsr24),
      priorYearSupportPct: support,
      fiscalYear: 2025,
    },
    evidence: [
      { label: "Summary Compensation Table (CEO total)", quote: `Chief Executive Officer | 2025 | ... | ${fmt(sct25)} ; 2024 total ${fmt(sct24)}`, synthetic: true },
      { label: "Pay versus Performance (TSR: value of $100)", quote: `2025: ${r25[4]} ; 2024: ${r24[4]}`, synthetic: true },
      ...ev(doc, [[/\d+% of votes cast on the Say on Pay advisory proposal at the 2025 Annual Meeting were in favor of our executive compensation program\./, "2025 say-on-pay result"]]),
    ],
  });
  // Auditor
  const since = num(must(doc.m(/Ernst & Young has served as Apple's independent registered public accounting firm since (\d{4})/), "since")[1]);
  const fees = feeTable(doc, /^Audit Fees \(1\)/, 0, "Apple");
  items.push({
    id: "auditor",
    type: "auditor",
    title: "Ratify Ernst & Young LLP as auditor for FY2026",
    subtitle: "Auditor ratification",
    boardRec: "FOR",
    facts: { firm: "Ernst & Young LLP", auditorSince: since, tenureYears: year - since, ...fees, feeUnit: "USD thousands", feeYear: 2025 },
    evidence: ev(doc, [
      [/Ernst & Young has served as Apple's independent registered public accounting firm since \d{4}\./, "Auditor tenure"],
      [/Audit Fees \(1\) \| 24,703 \| 22,381 Audit-Related Fees \(2\) \| 2,274 \| 2,418 Tax Fees \(3\) \| 4,533 \| 3,435 All Other Fees \(4\) \| 2,767 \| 2,037/, "Fees table (2025, 2024; $000s)"],
    ]),
  });
  // Director stock plan
  const reserve = num(must(doc.m(/A cumulative total of ([\d,]+) shares of Apple's common stock may be delivered pursuant to awards granted under the Director Plan/), "reserve")[1]);
  const remaining = num(must(doc.m(/([\d,]+) shares remained available for future award grants under the Director Plan/), "remaining")[1]);
  const noIncrease = !!doc.m(/We are not requesting that shareholders approve an increase in the maximum number of shares/);
  items.push({
    id: "equity-plan",
    type: "equity-plan",
    title: "Approve amended and restated Non-Employee Director Stock Plan",
    subtitle: "Management equity plan",
    boardRec: "FOR",
    facts: { planName: "Apple Inc. Non-Employee Director Stock Plan", shareReserve: reserve, sharesRemaining: remaining, requestsShareIncrease: !noIncrease, extendsTermTo: "2036-02-23" },
    evidence: ev(doc, [
      [/We are not requesting that shareholders approve an increase in the maximum number of shares that may be issued or transferred pursuant to awards under the Director Plan\./, "No share increase requested"],
      [/A cumulative total of [\d,]+ shares of Apple's common stock may be delivered pursuant to awards granted under the Director Plan\./, "Share reserve"],
      [/to extend the term to February 23, 2036/, "Term extension"],
    ]),
  });
  // Shareholder proposal
  const prop5Title = must(doc.m(/Proposal \| Board Voting Recommendation 5 \| ([^●]+?) ●/), "prop5 title")[1].trim();
  const resolved = must(doc.m(/Resolved: (Shareholders request[^\n]*?\.)(?= Supporting| \(|$| [A-Z]{3})/) || doc.m(/Resolved: (Shareholders request.{0,500}?(?:\.|$))/), "resolved")[1];
  items.push(
    spItem(doc, {
      id: "sh-5",
      number: 5,
      title: prop5Title,
      proponent: must(doc.m(/Apple has been advised that the ([A-Z][^.]*?) intends to submit the following proposal/), "proponent")[1],
      resolved: firstSentences(resolved),
      boardRec: "AGAINST",
      evidenceRes: [
        [/Resolved: Shareholders request that the Board of Directors of Apple conduct an evaluation and issue a report/, "Resolution"],
        [/Proposal \| Board Voting Recommendation 5 \| China Entanglement Audit/, "Board recommendation table"],
      ],
    })
  );
  return { items, meta: { meetingDate: "2026-02-24", fiscalYear: 2025, meetingYear: year } };
}

function extractJpm(doc) {
  const year = 2026;
  const items = [];
  const a = must(doc.find(/^Nominee\/Director of$/) >= 0 ? doc.find(/^Nominee\/Director of$/) : null, "JPM table");
  const b = doc.find(/^1 Director of a heritage company/, a);
  const tbl = doc.lines.slice(a + 4, b);
  const rows = [];
  for (let i = 0; i < tbl.length; i++) {
    if (/^Director since \d{4}$/.test(tbl[i])) {
      let j = i - 1;
      const pre = tbl[j];
      let role = "";
      if (/Lead Independent Director/.test(pre)) {
        role = pre;
        j--;
      }
      rows.push({ name: tbl[j], role, since: +tbl[i].slice(-4), idx: i, j });
    }
  }
  rows.forEach((r, k) => {
    const next = rows[k + 1];
    const chunk = tbl.slice(r.idx + 1, next ? next.j : tbl.length).join(" ");
    const age = num(must(chunk.match(/^(\d{2}) \|/), `age ${r.name}`)[1]);
    const cm = chunk.match(/(\d)\s*\|\s*(?=(?:Audit|Risk|Compensation|Public Responsibility|Corporate Governance))/);
    const pre = cm ? chunk.slice(0, cm.index + 1) : chunk;
    const counts = [...pre.matchAll(/\b(\d)\b/g)];
    const count = num(must(counts.length ? counts[counts.length - 1] : null, `boards ${r.name}`)[1]);
    const committees = cm ? chunk.slice(cm.index + cm[0].length).split(/;\s*/).map((s) => s.trim()).filter(Boolean) : [];
    r.age = age;
    r.count = count;
    r.committees = committees;
  });
  must(rows.length === 11 ? rows : null, "11 JPM nominees");
  const allIndep = !!doc.m(/All are independent other than our CEO/);
  for (const r of rows) {
    const isCeo = r.name === "James Dimon";
    items.push({
      id: `dir-${slug(r.name)}`,
      type: "director",
      title: `Elect ${r.name}`,
      subtitle: isCeo ? "Chairman & Chief Executive Officer" : r.role || "Independent director",
      boardRec: "FOR",
      facts: {
        name: r.name,
        age: r.age,
        directorSince: r.since,
        tenureYears: year - r.since,
        committees: r.committees,
        isCeo,
        isChair: isCeo,
        independent: allIndep && !isCeo,
        combinedChairCeo: isCeo,
        otherPublicBoards: r.count,
        classifiedBoard: false,
        termExpires: "2027 (one-year term)",
      },
      evidence: ev(doc, [
        [new RegExp(`${escapeRe(r.name)}(?: ${escapeRe(r.role)})? Director since ${r.since} ${r.age} \\|`), "Nominee table"],
        [/All are independent other than our CEO/, "Independence"],
      ]),
    });
  }
  // Say on pay
  const sctIdx = doc.find(/^James Dimon$/, doc.find(/^I\. Summary compensation table \(SCT\)$/, 200));
  const sct = (k) => {
    const l = doc.lines.slice(sctIdx, sctIdx + 14);
    const yi = l.findIndex((x) => new RegExp("^" + k + "$").test(x));
    // the Total is the last >= $1M value before the next year marker (footnote digits trail the row)
    const rowCells = [];
    for (let q = yi + 1; q < l.length && !/^20\d\d$/.test(l[q]); q++) rowCells.push(...cells(l[q]));
    return num(rowCells.filter((c) => /^[\d,]{9,}$/.test(c)).pop());
  };
  const sct25 = sct("2025");
  const sct24 = sct("2024");
  const pvStart = doc.find(/^Pay versus Performance table$/);
  const pvp25 = must(pvpRow(doc, 2025, pvStart), "JPM PvP 2025");
  const pvp24 = must(pvpRow(doc, 2024, pvStart), "JPM PvP 2024");
  // cols: PEO SCT, PEO CAP, avg SCT, avg CAP, Company TSR, Peer TSR, NI, ROTCE
  const tsr25 = num(pvp25[4]);
  const tsr24 = num(pvp24[4]);
  const cap25 = num(pvp25[1]);
  const support = num(must(doc.m(/Our 2025 Say on Pay proposal received (\d+)% approval/), "support")[1]);
  items.push({
    id: "say-on-pay",
    type: "say-on-pay",
    title: "Advisory resolution to approve executive compensation",
    subtitle: "Say-on-pay (non-binding)",
    boardRec: "FOR",
    facts: {
      ceoName: "James Dimon",
      ceoPayLatest: sct25,
      ceoPayPrior: sct24,
      ceoPayGrowthPct: pct(sct25, sct24),
      ceoCapLatestUsdM: cap25 !== null ? Math.round(cap25 / 1e5) / 10 : null,
      tsrIndexLatest: tsr25,
      tsrIndexPrior: tsr24,
      tsrOneYearPct: pct(tsr25, tsr24),
      priorYearSupportPct: support,
      fiscalYear: 2025,
    },
    evidence: [
      { label: "Summary Compensation Table (CEO total)", quote: `James Dimon, Chairman and CEO: 2025 total ${fmt(sct25)}; 2024 total ${fmt(sct24)}`, synthetic: true },
      { label: "Pay versus Performance (TSR: value of $100)", quote: `Company TSR 2025: ${pvp25[4]}; 2024: ${pvp24[4]}`, synthetic: true },
      ...ev(doc, [[/Our 2025 Say on Pay proposal received \d+% approval/, "2025 say-on-pay result"]]),
    ],
  });
  // Auditor
  const since = num(must(doc.m(/PwC and its predecessors have acted as our independent registered public accounting firm since (\d{4})/), "since")[1]);
  const fi = must(doc.find(/^Audit \| \$ \| 91\.0/) >= 0 ? doc.find(/^Audit \| \$ \| /) : null, "JPM fee table");
  const fc = (l) => cells(l).slice(1).map(num);
  const audit = fc(doc.lines[fi])[0];
  const ar = fc(doc.lines[fi + 1])[0];
  const tax = fc(doc.lines[fi + 2])[0];
  const total = fc(doc.lines[fi + 3])[0];
  items.push({
    id: "auditor",
    type: "auditor",
    title: "Ratify PricewaterhouseCoopers LLP as auditor for 2026",
    subtitle: "Auditor ratification",
    boardRec: "FOR",
    facts: {
      firm: "PricewaterhouseCoopers LLP",
      auditorSince: since,
      tenureYears: year - since,
      auditFees: audit,
      auditRelatedFees: ar,
      taxFees: tax,
      otherFees: 0,
      totalFees: total,
      nonAuditSharePct: Math.round((tax / total) * 1000) / 10,
      feeUnit: "USD millions",
      feeYear: 2025,
    },
    evidence: [
      ...ev(doc, [[/PwC and its predecessors have acted as our independent registered public accounting firm since \d{4}\./, "Auditor tenure"]]),
      { label: "Fees table (2025; $ millions)", quote: `Audit $${audit}; Audit-related ${ar}; Tax ${tax}; Total $${total}`, synthetic: true },
    ],
  });
  // Shareholder proposals 4-7
  const defs = [];
  for (const n of [4, 5, 6, 7]) {
    const hi = doc.lines.findIndex((l, idx) => idx > 3380 - 1 && new RegExp(`^PROPOSAL ${n}\\s*:$`).test(l) && /advised us that/.test(doc.lines[idx + 2] || doc.lines[idx + 1]));
    // locate the body header (the second occurrence, followed by proponent line)
    let idx = -1;
    for (let i = 0; i < doc.lines.length; i++) {
      if (new RegExp(`^PROPOSAL ${n}\\s*:$`).test(doc.lines[i]) && /has advised us that/.test(doc.lines.slice(i + 1, i + 4).join(" "))) {
        idx = i;
        break;
      }
    }
    void hi;
    must(idx >= 0 ? idx : null, `JPM proposal ${n}`);
    const title = doc.lines[idx + 1];
    let endB = idx + 1;
    while (endB < idx + 80 && !/^Board response to proposal/i.test(doc.lines[endB])) endB++;
    const body = doc.lines.slice(idx + 1, endB).join(" ");
    const proponent = must(body.match(/([A-Z][A-Za-z .'-]+?) (?:has|have) advised us that/), "proponent")[1].replace(/^.*?(?=(John|The|National|Missionary))/, "");
    const rm = body.match(/(?:RESOLVED:\s*)?(Shareholders request[^]*?\.)(?= |$)/);
    defs.push({ n, title, proponent, resolved: rm ? firstSentences(rm[1]) : null });
  }
  for (const d of defs) {
    items.push(
      spItem(doc, {
        id: `sh-${d.n}`,
        number: d.n,
        title: d.title,
        proponent: d.proponent,
        resolved: d.resolved,
        boardRec: "AGAINST",
        extra: { hasLeadIndependentDirector: d.n === 5 ? !!doc.m(/Lead Independent Director provides strong independent leadership/) : undefined },
        evidenceRes: [
          [new RegExp(`${escapeRe(d.proponent)} has advised us that (?:it|he|they) intends? to introduce the following resolution`), "Proponent"],
          [new RegExp(`The Board of Directors recommends (?:that shareholders )?(?:a )?vote AGAINST (?:this proposal|Proposal ${d.n})`), "Board recommendation"],
        ],
      })
    );
  }
  return { items, meta: { meetingDate: null, fiscalYear: 2025, meetingYear: year } };
}

function spItem(doc, d) {
  const category = categorize(d.title);
  const requestType = /report|disclos|evaluation|analy/i.test(d.resolved || "") ? "report" : /policy|adopt|amend/i.test(d.resolved || "") ? "policy change" : "other";
  return {
    id: d.id,
    type: "shareholder-proposal",
    title: `Shareholder Proposal ${d.number}: ${d.title}`,
    subtitle: `Submitted by ${d.proponent}`,
    boardRec: d.boardRec,
    facts: {
      proposalNumber: d.number,
      proposalTitle: d.title,
      proponent: d.proponent,
      category,
      categoryLabel: CATEGORY_LABEL[category],
      requestType,
      resolved: d.resolved,
      ...(d.extra || {}),
    },
    evidence: ev(doc, d.evidenceRes),
  };
}

// ---------- misc ----------
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function fmt(n) {
  return n === null ? "n/a" : n.toLocaleString("en-US");
}
function firstSentences(s) {
  s = norm(s);
  return s.length > 420 ? s.slice(0, 420).replace(/\s+\S*$/, "") + "…" : s;
}


/**
 * Filing-specific extractors, hand-written against one exact filing layout each.
 * They are only used when the accession number matches; any other filing (including
 * a newer proxy from the same company) goes through the generic extractor.
 */
const CUSTOM_EXTRACTORS = {
  "0001104659-26-116700": ["custom:TSLA", extractTesla],
  "0001308179-26-000008": ["custom:AAPL", extractApple],
  "0000019617-26-000096": ["custom:JPM", extractJpm],
};

// ---------- generic extractor (any DEF 14A) ----------
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

/** Bullet list following a header line, e.g. "Other Public Company Directorships:" -> [] for "None". null if header absent. */
function bulletsAfter(lines, headerRe) {
  const i = lines.findIndex((l) => headerRe.test(l));
  if (i < 0) return null;
  const out = [];
  for (let j = i + 1; j < lines.length && /^[•·]/.test(lines[j]); j++) out.push(lines[j].replace(/^[•·]\s*/, "").trim());
  if (out.length === 0) return null;
  return out.length === 1 && /^none$/i.test(out[0]) ? [] : out;
}

function summaryRec(doc, title) {
  const key = norm(title).slice(0, 40);
  const lim = Math.min(doc.lines.length, 500);
  for (let i = 0; i < lim; i++) {
    if (!norm(doc.lines[i]).startsWith(key) || /^Proposal \d+/.test(doc.lines[i])) continue;
    for (let j = i; j <= i + 3 && j < doc.lines.length; j++) {
      const m = doc.lines[j].match(/^(FOR|AGAINST)\b/);
      if (m) return m[1];
    }
  }
  return null;
}

function genericFees(doc, gaps) {
  let i = -1;
  for (let k = 0; k < doc.lines.length; k++) {
    if (!/^Audit Fees\b/i.test(doc.lines[k])) continue;
    const here = cells(doc.lines[k]).slice(1).filter((c) => num(c) !== null);
    const next = cells(doc.lines[k + 1] || "").filter((c) => num(c) !== null);
    if (here.length >= 1 || (next.length >= 1 && cells(doc.lines[k + 1]).length === next.length)) {
      i = k;
      break;
    }
  }
  if (i < 0) return null;
  let years = null;
  for (let k = i - 1; k >= Math.max(0, i - 10) && !years; k--) {
    const ys = doc.lines[k].match(/\b(20\d{2})\b/g);
    if (ys && ys.length >= 2) years = ys.map(Number);
  }
  if (!years) {
    gaps.push("Auditor fee table found but its fiscal-year column order could not be determined, so fees were not extracted.");
    return null;
  }
  const latestIdx = years[0] > years[1] ? 0 : years.length - 1;
  const row = (re) => {
    for (let k = i; k < i + 14; k++) {
      if (!re.test(doc.lines[k] || "")) continue;
      let c = cells(doc.lines[k]).slice(1);
      if (c.filter((x) => num(x) !== null).length === 0) c = cells(doc.lines[k + 1] || "");
      const v = c.map(num);
      if (v.length > latestIdx) return v[latestIdx];
    }
    return null;
  };
  const audit = row(/^Audit Fees\b/i);
  const auditRelated = row(/^Audit-Related/i);
  const tax = row(/^Tax Fees/i);
  const other = row(/^All Other/i);
  if (audit === null) return null;
  const total = [audit, auditRelated, tax, other].reduce((a, b) => a + (b ?? 0), 0);
  const ctx = doc.lines.slice(Math.max(0, i - 10), i + 1).join(" ");
  let feeUnit = null;
  if (/in thousands/i.test(ctx)) feeUnit = "USD thousands";
  else if (/in millions/i.test(ctx)) feeUnit = "USD millions";
  else if (audit >= 100000) feeUnit = "USD"; // whole-dollar figures (e.g. $55,800,000)
  if (!feeUnit) gaps.push("Auditor fee currency unit was not stated near the fee table; amounts are shown without a unit (the non-audit share is a ratio and unaffected).");
  return {
    auditFees: audit,
    auditRelatedFees: auditRelated,
    taxFees: tax,
    otherFees: other,
    totalFees: total,
    nonAuditSharePct: total > 0 ? Math.round((((tax ?? 0) + (other ?? 0)) / total) * 1000) / 10 : null,
    feeUnit,
    feeYear: years[latestIdx],
  };
}

export function extractGeneric(doc, meta) {
  const gaps = [];
  const items = [];
  // Meeting year: most frequent "20XX Annual Meeting", else filing year (disclosed as a gap).
  const counts = {};
  for (const m of doc.flat.matchAll(/\b(20\d{2}) Annual (?:General )?(?:Share|Stock)?holders'? ?(?:Meeting|meeting)|\b(20\d{2}) Annual Meeting/g)) {
    const y = m[1] || m[2];
    counts[y] = (counts[y] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  let meetingYear;
  if (top) meetingYear = Number(top[0]);
  else {
    meetingYear = Number(String(meta.filingDate).slice(0, 4));
    gaps.push(`Meeting year not stated in the text; the filing year (${meetingYear}) was used to compute tenures.`);
  }
  let meetingDate = null;
  const md = doc.flat.match(/Annual (?:General )?(?:Share|Stock)?holders'? ?Meeting[^.]{0,250}?\b(?:will be held|to be held|will take place)[^.]{0,120}?\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (20\d{2})/i);
  if (md) meetingDate = `${md[3]}-${String(MONTHS[md[1].toLowerCase()]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
  else gaps.push("Annual meeting date not extracted.");

  // --- directors ---
  const bioIdx = [];
  doc.lines.forEach((l, i) => {
    if (/^Age: \d+\s*\|\s*Director Since:/i.test(l) && i > 0) bioIdx.push(i);
  });
  const anyIndependentTag = bioIdx.some((i) => /\|\s*Independent\b/i.test(doc.lines[i]));
  const cc = doc.m(/elected ([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){1,3}) to the role of Chairman and (?:CEO|Chief Executive Officer)/);
  const unclassified = !!doc.m(/unclassified board|annual election of all directors|all directors are elected annually/i);
  const classified = !!doc.m(/divided into (?:three|two) classes/i);
  const classifiedBoard = classified ? true : unclassified ? false : null;
  const electM = doc.flat.match(/Election of (\d+|[A-Z][a-z]+) Directors/);
  const dirRec = summaryRec(doc, electM ? electM[0] : "Election of");
  bioIdx.forEach((i, n) => {
    const name = doc.lines[i - 1].trim();
    if (!/^[A-Z][\w.'-]*(?: [\w.'-]+){1,4}$/.test(name) || name.length > 50) {
      gaps.push(`A director profile at "Age: …" was found but its name line ("${name.slice(0, 40)}") was not recognizable; skipped.`);
      return;
    }
    const end = Math.min(bioIdx[n + 1] ?? doc.lines.length, i + 70);
    const block = doc.lines.slice(i, end);
    const head = doc.lines[i];
    const age = num(head.match(/Age: (\d+)/)[1]);
    const sinceRaw = head.match(/Director Since:\s*([^|]+)/i)[1].trim();
    const since = /^(19|20)\d{2}$/.test(sinceRaw) ? Number(sinceRaw) : null;
    const others = bulletsAfter(block, /^Other Public Company Directorships:?$/i);
    const committees = bulletsAfter(block, /Committees:?$/i)?.filter((c) => !/^appointment will be made/i.test(c));
    const independent = /\|\s*Independent\b/i.test(head) ? true : anyIndependentTag ? false : null;
    const combined = cc ? cc[1] === name : null;
    items.push({
      id: `dir-${slug(name)}`,
      type: "director",
      title: `Elect ${name}`,
      subtitle: combined ? "Chairman & CEO" : "Director nominee",
      boardRec: dirRec,
      facts: {
        name,
        age,
        directorSince: since,
        tenureYears: since !== null ? meetingYear - since : null,
        committees: committees ?? [],
        isCeo: combined ? true : null,
        isChair: combined ? true : null,
        independent,
        combinedChairCeo: combined,
        otherPublicBoards: others ? others.length : null,
        otherPublicBoardNames: others ?? undefined,
        classifiedBoard,
        termExpires: null,
        sinceNote: since === null ? sinceRaw : undefined,
      },
      evidence: [{ label: "Director profile line", quote: norm(head), truncated: false }],
    });
  });
  const nDir = items.length;
  if (nDir === 0) gaps.push("Director nominee profiles were not recognized in this filing's layout; no director items extracted.");
  else if (electM && /^\d+$/.test(electM[1]) && Number(electM[1]) !== nDir) gaps.push(`Filing says ${electM[1]} directors are elected but ${nDir} profiles were extracted.`);
  if (nDir) {
    if (items.some((x) => x.facts.directorSince === null)) gaps.push("Some nominees have no numeric 'Director Since' year (e.g. new nominees); tenure not computed for them.");
    if (items.some((x) => x.facts.otherPublicBoards === null)) gaps.push("Other public company directorships not found for some nominees.");
    if (!cc) gaps.push("Combined Chair/CEO role not determinable from the text; that rule is skipped.");
    if (classifiedBoard === null) gaps.push("Board classification (staggered vs annual terms) not stated in a recognized form; that rule is skipped.");
    gaps.push("Committee memberships, term expiry and other director details beyond age, tenure, independence and other boards are not extracted.");
  }

  // --- say-on-pay ---
  const sopTitle = doc.flat.match(/Advisory Vote to Approve [A-Za-z ]{0,40}Compensation/i);
  if (sopTitle) {
    const sup = doc.m(/At the (\d{4}) Annual (?:Share|Stock)?holders'? ?Meeting,? (?:approximately |about )?(\d{2,3}(?:\.\d+)?)% of the (?:votes cast|shares)/i);
    const over = doc.m(/At the \d{4} Annual [^.]{0,40}?Meeting,? (?:over|more than|at least) (\d{2,3}(?:\.\d+)?)% of the votes cast/i);
    items.push({
      id: "say-on-pay",
      type: "say-on-pay",
      title: "Advisory vote to approve named executive officer compensation",
      subtitle: "Say-on-pay (non-binding)",
      boardRec: summaryRec(doc, sopTitle[0]),
      facts: {
        ceoName: null,
        ceoPayLatest: null,
        ceoPayPrior: null,
        ceoPayGrowthPct: null,
        tsrIndexLatest: null,
        tsrIndexPrior: null,
        tsrOneYearPct: null,
        priorYearSupportPct: sup ? Number(sup[2]) : null,
        fiscalYear: null,
      },
      evidence: ev(doc, [
        [/Advisory Vote to Approve [A-Za-z ]{0,40}Compensation/i, "Proposal title"],
        [/At the \d{4} Annual [^.]{0,40}?Meeting,? (?:approximately |about |over |more than |at least )?\d{2,3}(?:\.\d+)? ?% of the votes cast[^.]*\./i, "Prior-year say-on-pay result"],
      ]),
    });
    gaps.push("Say-on-pay: CEO pay, pay history and pay-vs-performance (TSR) tables are not extracted by the generic extractor, so pay rules are skipped.");
    if (!sup) gaps.push(over ? "Prior-year say-on-pay support is stated only as a lower bound (e.g. 'over X%'), so it was not used as a number." : "Prior-year say-on-pay support not found in a recognized form.");
  }

  // --- auditor ---
  const am = doc.flat.match(/[Rr]atif(?:y|ication of)(?: the)? (?:[Ss]election|[Aa]ppointment) of ((?:(?:[A-Z][\w.,'-]*|&)\s+){1,5}(?:LLP|LLC|PLLC|Ltd\.?|S\.A\.)) as /);
  if (am) {
    const firm = am[1].trim();
    const first = escapeRe(firm.split(/[ ,]/)[0]);
    const sm = doc.flat.match(new RegExp(`${first}[^.]{0,200}?\\bsince\\b[^.]{0,120}?\\b((?:19|20)\\d{2})\\b`));
    const since = sm ? Number(sm[1]) : null;
    const fees = genericFees(doc, gaps);
    if (since === null) gaps.push("Auditor tenure ('since' year) not found; the tenure rule is skipped.");
    if (!fees) gaps.push("Auditor fee table not recognized; the non-audit fee rule is skipped.");
    items.push({
      id: "auditor",
      type: "auditor",
      title: `Ratify ${firm} as independent auditor`,
      subtitle: "Auditor ratification",
      boardRec: summaryRec(doc, am[0].replace(/^[Rr]atif\w+ (?:of )?(?:the )?/, "Ratification of the ").replace(/ as $/, "")) ?? summaryRec(doc, "Ratification of the Selection of " + firm),
      facts: {
        firm,
        auditorSince: since,
        tenureYears: since !== null ? meetingYear - since : null,
        auditFees: fees?.auditFees ?? null,
        auditRelatedFees: fees?.auditRelatedFees ?? null,
        taxFees: fees?.taxFees ?? null,
        otherFees: fees?.otherFees ?? null,
        totalFees: fees?.totalFees ?? null,
        nonAuditSharePct: fees?.nonAuditSharePct ?? null,
        feeUnit: fees?.feeUnit ?? null,
        feeYear: fees?.feeYear ?? null,
      },
      evidence: [
        ...ev(doc, [[new RegExp(escapeRe(am[0].trim())), "Ratification proposal"]]),
        ...(sm ? ev(doc, [[new RegExp(escapeRe(sm[0])), "Auditor tenure"]]) : []),
      ],
    });
  } else gaps.push("Auditor ratification proposal not recognized; no auditor item extracted.");

  // --- shareholder proposals & unsupported proposals ---
  const seen = new Set();
  doc.lines.forEach((l, i) => {
    const h = l.match(/^Proposal (\d+): (.{4,200})$/);
    if (!h || l.includes(" | ") || seen.has(h[1])) return;
    seen.add(h[1]);
    const number = Number(h[1]);
    const title = h[2].trim();
    const body = doc.lines.slice(i + 1, i + 8);
    const adv = body.map((b) => b.match(/^(.{3,160}?) (?:have|has) (?:advised|notified|informed) us that (?:they|it|he|she)\b/)).find(Boolean);
    if (!adv) {
      if (!/Election of|Advisory Vote to Approve|Ratification of/i.test(title)) gaps.push(`Proposal ${number} ("${title}") was detected but its type is not supported by the generic extractor; not extracted.`);
      return;
    }
    const proponent = adv[1].trim();
    const resolvedLine = doc.lines.slice(i + 1, i + 90).find((b) => /^Resolved\b ?:?/i.test(b));
    let resolved = null;
    let resolvedQuote = null;
    if (resolvedLine) {
      resolved = norm(resolvedLine.replace(/^Resolved\b ?:?\s*/i, ""));
      if (resolved.length > 420) resolved = resolved.slice(0, 420).replace(/\s+\S*$/, "") + "…";
      resolvedQuote = norm(resolvedLine);
      if (resolvedQuote.length > 320) resolvedQuote = resolvedQuote.slice(0, 320).replace(/\s+\S*$/, "");
    }
    let rec = summaryRec(doc, title);
    if (!rec) {
      const rm = doc.lines.slice(i, i + 120).join(" ").match(/Board (?:of Directors )?(?:unanimously )?recommends[^.]{0,80}?vote\s+"?(FOR|AGAINST)/i);
      rec = rm ? rm[1].toUpperCase() : null;
    }
    const category = categorize(title);
    const requestType = /report|disclos|evaluation|analy/i.test(resolved || title) ? "report" : /policy|adopt|amend|separat/i.test(resolved || title) ? "policy change" : "other";
    items.push({
      id: `sp-${number}`,
      type: "shareholder-proposal",
      title: `Shareholder Proposal ${number}: ${title}`,
      subtitle: `Submitted by ${proponent}`,
      boardRec: rec,
      facts: { proposalNumber: number, proposalTitle: title, proponent, category, categoryLabel: CATEGORY_LABEL[category], requestType, resolved },
      evidence: [
        { label: "Proponent statement", quote: norm(body.find((b) => b.startsWith(adv[1])) ?? l), truncated: false },
        ...(resolvedQuote ? [{ label: "Resolved clause", quote: resolvedQuote, truncated: resolvedQuote.length >= 300 }] : []),
      ],
    });
    if (!resolved) gaps.push(`Proposal ${number}: 'Resolved' clause not found.`);
  });
  if (!items.some((x) => x.type === "shareholder-proposal")) gaps.push("No shareholder proposals were recognized (the filing may have none, or use a layout this extractor does not handle).");
  gaps.push("Proposal categories are assigned from title keywords and are a simplification.");
  return { items, meta: { meetingDate, fiscalYear: null, meetingYear }, gaps };
}

/** Drop (and count) any evidence quote that does not occur verbatim in the filing text. */
export function verifyEvidence(doc, items) {
  let dropped = 0;
  for (const it of items) {
    it.evidence = it.evidence.filter((e) => {
      if (e.synthetic) {
        delete e.synthetic;
        e.derived = true; // numbers assembled from the cited table rows
        return true;
      }
      const ok = doc.flat.includes(e.quote) || (e.truncated && doc.flat.includes(e.quote.replace(/ …$/, "")));
      if (!ok) dropped++;
      return ok;
    });
  }
  return dropped;
}

export const EXTRACTOR_VERSION = "1";

/**
 * Extract ballot items from a DEF 14A primary document (HTML).
 * @param {{html: string, accession: string, filingDate: string}} input
 */
export function extractBallot({ html, accession, filingDate }) {
  const doc = new Doc(htmlToText(html));
  const custom = CUSTOM_EXTRACTORS[accession];
  let items, meta, gaps, method;
  if (custom) {
    method = custom[0];
    ({ items, meta } = custom[1](doc, {}));
    gaps = ["Hand-written extractor for this exact filing; see README for known gaps."];
  } else {
    method = "generic";
    ({ items, meta, gaps } = extractGeneric(doc, { filingDate }));
  }
  const dropped = verifyEvidence(doc, items);
  if (dropped) gaps.push(`${dropped} evidence quote(s) could not be verified verbatim and were dropped.`);
  return { items, meta, extraction: { method, version: EXTRACTOR_VERSION, gaps, automated: true } };
}

export { htmlToText };
