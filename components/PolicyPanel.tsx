"use client";

import { useState } from "react";
import type { Policy, ProposalCategory, RuleAction, Vote } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/policies";
import { usePolicy } from "./PolicyProvider";

type NumKey = "maxBoards" | "maxPct" | "maxYears" | "maxAge" | "thresholdPp" | "maxUsdMillions" | "minPct";
type RuleKey = Exclude<keyof Policy["rules"], "proposals">;

interface RuleDef {
  key: RuleKey;
  group: string;
  before: string;
  num?: { field: NumKey; suffix: string };
  after?: string;
  hint?: string;
}

const RULES: RuleDef[] = [
  { key: "overboarding", group: "Directors", before: "Vote", num: { field: "maxBoards", suffix: "public boards (incl. this one)" }, after: "for directors sitting on more than" },
  { key: "tenure", group: "Directors", before: "Vote", num: { field: "maxYears", suffix: "years" }, after: "for independent directors with tenure over" },
  { key: "age", group: "Directors", before: "Vote", num: { field: "maxAge", suffix: "" }, after: "for directors older than" },
  { key: "chairCeo", group: "Directors", before: "Vote", after: "for a combined Chairman / CEO" },
  { key: "classified", group: "Directors", before: "Vote", after: "for nominees on a classified (staggered) board" },
  { key: "payTsrGap", group: "Say-on-pay", before: "Vote", num: { field: "thresholdPp", suffix: "pp" }, after: "when CEO pay growth outpaces 1-yr TSR by more than" },
  { key: "payCap", group: "Say-on-pay", before: "Vote", num: { field: "maxUsdMillions", suffix: "$M" }, after: "when CEO reported total pay exceeds" },
  { key: "priorSupport", group: "Say-on-pay", before: "Vote", num: { field: "minPct", suffix: "%" }, after: "when last year's say-on-pay support was below" },
  { key: "auditorTenure", group: "Auditor", before: "Vote", num: { field: "maxYears", suffix: "years" }, after: "on ratification when auditor tenure exceeds" },
  { key: "nonAuditFees", group: "Auditor", before: "Vote", num: { field: "maxPct", suffix: "% of fees" }, after: "when tax + other non-audit fees exceed" },
  { key: "equityPlanIncrease", group: "Equity plans", before: "Vote", after: "when a plan requests additional shares" },
];

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ProposalCategory[];

