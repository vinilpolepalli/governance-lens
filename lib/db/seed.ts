import tsla from "@/app/data/tsla.json";
import aapl from "@/app/data/aapl.json";
import jpm from "@/app/data/jpm.json";
import { eq } from "drizzle-orm";
import { PRESETS } from "../policies";
import type { Company } from "../types";
import type { Conn } from "./index";
import { audit, getCompanyRow, saveCompany } from "./repo";

/** Insert preset policies and the 3 committed sample filings if they are not already present. Never overwrites. */
export async function seedIfEmpty(c: Conn): Promise<void> {
  const s = c.schema;
  const t = new Date().toISOString();
  for (const p of PRESETS) {
    const have = await c.db.select({ id: s.policies.id }).from(s.policies).where(eq(s.policies.id, p.id));
    if (have.length) continue;
    await c.db.insert(s.policies).values({ id: p.id, name: p.name, tagline: p.tagline, rules: p.rules, ownerId: "system", isPreset: true, createdAt: t, updatedAt: t });
    await audit(c, "policy", p.id, "seed", { name: p.name, note: "built-in preset" });
  }
  for (const raw of [tsla, aapl, jpm] as unknown as (Company & { fetchedAt: string })[]) {
    if (await getCompanyRow(c, raw.ticker)) continue;
    await saveCompany(
      c,
      {
        ticker: raw.ticker, name: raw.name, cik: raw.cik, sector: raw.sector, exchange: raw.exchange, meeting: raw.meeting, items: raw.items, fetchedAt: raw.fetchedAt,
        filing: { ...raw.filing, origin: "seed", extraction: { method: `custom:${raw.ticker}`, version: "1", automated: true, gaps: ["Sample data: hand-written extractor for this exact filing, loaded from the committed snapshot (app/data). See README for known gaps."] } },
      },
      { note: "sample/seed snapshot" }
    );
  }
}
