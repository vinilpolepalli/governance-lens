import { getConn } from "@/lib/db";
import { listAudit, listRuns } from "@/lib/db/repo";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Audit log (newest first) plus recent vote runs with their votes. */
export const GET = (req: Request) =>
  handle(async () => {
    const c = await getConn();
    const limit = Number(new URL(req.url).searchParams.get("limit")) || 200;
    return { entries: await listAudit(c, limit), runs: await listRuns(c, { limit: 100, withVotes: true }) };
  });
