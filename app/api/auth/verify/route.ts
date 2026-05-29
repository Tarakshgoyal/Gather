import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, hashVerificationToken, signSessionToken } from "@/app/lib/auth";
import { verifyEmailToken } from "@/app/lib/db";

export const runtime = "nodejs";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const user = token ? await verifyEmailToken(hashVerificationToken(token)) : null;
  const redirectUrl = new URL("/", request.url);

  if (!user) {
    redirectUrl.searchParams.set("auth", "invalid-verification");
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.searchParams.set("auth", "verified");
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(AUTH_COOKIE, signSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

