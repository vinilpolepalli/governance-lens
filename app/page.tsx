"use client";

import Link from "next/link";
import type { Company } from "@/lib/types";
import { useApi } from "@/lib/client";
import { usePolicy } from "@/components/PolicyProvider";
import { AddCompany } from "@/components/AddCompany";
import { ErrorBox, Loading, Provenance } from "@/components/Provenance";
import { decideAll, tally } from "@/lib/engine";
import { VoteBadge } from "@/components/VoteBadge";

export default function Home() {
  const co = useApi<{ companies: Company[] }>("/api/companies/");
  const { policies } = usePolicy();
  const companies = co.data?.companies ?? [];
  const presets = policies.filter((p) => p.isPreset);
  return (
    <div>
      <section className="max-w-3xl">
        <p className="eyebrow">Proxy voting, made legible</p>
        <h1 className="mt-3 ">
          Read the ballot the way <span className="text-ink">your policy</span> would.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] text-ink-muted">
          Governance Lens pulls a company’s real DEF 14A proxy statement from SEC EDGAR, applies your voting policy, and shows FOR / AGAINST / FLAG with the fact that drove each call.
        </p>
      </section>

      <div className="mt-10">
        <AddCompany onAdded={co.reload} />
      </div>

      <section className="mt-8" aria-label="Companies">
        {co.loading && !co.data ? (
          <Loading what="companies" />
        ) : co.error ? (
          <ErrorBox message={co.error} onRetry={co.reload} />
        ) : companies.length === 0 ? (
          <p className="card p-5 text-sm text-ink-muted">No companies stored yet. Add one by ticker above.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {companies.map((c) => (
              <div key={c.ticker} className="card card-interactive group p-5">
                <Link href={`/company/${c.ticker.toLowerCase()}/`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{c.name}</h2>
                    <p className="text-sm text-ink-muted">
                      {c.ticker} · {c.exchange} · {c.sector}
                    </p>
                  </div>
                  <span className="text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-accent">→</span>
                </div>
                <p className="mt-4 text-sm text-ink">
                  <b className="text-ink">{c.items.length}</b> ballot items extracted
                  {c.items.filter((i) => i.type === "director").length > 0 && <> · {c.items.filter((i) => i.type === "director").length} director nominees</>}
                  {c.items.filter((i) => i.type === "shareholder-proposal").length > 0 && <> · {c.items.filter((i) => i.type === "shareholder-proposal").length} shareholder proposal(s)</>}
                </p>
                <div className="mt-4 space-y-2 text-xs text-ink-muted">
                  {presets.map((p) => {
                    const t = tally(decideAll(c, p));
                    return (
                      <div key={p.id} className="flex flex-col gap-1.5">
                        <span>{p.name} (live preview)</span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          {(["FOR", "AGAINST", "FLAG", "REVIEW"] as const).map(
                            (v) =>
                              (v !== "REVIEW" || t.REVIEW > 0) && (
                                <span key={v} className="flex items-center gap-1.5">
                                  <VoteBadge vote={v} size="sm" /> <b className="text-ink">{t[v]}</b>
                                </span>
                              )
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                </Link>
                <div className="mt-4 border-t border-line pt-3">
                  <Provenance company={c} compact />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 max-w-3xl" aria-label="How it works">
        <h2 className="section-label">How it works</h2>
        <div className="mt-3 divide-y divide-line border-y border-line text-sm text-ink-muted">
          <p className="py-3">Real filings: three samples are bundled; add any ticker to fetch its latest DEF 14A from EDGAR, with items extracted automatically and cited to verbatim filing text.</p>
          <p className="py-3">Your policy: toggle and tune rules such as overboarding, tenure, pay-vs-TSR gap and auditor tenure. Two presets ship; duplicate them into your own policies, saved in the app’s database.</p>
          <p className="py-3">Reasoning, not a black box: every recommendation shows its rule trace. If a fact can't be extracted, the rule is skipped and says so.</p>
        </div>
      </section>

      <p className="mt-8 text-sm text-ink-muted">
        See how the two presets disagree on the same ballots → <Link className="link" href="/compare/">Policy divergence</Link>
      </p>
    </div>
  );
}
