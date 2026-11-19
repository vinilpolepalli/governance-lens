import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="shell flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-4.2-4.2" />
            </svg>
          </span>
          Governance Lens
        </Link>
        <nav className="flex flex-wrap items-center gap-0.5 text-sm text-ink sm:gap-1">
          <Link href="/" className="rounded-lg px-2.5 py-1.5 sm:px-3 transition hover:bg-page hover:text-accent">
            Companies
          </Link>
          <Link href="/compare/" className="rounded-lg px-2.5 py-1.5 sm:px-3 transition hover:bg-page hover:text-accent">
            Policy divergence
          </Link>
          <Link href="/audit/" className="rounded-lg px-2.5 py-1.5 sm:px-3 transition hover:bg-page hover:text-accent">
            Audit
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line py-8 text-sm text-ink-muted">
     <div className="shell">
      <p>
        Demo built by Vinil Polepalli · data:{" "}
        <a className="link" href="https://www.sec.gov/edgar" target="_blank" rel="noreferrer">
          SEC EDGAR
        </a>
      </p>
      <p className="mt-1 text-xs text-ink-muted">Recommendations are deterministic rule outputs for analyst review, not investment or voting advice. Independent demo; not affiliated with or endorsed by Pennant.</p>
     </div>
    </footer>
  );
}
