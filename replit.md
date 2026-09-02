# Instructor Department CRM

An internal instructor-operations CRM for tracking headcount, source reconciliation, department classification, uploads, and workforce status.

## Run & Operate

- Start the `artifacts/instructor-crm: web` workflow for the Vite frontend.
- Start the `artifacts/api-server: API Server` workflow for the Express API.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/instructor-crm/` — React/Vite CRM frontend, served at `/`
- `artifacts/api-server/` — Express API, served at `/api`
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/api-client-react/` and `lib/api-zod/` — generated API client and validation types
- `lib/db/src/schema/index.ts` — Drizzle database schema
- `artifacts/instructor-crm/src/index.css` — frontend theme and global styles

## Architecture decisions

- Frontend and API run as separate artifact-owned workflows and communicate through relative `/api` URLs.
- API response types are generated from the OpenAPI contract; regenerate after changing the contract.
- The development database schema is managed with Drizzle and initialized with the DB package's `push` script.

## Product

The app provides an instructor workforce dashboard, searchable instructor records, source upload history, reconciliation status, and reporting across departments, campuses, managers, payroll classification, and deployment state.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- A fresh database must run `pnpm --filter @workspace/db run push` before the dashboard APIs will work.
- The CRM starts with an empty database. Populate it through source uploads or configured live-sync connectors.
- Do not run `pnpm dev` at the workspace root; use the artifact workflows.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
