import { getConn } from "@/lib/db";
import { listCompanies } from "@/lib/db/repo";
import { handleWrite, handle, readJson } from "@/lib/api";
import { ingestTicker } from "@/lib/ingest";
import { rateLimit } from "@/lib/rate-limit";

const ADDS_PER_HOUR = 5;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = () => handle(async () => ({ companies: await listCompanies(await getConn()) }));

/** Body: { ticker }. Fetches the latest DEF 14A from SEC EDGAR (or returns the stored copy if the accession is unchanged). */
export async function POST(req: Request) {
  let created = false;
  const res = await handleWrite(req, async (owner) => {
    rateLimit(`add:${owner.id}`, ADDS_PER_HOUR);
    const body = (await readJson(req)) as { ticker?: unknown };
    const { company, cached } = await ingestTicker(body?.ticker);
    created = !cached;
    return { company, cached };
  });
  return created && res.status === 200 ? new Response(res.body, { status: 201, headers: res.headers }) : res;
}
