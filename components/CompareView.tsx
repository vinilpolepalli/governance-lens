"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Company } from "@/lib/types";
import { useApi } from "@/lib/client";
import { ErrorBox, Loading, Provenance } from "./Provenance";
import { decideAll } from "@/lib/engine";
import { usePolicy } from "./PolicyProvider";
import { VoteBadge } from "./VoteBadge";
import { TYPE_LABEL } from "@/lib/facts";

export function CompareView() {
  const co = useApi<{ companies: Company[] }>("/api/companies/");
  const { policies, loading } = usePolicy();
  if ((co.loading && !co.data) || loading) return <Loading what="companies and policies" />;
  if (co.error || !co.data) return <ErrorBox message={co.error ?? "Failed to load."} onRetry={co.reload} />;
  if (policies.length < 2) return <ErrorBox message="At least two policies are needed to compare." />;
  return <Compare companies={co.data.companies} />;
}

function Compare({ companies }: { companies: Company[] }) {
  const { policies } = usePolicy();
  const [aId, setA] = useState("long-term");
  const [bId, setB] = useState("governance-first");
  const a = policies.find((p) => p.id === aId) ?? policies[0];
  const b = policies.find((p) => p.id === bId) ?? policies[1];

  const rows = useMemo(
    () =>
      companies.map((c) => {
        const da = decideAll(c, a);
        const db = decideAll(c, b);
        return {
          company: c,
          items: c.items.map((it) => ({ it, a: da[it.id], b: db[it.id] })),
        };
      }),
    [a, b, companies]
  );
  const total = rows.reduce((n, r) => n + r.items.length, 0);
  const diverging = rows.reduce((n, r) => n + r.items.filter((x) => x.a.vote !== x.b.vote).length, 0);
  // Divergences where one side could not evaluate the item (REVIEW) are incompleteness, not a real policy disagreement.
  const incomplete = rows.reduce((n, r) => n + r.items.filter((x) => x.a.vote !== x.b.vote && (x.a.vote === "REVIEW" || x.b.vote === "REVIEW")).length, 0);

  return (
    <div>
      <h1 className="">Policy divergence</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">The same ballots, two saved voting policies (live preview, nothing recorded). Only items where the policies disagree are expanded, with the fact that drove each side.</p>

      <div className="card mt-6 flex flex-wrap items-center gap-4 p-4 text-sm">
        <label className="flex items-center gap-2">
          Policy A
          <select value={aId} onChange={(e) => setA(e.target.value)}>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-ink-muted">vs</span>
        <label className="flex items-center gap-2">
          Policy B
          <select value={bId} onChange={(e) => setB(e.target.value)}>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-ink">
          <b className="text-ink">{diverging}</b> of {total} ballot items diverge
          {incomplete > 0 && <span className="text-ink-muted"> · {diverging - incomplete} policy disagreements, {incomplete} where a side is incomplete (REVIEW)</span>}
        </span>
      </div>

      <div className="mt-8 space-y-10">
        {rows.map(({ company, items }) => {
          const diff = items.filter((x) => x.a.vote !== x.b.vote);
          const agree = items.length - diff.length;
          return (
            <section key={company.ticker}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  <Link href={`/company/${company.ticker.toLowerCase()}/`} className="hover:text-accent transition-colors">
                    {company.name}
                  </Link>
                </h2>
                <p className="text-sm text-ink-muted">
                  {diff.length} diverge · {agree} agree
                </p>
              </div>
              <div className="mt-1">
                <Provenance company={company} compact />
              </div>
              {diff.length === 0 ? (
                <p className="mt-3 card p-4 text-sm text-ink-muted">These two policies produce identical votes on every {company.ticker} item.</p>
              ) : (
                <div className="card mt-3 divide-y divide-line-soft">
                  {diff.map(({ it, a: da, b: db }) => (
                    <div key={it.id} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="eyebrow">{TYPE_LABEL[it.type]}</p>
                          <p className="font-medium text-ink">{it.title}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                          <VoteBadge vote={da.vote} size="sm" /> → <VoteBadge vote={db.vote} size="sm" />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                        <div className="inset p-3">
                          <p className="mb-1 text-xs font-semibold text-ink-muted">
                            {a.name}: <span className="text-ink">{da.vote}</span>
                          </p>
                          {da.reasoning}
                        </div>
                        <div className="inset p-3">
                          <p className="mb-1 text-xs font-semibold text-ink-muted">
                            {b.name}: <span className="text-ink">{db.vote}</span>
                          </p>
                          {db.reasoning}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