export function PolicyPanel() {
  const { policies, loading, error, reload, active, saved, activeId, setActiveId, editDraft, discardDraft, dirty, save, rename, duplicate, remove, createBlank } = usePolicy();
  const groups = Array.from(new Set(RULES.map((r) => r.group)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const act = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <aside className="card p-5 text-sm text-ink-muted" aria-busy="true">Loading policies…</aside>;
  if (error || !saved || !active)
    return (
      <aside className="card p-5 text-sm">
        <p className="text-red-700">Could not load policies: {error ?? "none found"}</p>
        <button className="link mt-2" onClick={reload}>Retry</button>
      </aside>
    );
  const readOnly = saved.isPreset;

  return (
    <aside className="card p-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" aria-label="Voting policy">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-accent">Voting policy</h2>
      <div className="mt-3 flex flex-col gap-1.5" role="radiogroup" aria-label="Select policy">
        {policies.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={p.id === activeId}
            onClick={() => setActiveId(p.id)}
            className={`rounded-[10px] border px-3 py-2.5 text-left transition ${p.id === activeId ? "border-accent bg-white ring-1 ring-accent" : "border-line hover:border-ink-faint"}`}
          >
            <span className="block text-sm font-semibold text-ink">
              {p.name} {p.isPreset && <span className="ml-1 text-[10px] font-normal uppercase tracking-wider text-ink-muted">preset</span>}
            </span>
            <span className="block text-xs text-ink-muted">{p.tagline}</span>
          </button>
        ))}
      </div>
      <button className="link mt-2 text-xs" disabled={busy} onClick={() => act(createBlank, "Created a new policy.")}>+ New policy</button>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{readOnly ? "Rules (read-only preset)" : "Edit rules"}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <button className="link" disabled={busy} onClick={() => act(duplicate, "Duplicated.")}>Duplicate</button>
          {!readOnly && (
            <>
              <button className="link" disabled={busy} onClick={() => setRenaming(saved.name)}>Rename</button>
              <button
                className="text-red-700 underline-offset-2 hover:underline"
                disabled={busy}
                onClick={() => window.confirm(`Delete "${saved.name}"? Past vote runs that used it are kept in the audit trail.`) && act(remove, "Deleted.")}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {renaming !== null && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => { await rename(renaming); setRenaming(null); }, "Renamed.");
          }}
        >
          <input className="min-w-0 flex-1" aria-label="Policy name" value={renaming} maxLength={80} onChange={(e) => setRenaming(e.target.value)} autoFocus />
          <button className="link text-xs" disabled={busy || !renaming.trim()}>Save</button>
          <button type="button" className="text-xs text-ink-muted hover:text-ink" onClick={() => setRenaming(null)}>Cancel</button>
        </form>
      )}
      <p className="mt-1 text-xs text-ink-muted">
        {readOnly ? "Presets can't be edited. Duplicate one to make your own copy." : "Edits preview instantly; they are stored in the database only when you press Save."}
      </p>
      {msg && <p className="mt-2 text-xs text-amber-800" role="status">{msg}</p>}
      {!readOnly && dirty && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-200 bg-white p-2.5 text-xs">
          <span className="flex-1 text-amber-800">Unsaved changes</span>
          <button className="link font-semibold" disabled={busy} onClick={() => act(save, "Saved.")}>Save</button>
          <button className="text-ink-muted hover:text-ink" disabled={busy} onClick={discardDraft}>Discard</button>
        </div>
      )}

      {groups.map((g) => (
        <div key={g} className="mt-4">
          <h4 className="mb-1.5 text-xs font-semibold text-ink">{g}</h4>
          <ul className="space-y-2">
            {RULES.filter((r) => r.group === g).map((r) => {
              const rule = active.rules[r.key] as { enabled: boolean; action: RuleAction } & Partial<Record<NumKey, number>>;
              return (
                <li key={r.key} className={`rounded-lg border border-line p-2.5 text-xs leading-6 ${rule.enabled ? "bg-page" : "opacity-60"}`}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1.5 accent-accent"
                      disabled={readOnly}
                      checked={rule.enabled}
                      onChange={(e) => editDraft((d) => ((d.rules[r.key] as { enabled: boolean }).enabled = e.target.checked))}
                    />
                    <span className="text-ink">
                      {r.before}{" "}
                      <select
                        aria-label={`${r.key} action`}
                        disabled={readOnly}
                        value={rule.action}
                        onChange={(e) => editDraft((d) => ((d.rules[r.key] as { action: RuleAction }).action = e.target.value as RuleAction))}
                      >
                        <option value="AGAINST">AGAINST</option>
                        <option value="FLAG">FLAG</option>
                      </select>{" "}
                      {r.after}{" "}
                      {r.num && (
                        <>
                          <input
                            type="number"
                            aria-label={`${r.key} threshold`}
                            className="w-16"
                            disabled={readOnly}
                            value={rule[r.num.field] ?? 0}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (e.target.value !== "" && Number.isFinite(v)) editDraft((d) => ((d.rules[r.key] as unknown as Record<string, number>)[r.num!.field] = v));
                            }}
                          />{" "}
                          {r.num.suffix}
                        </>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-4">
        <h4 className="mb-1.5 text-xs font-semibold text-ink">Shareholder proposals (by category)</h4>
        <ul className="space-y-1.5">
          {CATEGORIES.map((c) => (
            <li key={c} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-page px-2.5 py-1.5 text-xs">
              <span className="text-ink">{CATEGORY_LABELS[c]}</span>
              <select aria-label={`${c} stance`} disabled={readOnly} value={active.rules.proposals[c]} onChange={(e) => editDraft((d) => (d.rules.proposals[c] = e.target.value as Vote))}>
                <option value="FOR">FOR</option>
                <option value="AGAINST">AGAINST</option>
                <option value="FLAG">FLAG (review)</option>
              </select>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
