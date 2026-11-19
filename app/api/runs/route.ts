import { getConn } from "@/lib/db";
import { createRun, listRuns } from "@/lib/db/repo";
import { handle, handleWrite, readJson } from "@/lib/api";
import { ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** GET /api/runs?ticker=&policyId=&limit=&votes=1  (newest first) */
export const GET = (req: Request) =>
  handle(async () => {
    const q = new URL(req.url).searchParams;
    const limit = q.get("limit") ? Number(q.get("limit")) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new ApiError(400, "invalid_limit", "limit must be a positive integer.");
    return { runs: await listRuns(await getConn(), { ticker: q.get("ticker") ?? undefined, policyId: q.get("policyId") ?? undefined, limit, withVotes: q.get("votes") === "1" }) };
  });

/** Body: { policyId, ticker }. Evaluates the *saved* policy against the stored ballot and records the votes. Nothing is transmitted anywhere. */
export const POST = (req: Request) =>
  handleWrite(req, async (owner) => {
    const b = (await readJson(req)) as { policyId?: unknown; ticker?: unknown };
    if (typeof b?.policyId !== "string" || typeof b?.ticker !== "string") throw new ApiError(400, "invalid_request", "policyId and ticker are required strings.");
    if (b.policyId.length > 100 || b.ticker.length > 10) throw new ApiError(400, "invalid_request", "policyId or ticker is too long.");
    return { run: await createRun(await getConn(), owner.id, b.policyId, b.ticker) };
  }, 201);
