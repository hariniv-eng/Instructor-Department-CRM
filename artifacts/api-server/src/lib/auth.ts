import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { db, appUsersTable, appSessionsTable, type AppUser } from "@workspace/db";

const scrypt = promisify(scryptCallback);

const SCRYPT_KEYLEN = 64;
const SESSION_BYTES = 32;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const SESSION_COOKIE_NAME = "session_token";

// appUsersTable.role is a plain text column (matching this schema's existing
// convention for enum-like fields — see computedStatus, teachosRole in
// instructorsTable), so nothing enforces this at the DB layer. This is the
// one place call sites should reference instead of a bare string.
export type AppRole = "admin" | "manager";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_TTL_MS,
  path: "/",
};

// --- Passwords ---
// Node's built-in scrypt, not bcrypt/argon2 — no extra dependency needed.
// Salt + hash are stored separately (both hex) on appUsersTable.

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(derived, stored);
}

// --- Sessions ---
// An opaque random token stored in an httpOnly cookie. The token carries no
// claims of its own (nothing to sign) — every request re-checks this table,
// including expiresAt and the user's isActive flag, rather than trusting
// anything encoded client-side.

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(SESSION_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(appSessionsTable).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(appSessionsTable).where(eq(appSessionsTable.token, token));
}

export async function getSessionUser(token: string | undefined): Promise<AppUser | null> {
  if (!token) return null;

  const rows = await db
    .select({ user: appUsersTable })
    .from(appSessionsTable)
    .innerJoin(appUsersTable, eq(appSessionsTable.userId, appUsersTable.id))
    .where(and(eq(appSessionsTable.token, token), gt(appSessionsTable.expiresAt, new Date())))
    .limit(1);

  const user = rows[0]?.user;
  if (!user || !user.isActive) return null;
  return user;
}

export function toSafeAppUser(user: AppUser) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
    is_active: user.isActive,
    last_login_at: user.lastLoginAt,
  };
}
