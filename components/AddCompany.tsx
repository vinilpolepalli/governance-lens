"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Company } from "@/lib/types";
import { api, ClientError } from "@/lib/client";
import { dateTimeFmt } from "@/lib/format";

type State =
  | { s: "idle" }
  | { s: "working"; ticker: string }
  | { s: "done"; company: Company; cached: boolean }
  | { s: "error"; message: string; code?: string };

export function AddCompany({ onAdded }: { onAdded: () => void }) {
  const [ticker, setTicker] = useState("");
  const [st, setSt] = useState<State>({ s: "idle" });
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (st.s !== "working") return;
    setSecs(0);
    const id = setInterval(() => setSecs((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [st.s]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setSt({ s: "working", ticker: t });
    try {
      const r = await api<{ company: Company; cached: boolean }>("/api/companies/", { method: "POST", body: { ticker: t } });
      setSt({ s: "done", company: r.company, cached: r.cached });
      setTicker("");
      onAdded();
    } catch (err) {
      setSt({ s: "error", message: err instanceof Error ? err.message : "Failed.", code: err instanceof ClientError ? err.code : undefined });
    }
  };

  const working = st.s === "working";
  return (
    <section className="card p-5" aria-label="Add a company">
      <h2 className="text-lg font-semibold">Add a company by ticker</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Fetches the latest DEF 14A from SEC EDGAR for any ticker. Extraction is automated: anything the parser cannot find is shown as “Not extracted”, and items without enough facts get REVIEW instead of a guess. Companies you add and runs you record are shared: every visitor of this demo sees them, and they contain only public filing data, never who added them.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="ticker">
          Ticker symbol
        </label>
        <input id="ticker" className="w-36 uppercase" placeholder="e.g. MSFT" value={ticker} maxLength={10} onChange={(e) => setTicker(e.target.value)} disabled={working} autoComplete="off" />
        <button
          disabled={working || !ticker.trim()}
          className="rounded-lg border border-ink bg-ink px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {working ? "Fetching…" : "Fetch from EDGAR"}
        </button>
      </form>
      <div aria-live="polite" className="mt-3 text-sm">
        {st.s === "working" && (
          <div role="status">
            <div className="h-1 w-full overflow-hidden rounded bg-line">
              <div className="h-full w-1/3 animate-pulse rounded bg-ink-faint" />
            </div>
            <p className="mt-2 text-ink-muted">
              Working on {st.ticker} ({secs}s): resolving the ticker, finding the latest DEF 14A, downloading it and extracting ballot items. This is one server request, so no finer progress is available; it usually takes 5–40 seconds.
            </p>
          </div>
        )}
        {st.s === "error" && (
          <p className="text-red-700" role="alert">
            {st.message}
          </p>
        )}
        {st.s === "done" && (
          <p className="text-green-700">
            {st.cached ? `${st.company.ticker} is already stored with the latest filing on EDGAR (fetched ${dateTimeFmt(st.company.fetchedAt)}); nothing was re-downloaded.` : `Added ${st.company.name}: ${st.company.items.length} ballot items extracted.`}{" "}
            <Link className="link" href={`/company/${st.company.ticker.toLowerCase()}/`}>
              Open ballot →
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
