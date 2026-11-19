import type { Company } from "@/lib/types";
import { dateFmt, dateTimeFmt } from "@/lib/format";

export function OriginBadge({ company }: { company: Company }) {
  const seed = company.filing.origin === "seed";
  return (
    <span
      title={seed ? "Loaded from the sample snapshot committed with this app, not fetched live." : "Fetched live from SEC EDGAR when the company was added."}
      className={`badge px-2 py-0.5 text-[10px] ${seed ? "border-dashed border-ink-faint text-ink-muted" : "border-line bg-white text-ink-muted"}`}
    >
      {seed ? "SAMPLE DATA" : "LIVE FROM EDGAR"}
    </span>
  );
}

/** Source link, filing date, fetch timestamp, and the automated-extraction disclosure. Shown wherever filing data appears. */
export function Provenance({ company, compact = false }: { company: Company; compact?: boolean }) {
  const f = company.filing;
  const ex = f.extraction;
  return (
    <div className="text-xs text-ink-muted">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <OriginBadge company={company} />
        <span>
          {f.form} filed {dateFmt(f.filingDate)}
        </span>
        <span aria-hidden>·</span>
        <span>Fetched {dateTimeFmt(company.fetchedAt)}</span>
        <span aria-hidden>·</span>
        <a className="link" href={f.sourceUrl} target="_blank" rel="noreferrer">
          Filing on EDGAR ↗
        </a>
        {!compact && (
          <a className="link" href={f.indexUrl} target="_blank" rel="noreferrer">
            Filing index ↗
          </a>
        )}
      </p>
      {!compact && ex && (
        <details className="mt-2">
          <summary className="cursor-pointer text-ink">
            Automated extraction ({ex.method}, v{ex.version}) · what was not extracted ({ex.gaps.length})
          </summary>
          <p className="mt-1.5 text-ink-muted">
            Ballot items were extracted from the filing text by software, not reviewed by a person. Anything shown as “Not extracted” was not found and has not been guessed; rules that depend on it are skipped.
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {ex.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="card flex items-center gap-3 p-5 text-sm text-ink-muted" role="status" aria-busy="true">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      Loading {what}…
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card p-5 text-sm" role="alert">
      <p className="text-red-700">{message}</p>
      {onRetry && (
        <button className="link mt-2" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
