// Minimal HTML -> line-oriented plain text converter for SEC filings.
const dec = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"');

export function htmlToText(html) {
  let t = html.replace(/\r?\n/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(p|div|tr|li|h\d|table)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = dec(t)
    .replace(/[  ​]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+/g, " ");
  return t
    .split("\n")
    .map((l) => l.replace(/^[\s|]+/, "").replace(/[\s|]+$/, "").replace(/(\s\|){2,}/g, " |").trim())
    .filter(Boolean)
    .join("\n");
}
