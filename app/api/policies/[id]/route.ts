import { getConn } from "@/lib/db";
import { deletePolicy, getPolicy, updatePolicy } from "@/lib/db/repo";
import { handle, handleWrite, readJson } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { parsePolicyInput } from "@/lib/policy-validate";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export const GET = (_: Request, { params }: Ctx) =>
  handle(async () => {
    const p = await getPolicy(await getConn(), params.id);
    if (!p) throw new ApiError(404, "policy_not_found", `No policy with id "${params.id}".`);
    return { policy: p };
  });

/** Partial update: any of name, tagline, rules. Presets are read-only (403); custom policies only by their owner (403 forbidden). */
const update = (req: Request, { params }: Ctx) =>
  handleWrite(req, async (owner) => ({ policy: await updatePolicy(await getConn(), owner.id, params.id, parsePolicyInput(await readJson(req), true)) }));
export const PUT = update;
export const PATCH = update;

export const DELETE = (req: Request, { params }: Ctx) =>
  handleWrite(req, async (owner) => {
    await deletePolicy(await getConn(), owner.id, params.id);
    return { ok: true };
  });
