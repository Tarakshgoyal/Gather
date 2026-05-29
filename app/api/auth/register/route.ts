import crypto from "node:crypto";
import { createEmailVerificationToken, upsertUnverifiedAuthUser } from "@/app/lib/db";
import { createVerificationToken, hashPassword } from "@/app/lib/auth";
import { sendVerificationEmail } from "@/app/lib/smtp";

export const runtime = "nodejs";

const SKINS = ["001", "004", "012", "028", "043", "053", "067", "072", "079"];

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
    const { token, tokenHash } = createVerificationToken();
    const user = await upsertUnverifiedAuthUser({
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      skin: SKINS[Math.floor(Math.random() * SKINS.length)],
    });

    if (!user) return Response.json({ error: "Auth database is unavailable." }, { status: 503 });
    if (user.emailVerified) return Response.json({ error: "This email is already verified. Sign in instead." }, { status: 409 });

    await createEmailVerificationToken(user.id, tokenHash);
    const verificationUrl = new URL(`/api/auth/verify?token=${encodeURIComponent(token)}`, request.url).toString();
    await sendVerificationEmail(email, name, verificationUrl);

    return Response.json({ ok: true, message: "Verification email sent." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed.";
    const isDatabaseError = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|database|postgres|neon/i.test(message);
    return Response.json({
      error: isDatabaseError
        ? "Could not reach the auth database. Check your Neon connection and try again."
        : `Could not send the verification email. ${message}`,
    }, { status: isDatabaseError ? 503 : 502 });
  }
}
