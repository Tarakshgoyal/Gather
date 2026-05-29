import { AUTH_COOKIE, verifySessionToken } from "./auth";
import { findAuthUserById } from "./db";

function readCookie(header: string | null, name: string) {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function getRequestUser(request: Request) {
  const token = readCookie(request.headers.get("cookie"), AUTH_COOKIE);
  const payload = verifySessionToken(token ? decodeURIComponent(token) : undefined);
  if (!payload) return null;
  const user = await findAuthUserById(payload.sub);
  if (!user || !user.emailVerified) return null;
  return { id: user.id, name: user.name, email: user.email, skin: user.skin };
}

export function getRequestJwtUser(request: Request) {
  const token = readCookie(request.headers.get("cookie"), AUTH_COOKIE);
  const payload = verifySessionToken(token ? decodeURIComponent(token) : undefined);
  if (!payload) return null;
  return { id: payload.sub, name: payload.name, email: payload.email, skin: payload.skin };
}
