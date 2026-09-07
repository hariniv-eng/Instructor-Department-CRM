import type { Request, Response, NextFunction } from "express";
import type { AppUser } from "@workspace/db";
import { SESSION_COOKIE_NAME, getSessionUser, type AppRole } from "../lib/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AppUser;
    }
  }
}

// Requires a valid, unexpired session for *either* role (admin or manager).
// Attaches the resolved user to req.user for downstream handlers/middleware.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const user = await getSessionUser(token);

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  req.user = user;
  next();
}

// Must run after requireAuth. 403s unless req.user's role is one of `roles`.
export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as AppRole)) {
      res.status(403).json({ error: "Not authorized for this resource" });
      return;
    }
    next();
  };
}
