"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuditEntry, VoteRun } from "@/lib/types";
import { useApi } from "@/lib/client";
import { dateTimeFmt } from "@/lib/format";
import { VoteBadge } from "./VoteBadge";
import { ErrorBox, Loading } from "./Provenance";

const LABEL: Record<string, string> = {
  "company:ingest": "Company added",
  "company:refresh": "Company refreshed (newer filing)",
  "policy:seed": "Preset policy seeded",
  "policy:create": "Policy created",
  "policy:duplicate": "Policy duplicated",
  "policy:rename": "Policy renamed",
  "policy:update": "Policy edited",
  "policy:delete": "Policy deleted",
  "vote_run:run": "Vote run recorded (simulated, local only)",
  "vote:override": "Vote overridden",
  "vote:override_cleared": "Override cleared",
};

function summarize(e: AuditEntry): string {
  const d = e.detail as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (`${e.entity}:${e.action}`) {
    case "company:ingest":
      return `${e.entityId} · ${d.items} items · accession ${d.accession} · ${d.origin === "seed" ? "sample snapshot" : "live from EDGAR"}`;
    case "company:refresh":
      return `${e.entityId} · ${d.fromAccession} → ${d.toAccession}`;
    case "policy:rename":
      return `“${d.from}” → “${d.to}”`;
    case "policy:delete":
      return `“${d.name}” · ${d.vote_runs_retained} past run(s) kept`;
    case "vote_run:run":
      return `${d.ticker} under “${d.policyName}” · ${Object.entries(d.tally ?? {}).map(([k, v]) => `${v} ${k}`).join(", ")}`;
    case "vote:override":
      return `${d.itemTitle}: ${d.originalDecision}${d.from !== d.originalDecision ? ` (was ${d.from})` : ""} → ${d.to} · “${d.reason}”`;
    case "vote:override_cleared":
      return `${d.itemKey} restored${d.restoredTo ? ` to ${d.restoredTo}` : ""}`;
    default:
      return d.name ? `“${d.name}”${d.changed ? ` · changed ${(d.changed as string[]).join(", ")}` : ""}` : e.entityId;
  }
}

export function AuditView() {
  const q = useApi<{ entries: AuditEntry[]; runs: VoteRun[] }>("/api/audit/");
  const [tab, setTab] = useState<"runs" | "log">("runs");
  if (q.loading && !q.data) return <Loading what="audit log" />;
  if (q.error || !q.data) return <ErrorBox message={q.error ?? "Failed to load."} onRetry={q.reload} />;
  const { entries, runs } = q.data;

  return (
    <div>
      <h1 className="">Audit</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Every recorded vote run, every override (with its reason) and every data or policy change, with UTC timestamps. Vote runs are simulated: they are stored in this app’s database only.
      </p>
      <div className="mt-6 flex gap-2 text-sm" role="tablist">
        {(["runs", "log"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg border px-3 py-1.5 ${tab === t ? "border-ink bg-ink text-white" : "border-line text-ink-muted hover:text-ink"}`}>
            {t === "runs" ? `Vote runs (${runs.length})` : `Event log (${entries.length})`}
          </button>
        ))}
        <button className="link ml-auto text-xs" onClick={q.reload}>
          Refresh
        </button>
      </div>

      {tab === "runs" ? (
        runs.length === 0 ? (
          <p className="card mt-4 p-5 text-sm text-ink-muted">No vote runs yet. Open a company and press “Record vote run”.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {runs.map((r) => {
              const over = r.votes?.filter((v) => v.overridden) ?? [];
              return (
                <section key={r.id} className="card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold">
                      <Link className="hover:text-accent" href={`/company/${r.ticker.toLowerCase()}/`}>
                        {r.companyName} ({r.ticker})
                      </Link>{" "}
                      <span className="font-normal text-ink-muted">under “{r.policyName}”</span>
                    </h2>
                    <span className="text-xs text-ink-muted">{dateTimeFmt(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {r.votes?.length ?? 0} votes · {over.length} override{over.length === 1 ? "" : "s"} · filing {r.filingAccession ?? "n/a"}
                  </p>
                  {over.length > 0 && (
                    <ul className="mt-3 divide-y divide-line-soft text-sm">
                      {over.map((v) => (
                        <li key={v.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{v.itemTitle}</p>
                            <p className="text-ink-muted">Reason: {v.overrideReason}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                            <VoteBadge vote={v.originalDecision} size="sm" /> → <VoteBadge vote={v.decision} size="sm" />
                            {v.overriddenAt && <span>{dateTimeFmt(v.overriddenAt)}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : entries.length === 0 ? (
        <p className="card mt-4 p-5 text-sm text-ink-muted">Nothing logged yet.</p>
      ) : (
        <ul className="card mt-4 divide-y divide-line-soft">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 p-3.5 text-sm sm:flex-row sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="font-medium text-ink">{LABEL[`${e.entity}:${e.action}`] ?? `${e.entity} ${e.action}`}</p>
                <p className="break-words text-ink-muted">{summarize(e)}</p>
              </div>
              <time className="shrink-0 text-xs text-ink-muted" dateTime={e.createdAt}>
                {dateTimeFmt(e.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
