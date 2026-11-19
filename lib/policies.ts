import type { Policy } from "./types";

export const LONG_TERM: Policy = {
  id: "long-term",
  name: "Long-term value focus",
  tagline: "Back management on routine items; escalate only clear pay, overboarding and auditor outliers.",
  rules: {
    overboarding: { enabled: true, action: "AGAINST", maxBoards: 4 },
    tenure: { enabled: false, action: "FLAG", maxYears: 20 },
    age: { enabled: false, action: "FLAG", maxAge: 80 },
    chairCeo: { enabled: false, action: "FLAG" },
    classified: { enabled: false, action: "FLAG" },
    payTsrGap: { enabled: true, action: "AGAINST", thresholdPp: 20 },
    payCap: { enabled: true, action: "FLAG", maxUsdMillions: 500 },
    priorSupport: { enabled: true, action: "FLAG", minPct: 70 },
    auditorTenure: { enabled: true, action: "FLAG", maxYears: 40 },
    nonAuditFees: { enabled: true, action: "FLAG", maxPct: 25 },
    equityPlanIncrease: { enabled: true, action: "FLAG" },
    proposals: {
      "independent-chair": "FLAG",
      "political-lobbying": "FLAG",
      "sustainability-report": "FLAG",
      "risk-disclosure": "FOR",
      other: "FLAG",
    },
  },
};

export const GOVERNANCE_FIRST: Policy = {
  id: "governance-first",
  name: "Governance-first",
  tagline: "Structural independence and accountability: tenure, combined roles, classified boards, tight pay and auditor limits.",
  rules: {
    overboarding: { enabled: true, action: "AGAINST", maxBoards: 3 },
    tenure: { enabled: true, action: "FLAG", maxYears: 15 },
    age: { enabled: true, action: "FLAG", maxAge: 75 },
    chairCeo: { enabled: true, action: "AGAINST" },
    classified: { enabled: true, action: "FLAG" },
    payTsrGap: { enabled: true, action: "AGAINST", thresholdPp: 10 },
    payCap: { enabled: true, action: "AGAINST", maxUsdMillions: 100 },
    priorSupport: { enabled: true, action: "AGAINST", minPct: 80 },
    auditorTenure: { enabled: true, action: "AGAINST", maxYears: 20 },
    nonAuditFees: { enabled: true, action: "AGAINST", maxPct: 15 },
    equityPlanIncrease: { enabled: true, action: "AGAINST" },
    proposals: {
      "independent-chair": "FOR",
      "political-lobbying": "FOR",
      "sustainability-report": "FLAG",
      "risk-disclosure": "FLAG",
      other: "FLAG",
    },
  },
};

export const PRESETS: Policy[] = [LONG_TERM, GOVERNANCE_FIRST];

export const CATEGORY_LABELS: Record<string, string> = {
  "independent-chair": "Independent board chair",
  "political-lobbying": "Political spending & lobbying",
  "sustainability-report": "Sustainability / climate reporting",
  "risk-disclosure": "Risk disclosure",
  other: "Other proposals",
};
