"use client";

import { useState } from "react";
import type { BallotItem, Decision, DecisionVote, StoredVote } from "@/lib/types";
import { VoteBadge } from "./VoteBadge";
import { TYPE_LABEL, keyFacts } from "@/lib/facts";
import { dateTimeFmt } from "@/lib/format";

const DOT: Record<string, string> = { triggered: "bg-red-600", passed: "bg-green-600", skipped: "bg-amber-400" };
const CHOICES: DecisionVote[] = ["FOR", "AGAINST", "FLAG", "REVIEW"];

interface Props {
  item: BallotItem;
  /** Engine decision (live preview, or the recorded engine decision when `vote` is given). */
  decision: Decision;
  /** Present when this card shows a recorded vote from a stored run. */
  vote?: StoredVote;
  onOverride?: (voteId: string, decision: DecisionVote, reason: string) => Promise<void>;
  onClear?: (voteId: string) => Promise<void>;
}

export function BallotCard({ item, decision, vote, onOverride, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<DecisionVote>("FLAG");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const facts = keyFacts(item);
  const shown: DecisionVote = vote ? vote.decision : decision.vote;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setEditing(false);
      setReason("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`card p-5 transition duration-200 hover:border-ink-faint ${vote?.overridden ? "!border-amber-200" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{TYPE_LABEL[item.type]}</p>
          <h3 className="mt-1 text-[17px] font-semibold leading-snug">{item.title}</h3>
          <p className="text-sm text-ink-muted">{item.subtitle}</p>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <div className="flex items-center gap-2">
            {vote?.overridden && <span className="badge border-amber-200 bg-white px-2 py-0.5 text-[10px] text-amber-800">OVERRIDDEN</span>}
            <VoteBadge vote={shown} />
          </div>
          <span className="text-[11px] text-ink-muted">{item.boardRec ? `Board recommends ${item.boardRec}` : "Board recommendation: not extracted"}</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 border-b border-line-soft pb-1.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <dt className="text-xs text-ink-muted sm:shrink-0 sm:text-sm">{k}</dt>
            <dd className={`break-words font-medium sm:text-right ${v.startsWith("Not extracted") ? "italic text-ink-muted" : "text-ink"}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="inset mt-4 p-3.5 text-sm leading-relaxed text-ink">
        <span className="eyebrow mr-2">{vote ? "Engine reasoning" : "Why"}</span>
        {decision.reasoning}
        {item.type === "shareholder-proposal" && item.facts.resolved && (
          <p className="mt-2 border-l-2 border-line pl-3 text-xs italic text-ink-muted">Resolved: {item.facts.resolved}</p>
        )}
      </div>

      {vote?.overridden && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 text-sm">
          <p className="text-amber-800">
            Overridden: engine said <b>{vote.originalDecision}</b>, recorded decision is <b>{vote.decision}</b>
            {vote.overriddenAt && <span className="text-ink-muted"> · {dateTimeFmt(vote.overriddenAt)}</span>}
          </p>
          <p className="mt-1 text-ink">Reason: {vote.overrideReason}</p>
        </div>
      )}

      {vote && onOverride && (
        <div className="mt-3">
          {!editing ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <button
                className="link font-medium"
                onClick={() => {
                  setChoice(CHOICES.find((c) => c !== shown) ?? "FLAG");
                  setEditing(true);
                }}
              >
                {vote.overridden ? "Change override" : "Override decision"}
              </button>
              {vote.overridden && onClear && (
                <button className="text-ink-muted hover:text-ink" disabled={busy} onClick={() => run(() => onClear(vote.id))}>
                  Restore engine decision
                </button>
              )}
            </div>
          ) : (
            <form
              className="grid gap-2 rounded-lg border border-line p-3 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => onOverride(vote.id, choice, reason));
              }}
            >
              <label className="flex items-center gap-2">
                <span className="text-ink-muted">Decision</span>
                <select value={choice} onChange={(e) => setChoice(e.target.value as DecisionVote)}>
                  {CHOICES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-ink-muted">Reason (required, saved to the audit log)</span>
                <textarea className="w-full rounded-lg border border-line bg-white p-2 text-sm" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
              </label>
              <div className="flex gap-3 text-xs">
                <button className="link font-semibold" disabled={busy || reason.trim().length < 3}>
                  {busy ? "Saving…" : "Save override"}
                </button>
                <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {err && <p className="mt-2 text-xs text-red-700" role="alert">{err}</p>}
        </div>
      )}

      <button onClick={() => setOpen(!open)} className="link mt-4 text-xs font-medium" aria-expanded={open}>
        {open ? "Hide" : "Show"} rule trace &amp; filing evidence
      </button>
      {open && (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="section-label mb-2">Rule trace</h4>
            <ul className="space-y-2 text-xs text-ink">
              {decision.rules.length === 0 && <li className="text-ink-muted">No enabled rules apply to this item type.</li>}
              {decision.rules.map((r) => (
                <li key={r.ruleId} className="flex gap-2">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[r.status]}`} />
                  <span>
                    <span className="font-medium text-ink">{r.label}</span> <span className="text-ink-muted">({r.status})</span>
                    <br />
                    {r.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="section-label mb-2">Evidence from the filing</h4>
            <ul className="space-y-2 text-xs text-ink-muted">
              {item.evidence.length === 0 && <li className="text-ink-muted">No verbatim evidence quote could be extracted for this item.</li>}
              {item.evidence.map((e, i) => (
                <li key={i}>
                  <span className="font-medium text-ink">{e.label}</span>
                  {e.derived && <span className="ml-1 text-ink-muted">(values read from the cited table)</span>}
                  <blockquote className="mt-0.5 border-l-2 border-line pl-2 italic">“{e.quote}”</blockquote>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}
