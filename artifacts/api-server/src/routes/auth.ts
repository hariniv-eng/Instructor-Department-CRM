import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
  toSafeAppUser,
} from "../lib/auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const rows = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.email, email.trim().toLowerCase()))
    .limit(1);
  const user = rows[0];

  // Same generic message whether the email doesn't exist, the password is
  // wrong, or the account isn't an Admin account — this sign-in form is
  // Admin-only now (2026-09: the Manager role has no login of its own
  // anymore, see routes/index.ts), and none of those three cases should be
  // distinguishable from a failed login attempt.
  if (!user || !user.isActive || user.role !== "admin") {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const { token } = await createSession(user.id);
  await db.update(appUsersTable).set({ lastLoginAt: new Date() }).where(eq(appUsersTable.id, user.id));

  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  res.json(toSafeAppUser(user));
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (token) await destroySession(token);
  res.clearCookie(SESSION_COOKIE_NAME, { path: sessionCookieOptions.path });
  res.status(204).end();
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json(toSafeAppUser(req.user!));
});

router.post("/auth/password", requireAuth, async (req, res) => {
  const { current_password: currentPassword, new_password: newPassword } = req.body as {
    current_password?: string;
    new_password?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "current_password and new_password are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "new_password must be at least 8 characters" });
    return;
  }

  const user = req.user!;
  const valid = await verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const { hash, salt } = await hashPassword(newPassword);
  await db
    .update(appUsersTable)
    .set({ passwordHash: hash, passwordSalt: salt, updatedAt: new Date() })
    .where(eq(appUsersTable.id, user.id));

  res.status(204).end();
});

export default router;
