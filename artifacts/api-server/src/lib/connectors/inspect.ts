// Standalone CLI to confirm the real field names each live source returns,
// before relying on the sync endpoints. Run one of:
//   pnpm --filter @workspace/api-server run inspect:darwinbox
//   pnpm --filter @workspace/api-server run inspect:darwinbox-exits
//   pnpm --filter @workspace/api-server run inspect:bigquery
//
// This only works once deployed somewhere with real network access to
// Darwinbox / BigQuery — see LIVE_SYNC.md.

import path from "node:path";
import { fileURLToPath } from "node:url";

// Loads .env from artifacts/api-server (this file's own directory, three
// levels up from src/lib/connectors) rather than relying on cwd matching —
// tsx's runtime cwd handling isn't guaranteed to line up with pnpm's
// --filter directory the way plain `node` does.
//
// This MUST run before the connector modules are loaded, and specifically
// before ./config: config.ts builds its exported `config` object once, at
// module-evaluation time — not lazily per property access. Static imports
// are hoisted and fully evaluated before any of *this* file's own code
// runs, no matter where the import statement is written — so a static
// `import { inspectDarwinbox } from "./darwinbox"` at the top of this file
// would have already built `config` from an empty process.env before
// loadEnvFile() below ever ran, and later setting process.env wouldn't
// retroactively update that already-built object. Using dynamic import()
// after loadEnvFile() avoids that: the connector modules (and config.ts)
// only get evaluated once .env is actually in process.env.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
  console.error("(fine if env vars are already set another way — otherwise this is why the next error happens)");
}

const target = process.argv[2];

const loaders = {
  darwinbox: () => import("./darwinbox").then((m) => m.inspectDarwinbox),
  "darwinbox-exits": () => import("./darwinboxExits").then((m) => m.inspectDarwinboxExits),
  bigquery: () => import("./bigquery").then((m) => m.inspectBigQuery),
} as const;

const loadRun = loaders[target as keyof typeof loaders];

if (!loadRun) {
  console.error(`Unknown target "${target}". Use one of: darwinbox, darwinbox-exits, bigquery.`);
  process.exit(1);
}

loadRun()
  .then((run) => run())
  .catch((e) => {
    console.error(`${target} inspection failed:`, e instanceof Error ? e.message : e);
    process.exit(1);
  });
