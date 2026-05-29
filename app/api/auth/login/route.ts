import { NextResponse } from "next/server";
import { AUTH_COOKIE, signSessionToken, verifyPassword } from "@/app/lib/auth";
import { findAuthUserByEmail } from "@/app/lib/db";

export const runtime = "nodejs";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return Response.json({ error: "Email and password are required." }, { status: 400 });

  const user = await findAuthUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }
  if (!user.emailVerified) {
    return Response.json({ error: "Verify your email before entering the office." }, { status: 403 });
  }

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, skin: user.skin },
  });
  response.cookies.set(AUTH_COOKIE, signSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

