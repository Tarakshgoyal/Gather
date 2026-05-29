import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/app/lib/auth";
import { findAuthUserById } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return Response.json({ user: null });

  const user = await findAuthUserById(payload.sub);
  if (!user || !user.emailVerified) return Response.json({ user: null });

  return Response.json({
    user: { id: user.id, name: user.name, email: user.email, skin: user.skin },
  });
}
