// Standalone entry point: creates the first Admin and/or Manager login
// accounts for the CRM's app_users table. Safe to re-run — an email that
// already has an account is skipped, nothing is overwritten.
//
// 2026-09: Manager has no login of its own anymore — the app's /access
// chooser sends an unauthenticated visit either to /login (Admin) or
// straight into a public, read-only "Manager view" with no account needed
// (see App.tsx, and requireAuth+requireRole("admin") on the backend routes
// that stay gated). A manager row seeded here still gets created, but
// /auth/login now rejects any non-admin role — so seeding one currently has
// no effect through the app. Left in place since Manager login may come
// back later; harmless to seed or to skip.
//
// Usage (from artifacts/api-server/):
//   pnpm run seed:app-users
//
// Requires these env vars to be set first (Replit Secrets, or a local
// .env — never hardcode a password here or pass one on the command line
// where it'd land in shell history):
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
//   SEED_MANAGER_EMAIL, SEED_MANAGER_PASSWORD
// Either pair may be omitted if you only need to seed one account right now.
// Optional: SEED_ADMIN_NAME / SEED_MANAGER_NAME (defaults to "Admin" /
// "Manager" — shown in the sidebar once logged in).
//
// This never prints a password, including one you set — only whether each
// account was created or already existed.

import { eq } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import { hashPassword, type AppRole } from "../lib/auth";

async function seedOne(role: AppRole, email: string | undefined, password: string | undefined, fullName: string | undefined) {
  if (!email || !password) {
    console.log(`[seed:app-users] skipping ${role} — SEED_${role.toUpperCase()}_EMAIL/PASSWORD not both set`);
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.email, normalizedEmail)).limit(1);

  if (existing.length > 0) {
    console.log(`[seed:app-users] ${role}: ${normalizedEmail} already exists, skipping`);
    return;
  }

  const { hash, salt } = await hashPassword(password);
  await db.insert(appUsersTable).values({
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    fullName: fullName?.trim() || (role === "admin" ? "Admin" : "Manager"),
    role,
    isActive: true,
  });
  console.log(`[seed:app-users] ${role}: created ${normalizedEmail}`);
}

async function main() {
  await seedOne("admin", process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, process.env.SEED_ADMIN_NAME);
  await seedOne("manager", process.env.SEED_MANAGER_EMAIL, process.env.SEED_MANAGER_PASSWORD, process.env.SEED_MANAGER_NAME);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed:app-users] failed:", err);
  process.exit(1);
});
