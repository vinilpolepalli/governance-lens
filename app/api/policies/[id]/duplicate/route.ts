import { getConn } from "@/lib/db";
import { createPolicy, getPolicy, listPolicies } from "@/lib/db/repo";
import { handleWrite } from "@/lib/api";
import { ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const POST = (req: Request, { params }: { params: { id: string } }) =>
  handleWrite(req, async (owner) => {
    const c = await getConn();
    const src = await getPolicy(c, params.id);
    if (!src) throw new ApiError(404, "policy_not_found", `No policy with id "${params.id}".`);
    const names = new Set((await listPolicies(c)).map((p) => p.name));
    const base = src.name.slice(0, 60);
    let name = `${base} (copy)`;
    for (let n = 2; names.has(name); n++) name = `${base} (copy ${n})`;
    return { policy: await createPolicy(c, owner.id, { name, tagline: src.tagline, rules: structuredClone(src.rules) }, { duplicatedFrom: src.id }) };
  }, 201);
