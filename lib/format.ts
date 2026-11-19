export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "n/a";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)} billion`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)} million`;
  return `$${n.toLocaleString("en-US")}`;
}

export function usdM(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)} billion` : `$${n.toFixed(1)} million`;
}

export function pctFmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "n/a";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function dateFmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** ISO timestamp -> "Nov 17, 2026, 3:49 PM UTC" (always UTC so server/client/screenshots agree). */
export function dateTimeFmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
}
