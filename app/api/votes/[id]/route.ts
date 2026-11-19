import { getConn } from "@/lib/db";
import { clearOverride, overrideVote } from "@/lib/db/repo";
import { handleWrite, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

/** Body: { decision: FOR|AGAINST|FLAG|REVIEW, reason }. A reason is mandatory. Setting the engine's own decision clears the override. */
export const PATCH = (req: Request, { params }: Ctx) =>
  handleWrite(req, async () => {
    const b = (await readJson(req)) as { decision?: unknown; reason?: unknown };
    return { vote: await overrideVote(await getConn(), params.id, b?.decision, b?.reason) };
  });

/** Remove the override and restore the engine decision. */
export const DELETE = (req: Request, { params }: Ctx) => handleWrite(req, async () => ({ vote: await clearOverride(await getConn(), params.id) }));
