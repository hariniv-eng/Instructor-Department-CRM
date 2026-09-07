# Admin/Manager login — handoff notes

All code is already written into your connected folder (`Instructor-Department-CRM`) as uncommitted working-tree changes on top of `main` at `d80dc18`. Nothing has been committed or pushed — that's on you, same as always. Both `pnpm --filter @workspace/api-server run typecheck` and `pnpm --filter @workspace/instructor-crm run typecheck` pass clean on this change set.

## What changed

New files:
- `artifacts/api-server/src/lib/auth.ts` — password hashing (scrypt), session create/verify/destroy
- `artifacts/api-server/src/middlewares/auth.ts` — `requireAuth`, `requireRole`
- `artifacts/api-server/src/routes/auth.ts` — login / logout / me / change-password
- `artifacts/api-server/src/scripts/seedAdmin.ts` — one-time account seeding script
- `artifacts/instructor-crm/src/hooks/use-auth.tsx` — auth context/hook
- `artifacts/instructor-crm/src/pages/login.tsx` — login page

Modified: `artifacts/api-server/{package.json, src/app.ts, src/routes/index.ts, src/routes/reports.ts}`, `artifacts/instructor-crm/src/{App.tsx, components/app-shell.tsx}`, `lib/db/src/schema/index.ts`, `lib/api-client-react/src/{index.ts, generated/api.ts, generated/api.schemas.ts}`, `lib/api-spec/openapi.yaml`.

## What it does

Two roles: **Admin** sees all 5 tabs (Overview, Instructors, Darwin Breakdown, TeachOS Breakdown, Source uploads). **Manager** sees only Overview + Instructors — the other 3 tabs (and their backend routes) now return 403 for a manager session, so it's enforced server-side, not just hidden in the nav.

Sessions are a plain `httpOnly` cookie holding a random token, checked against a new `app_sessions` table on every request — no JWT, no new npm packages either side (passwords use Node's built-in `scrypt`; sessions use `cookie-parser`, already an unused dependency).

## Steps only you can do

1. **Push the schema.** From `lib/db`: `pnpm --filter @workspace/db run push` (needs your `DATABASE_URL` — I don't have it and didn't try to get it).

2. **Seed the two accounts.** Set these four as Replit Secrets (or a local `.env` in `artifacts/api-server`) — **I did not set these myself, on purpose**, per the same rule I mentioned earlier about not handling credentials:
   ```
   SEED_ADMIN_EMAIL=harini.v@nxtwave.co.in
   SEED_ADMIN_PASSWORD=<the password you told me — set it yourself, I never typed it anywhere>
   SEED_MANAGER_EMAIL=venkatesh.pitchumani@nxtwave.co.in
   SEED_MANAGER_PASSWORD=<same here>
   ```
   Then, from `artifacts/api-server`: `pnpm run seed:app-users`. It's idempotent — safe to leave the secrets in place or remove them after. One thing worth flagging: the passwords you mentioned in chat (`admin@2026` / `manager@2026`) are pretty guessable for a live app — worth considering something stronger before you set them, though that's your call.

3. **Regenerate the API client for real, when convenient.** `lib/api-client-react`'s new hooks and `lib/api-zod`'s types were hand-written to match orval's output style, since the codegen tool doesn't run in this sandbox. Run `pnpm --filter @workspace/api-spec run codegen` on a machine where it works, to replace my hand-written version with the real generated one (the `openapi.yaml` spec is already updated to match).

4. **Review, commit, push, deploy** — all through your normal flow.

## Verifying it worked

After steps 1–2, log in as both seeded accounts on the deployed app: Admin should see all 5 nav items; Manager should see only Overview + Instructors, and typing `/darwin-breakdown`, `/teachos-breakdown`, or `/uploads` directly in the URL bar should bounce a Manager back to Overview.
