"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BallotItem, Company, Decision, DecisionVote, ItemType, StoredVote, VoteRun } from "@/lib/types";
import { decideAll, tally } from "@/lib/engine";
import { api, useApi } from "@/lib/client";
import { dateFmt, dateTimeFmt } from "@/lib/format";
import { BallotCard } from "./BallotCard";
import { PolicyPanel } from "./PolicyPanel";
import { usePolicy } from "./PolicyProvider";
import { VoteBadge } from "./VoteBadge";
import { ErrorBox, Loading, Provenance } from "./Provenance";
import { TYPE_LABEL } from "@/lib/facts";

const ORDER: ItemType[] = ["director", "say-on-pay", "auditor", "equity-plan", "shareholder-proposal"];

export function CompanyView({ ticker }: { ticker: string }) {
  const co = useApi<{ company: Company }>(`/api/companies/${encodeURIComponent(ticker)}/`);
  if (co.loading) return <Loading what={`${ticker.toUpperCase()} ballot`} />;
  if (co.error || !co.data) return <ErrorBox message={co.error ?? "Company not found."} onRetry={co.reload} />;
  return <Loaded company={co.data.company} />;
}

function Loaded({ company }: { company: Company }) {
  const { active, saved, dirty, loading: polLoading } = usePolicy();
  const [run, setRun] = useState<VoteRun | null>(null);
  const [runState, setRunState] = useState<"idle" | "loading" | "error">("idle");
  const [recording, setRecording] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const policyId = saved?.id;
  const loadRun = useCallback(async () => {
    if (!policyId) return;
    setRunState("loading");
    try {
      const r = await api<{ runs: VoteRun[] }>(`/api/runs/?ticker=${company.ticker}&policyId=${policyId}&limit=1&votes=1`);
      setRun(r.runs[0] ?? null);
      setRunState("idle");
    } catch (e) {
      setRunState("error");
      setMsg(e instanceof Error ? e.message : "Could not load recorded run.");
    }
  }, [company.ticker, policyId]);
  useEffect(() => {
    setRun(null);
    setMsg(null);
    loadRun();
  }, [loadRun]);

  const preview = useMemo(() => (active ? decideAll(company, active) : {}), [company, active]);
  // A recorded run is shown only while the on-screen policy matches the saved one it was run under.
  const showRun = !!run && !dirty;
  const voteFor = (it: BallotItem): StoredVote | undefined => (showRun ? run!.votes?.find((v) => v.itemId === it.id) : undefined);
  const decisionFor = (it: BallotItem): Decision => {
    const v = voteFor(it);
    return v ? { vote: v.originalDecision, reasoning: v.reasoning, rules: v.evidence.rules } : preview[it.id];
  };
  if (!active) return <Loading what="policies" />;
  const effective: Record<string, Decision> = {};
  for (const it of company.items) {
    const v = voteFor(it);
    effective[it.id] = v ? { ...decisionFor(it), vote: v.decision } : preview[it.id];
  }
  const t = tally(effective);

  const record = async () => {
    if (!saved) return;
    setRecording(true);
    setMsg(null);
    try {
      const r = await api<{ run: VoteRun }>("/api/runs/", { method: "POST", body: { policyId: saved.id, ticker: company.ticker } });
      setRun(r.run);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not record the run.");
    } finally {
      setRecording(false);
    }
  };
  const override = async (id: string, decision: DecisionVote, reason: string) => {
    await api(`/api/votes/${id}/`, { method: "PATCH", body: { decision, reason } });
    await loadRun();
  };
  const clear = async (id: string) => {
    await api(`/api/votes/${id}/`, { method: "DELETE" });
    await loadRun();
  };

  const nOver = run?.votes?.filter((v) => v.overridden).length ?? 0;
  const staleFiling = run && run.filingAccession && run.filingAccession !== company.filing.accession;

  return (
    <div>
      <Link href="/" className="link text-sm !text-ink-muted hover:!text-ink">
        ← All companies
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="">
            {company.name} <span className="text-base font-normal text-ink-muted">{company.ticker}</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {company.meeting.date ? `Annual meeting ${dateFmt(company.meeting.date)}` : `${company.meeting.year} annual meeting (date not extracted)`} · {company.sector} · {company.exchange}
          </p>
          <div className="mt-2">
            <Provenance company={company} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-live="polite">
          <span className="text-ink-muted">
            Under “{active?.name ?? "…"}” ({showRun ? "recorded" : "preview"}):
          </span>
          {(["FOR", "AGAINST", "FLAG", "REVIEW"] as DecisionVote[]).map((v) => (
            <span key={v} className="flex items-center gap-1.5">
              <VoteBadge vote={v} size="sm" />
              <span className="font-semibold text-ink">{t[v]}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PolicyPanel />
        <div className="space-y-8">
          <section className="card p-4 text-sm" aria-label="Vote run">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-ink">
                {polLoading || runState === "loading" ? (
                  "Checking for a recorded run…"
                ) : dirty ? (
                  <>Showing a <b>live preview</b> of your unsaved edits. Save the policy to record a run.</>
                ) : showRun ? (
                  <>
                    Recorded run <b>{dateTimeFmt(run!.createdAt)}</b> under “{run!.policyName}” · {run!.votes?.length} votes · {nOver} override{nOver === 1 ? "" : "s"}
                  </>
                ) : (
                  <>Showing a <b>live preview</b> — not recorded. Recording saves these decisions to this app’s database so they can be overridden and audited. Recorded runs are visible to every visitor of this demo.</>
                )}
              </div>
              <button
                onClick={record}
                disabled={recording || dirty || !saved}
                className="rounded-lg border border-ink bg-ink px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
              >
                {recording ? "Recording…" : showRun ? "Record a new run" : "Record vote run"}
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Simulated: a run only stores decisions locally in this app. No ballot is submitted to any issuer, custodian or voting platform. <Link className="link" href="/audit/">View audit log</Link>
            </p>
            {staleFiling && <p className="mt-2 text-xs text-amber-800">This run was recorded against an earlier filing ({run!.filingAccession}); the stored company data has since been refreshed.</p>}
            {msg && <p className="mt-2 text-xs text-red-700" role="alert">{msg}</p>}
          </section>

          {ORDER.map((type) => {
            const items = company.items.filter((i) => i.type === type);
            if (!items.length) return null;
            return (
              <section key={type}>
                <h2 className="section-label mb-3">
                  {TYPE_LABEL[type]}s <span className="text-ink-faint">({items.length})</span>
                </h2>
                <div className="space-y-4">
                  {items.map((it) => {
                    const v = voteFor(it);
                    return <BallotCard key={it.id} item={it} decision={decisionFor(it)} vote={v} onOverride={v ? override : undefined} onClear={v ? clear : undefined} />;
                  })}
                </div>
              </section>
            );
          })}
          {!company.items.some((i) => i.type === "shareholder-proposal") && (
            <p className="card p-4 text-sm text-ink-muted">
              No shareholder proposals were extracted for {company.name}. The filing may have none, or its layout may not be recognized
              {company.filing.origin === "edgar-live" ? " (see the extraction notes above)" : ""}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
