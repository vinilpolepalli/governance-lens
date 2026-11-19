import { getConn } from "@/lib/db";
import { createPolicy, listPolicies } from "@/lib/db/repo";
import { handleWrite, handle, readJson } from "@/lib/api";
import { parsePolicyInput } from "@/lib/policy-validate";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => ({ policies: await listPolicies(await getConn()) }));

export const POST = (req: Request) =>
  handleWrite(req, async (owner) => {
    const input = parsePolicyInput(await readJson(req));
    return { policy: await createPolicy(await getConn(), owner.id, { name: input.name!, tagline: input.tagline, rules: input.rules! }) };
  }, 201);
