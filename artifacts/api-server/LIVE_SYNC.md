# Live data sync — Darwinbox + BigQuery

This wires your three real data sources straight into the app, reusing the
exact reconciliation logic your manual CSV/XLSX upload already uses (both
now go through `src/lib/reconcile.ts`):

1. **Darwinbox Master API** — active employee roster ("Darwin" data)
2. **Darwinbox Reports Builder API** — a custom "exit employee details" report
3. **BigQuery** — the TeachOS deployment table

## What was added

- `src/lib/reconcile.ts` — the name-matching/reconciliation logic, extracted
  out of `routes/uploads.ts` (unchanged) so both manual uploads and live
  sync share one implementation.
- `src/lib/connectors/` — `config.ts` (env loading), `timeout.ts` (hard
  wall-clock timeout so a stuck network call can't hang a request), and the
  three clients: `darwinbox.ts`, `darwinboxExits.ts`, `bigquery.ts`. Each
  fetches + maps its source into the same row shape (`"Full Name"`,
  `"Employee Id"`, `instructor_name`, ...) your CSV parser already produces.
- `src/lib/scheduler.ts` — background auto-sync via node-cron, on the
  intervals set in `.env`.
- `src/lib/syncState.ts` — in-memory last-sync-per-source record, backing
  `GET /api/sync/status`.
- `src/routes/sync.ts` — `POST /api/sync/darwinbox`, `/darwinbox-exits`,
  `/teachos`, and `GET /api/sync/status`. Mounted in `routes/index.ts`.
- `lib/api-spec/openapi.yaml` — added the four endpoints + `SyncResult`/
  `SyncStatus` schemas, so your existing Orval codegen picks them up.
- `.env` — your real Darwinbox + BigQuery credentials, already filled in.
  `bigquery-service-account.json` sits next to it.
- Root `.gitignore` now actually excludes `.env` and `*-service-account.json`
  — it didn't cover either before. **Double-check `git status` before your
  next commit** to make sure neither file is staged.

## Setup

```bash
pnpm install                                    # picks up @google-cloud/bigquery, node-cron, tsx
pnpm --filter @workspace/api-spec run codegen    # regenerate typed hooks + Zod schemas for the new /sync/* endpoints
pnpm --filter @workspace/api-server run dev      # loads .env automatically (--env-file-if-exists)
```

`DATABASE_URL` and `PORT` still need to be set the way they already are for
you locally (shell env, or fill in the commented lines at the top of
`.env`) — Replit deployment keeps getting those from Replit Secrets as
before; this `.env` only adds the three new sources on top.

## Confirm the field mappings against real data

Same caveat that came with the earlier prototype: the request *shape* for
all three sources is correct (Darwinbox's documented Basic-Auth + api_key/
datasetKey pattern; the standard `@google-cloud/bigquery` client), but the
**exact field names** in Darwinbox's and BigQuery's real responses haven't
been confirmed — building this happened somewhere with no outbound network
access. Once you're running this somewhere with real network access to
Darwinbox/BigQuery, run:

```bash
pnpm --filter @workspace/api-server run inspect:darwinbox
pnpm --filter @workspace/api-server run inspect:darwinbox-exits
pnpm --filter @workspace/api-server run inspect:bigquery
```

Each prints the raw response/schema plus a mapped sample row.

- **darwinbox**: if field names differ from `ALIASES` in
  `src/lib/connectors/darwinbox.ts`, add the real name to the front of the
  matching list.
- **darwinbox-exits**: hits an undocumented endpoint, so it carries the most
  uncertainty — if it errors, the report id or request shape likely needs
  adjusting (see the comment at the top of `darwinboxExits.ts`).
- **bigquery**: prints the table's actual columns before querying. The table
  name reads like unit/lesson completion tracking, not necessarily an
  instructor roster — it may already have the right columns, or your data
  team may point you at a cleaner table. If columns differ, update
  `EXPECTED_COLUMNS` in `src/lib/connectors/bigquery.ts`.

Send me the output of any of these and I'll finish that mapping in one more
pass.

## Frontend

Not wired up yet — the Upload page (`artifacts/instructor-crm/src/pages/
uploads.tsx`) currently only has the manual file-upload flow. Once you've
run `codegen`, hooks like `useSyncDarwinbox`, `useSyncDarwinboxExits`,
`useSyncTeachos`, and `useGetSyncStatus` will be available from
`@workspace/api-client-react` to add three "Sync Now" buttons/cards
alongside it — ask and I'll build that panel to match the existing page's
style.

## Already handled

- **Full-replace semantics**: each Darwin/TeachOS sync flips existing
  `in_darwin`/`in_teachos` flags before applying the fresh batch (same as
  manual upload), so someone who's actually left doesn't linger as "active."
- **Same matching, never auto-merged**: exact normalized name → space-
  stripped fallback → anything still unmatched gets a "possible match" note
  for manual review, never silently merged (two people can share a name).
- **Hard timeouts**: every live call is wrapped so a slow/blocked network
  can't hang a "Sync Now" request or a scheduled job.
