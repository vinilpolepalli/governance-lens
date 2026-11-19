import { getConn } from "@/lib/db";
import { getRun } from "@/lib/db/repo";
import { handle } from "@/lib/api";
import { ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = (_: Request, { params }: { params: { id: string } }) =>
  handle(async () => {
    const run = await getRun(await getConn(), params.id);
    if (!run) throw new ApiError(404, "run_not_found", "No such vote run.");
    return { run };
  });
