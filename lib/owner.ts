/** Anonymous owner identity: a random uid in an httpOnly cookie (gl_uid). No login, no personal data. */
export const OWNER_COOKIE = "gl_uid";
export const SYSTEM_OWNER = "system";
const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Owner {
  id: string;
  isNew: boolean;
}

export function resolveOwner(req: Request): Owner {
  const m = /(?:^|;\s*)gl_uid=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  if (m && UID_RE.test(m[1])) return { id: m[1], isNew: false };
  return { id: crypto.randomUUID(), isNew: true };
}

export function ownerCookie(id: string, req: Request): string {
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return `${OWNER_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
