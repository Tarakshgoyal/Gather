import crypto from "node:crypto";

export const AUTH_COOKIE = "gather_session";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  skin: string;
  emailVerified: boolean;
};

type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  skin: string;
  exp: number;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters.");
  return secret;
}

function timingSafeEqualText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function signSessionToken(user: AuthUser) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    skin: user.skin,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
  } satisfies JwtPayload));
  const signature = crypto.createHmac("sha256", getAuthSecret()).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const expected = crypto.createHmac("sha256", getAuthSecret()).update(`${header}.${payload}`).digest("base64url");
  if (!timingSafeEqualText(signature, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtPayload;
    if (!decoded.sub || !decoded.email || !decoded.name || !decoded.skin || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
  return `scrypt:${salt}:${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "base64url"));
}

export function createVerificationToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashVerificationToken(token) };
}

export function hashVerificationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

