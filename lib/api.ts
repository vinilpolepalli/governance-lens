import { NextResponse } from "next/server";
import { ApiError } from "./errors";
import { ownerCookie, resolveOwner, type Owner } from "./owner";
import { rateLimit } from "./rate-limit";

export const MAX_BODY_BYTES = 20 * 1024;
export const WRITES_PER_HOUR = 30;

export const dynamic = "force-dynamic";

/** Wrap a handler: ApiError -> {error:{code,message}} with its status; anything else -> 500 (logged, message not leaked). */
export async function handle(fn: () => Promise<unknown>, status = 200): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn(), { status });
  } catch (e) {
    if (e instanceof ApiError) {
      const retry = e.extra?.retryAfterSec;
      return NextResponse.json({ error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status, headers: typeof retry === "number" ? { "retry-after": String(retry) } : undefined });
    }
    console.error(e);
    return NextResponse.json({ error: { code: "internal_error", message: "Unexpected server error." } }, { status: 500 });
  }
}

/** Write endpoints: ensures the anonymous owner cookie, applies the per-owner write limit, then runs fn(owner). */
export async function handleWrite(req: Request, fn: (owner: Owner) => Promise<unknown>, status = 200): Promise<NextResponse> {
  const owner = resolveOwner(req);
  const res = await handle(async () => {
    rateLimit(`write:${owner.id}`, WRITES_PER_HOUR);
    return fn(owner);
  }, status);
  res.headers.append("set-cookie", ownerCookie(owner.id, req));
  return res;
}

/** Parse a JSON body, rejecting anything over 20KB with 413 (checked on the declared length and while streaming). */
export async function readJson(req: Request): Promise<unknown> {
  const tooBig = () => new ApiError(413, "payload_too_large", `Request body must be ${MAX_BODY_BYTES / 1024}KB or smaller.`);
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw tooBig();
  let text = "";
  if (req.body) {
    const reader = req.body.getReader();
    const dec = new TextDecoder();
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_BODY_BYTES) {
        reader.cancel().catch(() => {});
        throw tooBig();
      }
      text += dec.decode(value, { stream: true });
    }
    text += dec.decode();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}
