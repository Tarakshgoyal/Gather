import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { upsertAuthUser } from "@/app/lib/db";
import { AUTH_COOKIE, hashPassword, signSessionToken } from "@/app/lib/auth";

export const runtime = "nodejs";

const SKINS = ["001", "004", "012", "028", "043", "053", "067", "072", "079"];
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeName(name: unknown) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { name?: string; email?: string; password?: string } | null;
    const name = normalizeName(body?.name);
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";

    if (name.length < 2 || name.length > 80) return Response.json({ error: "Enter your full name." }, { status: 400 });
    if (!isValidEmail(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const passwordHash = await hashPassword(password);
    const user = await upsertAuthUser({
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      skin: SKINS[Math.floor(Math.random() * SKINS.length)],
    });

    if (!user) return Response.json({ error: "Auth database is unavailable." }, { status: 503 });

    const response = NextResponse.json({
      ok: true,
      message: "Account created.",
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed.";
    const isDatabaseError = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|database|postgres|neon/i.test(message);
    return Response.json({
      error: isDatabaseError
        ? "Could not reach the auth database. Check your Neon connection and try again."
        : `Could not create the account. ${message}`,
    }, { status: isDatabaseError ? 503 : 502 });
  }
}

