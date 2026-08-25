// Standalone CLI to confirm the real field names each live source returns,
// before relying on the sync endpoints. Run one of:
//   pnpm --filter @workspace/api-server run inspect:darwinbox
//   pnpm --filter @workspace/api-server run inspect:darwinbox-exits
//   pnpm --filter @workspace/api-server run inspect:bigquery
//
// This only works once deployed somewhere with real network access to
// Darwinbox / BigQuery — see LIVE_SYNC.md.

import { inspectDarwinbox } from "./darwinbox";
import { inspectDarwinboxExits } from "./darwinboxExits";
import { inspectBigQuery } from "./bigquery";

// Loads ./.env (relative to cwd, i.e. artifacts/api-server when run via
// `pnpm --filter @workspace/api-server run inspect:*`) into process.env.
// The connectors all read process.env lazily (inside functions, not at
// import time), so loading this after the imports above is fine.
try {
  process.loadEnvFile();
} catch {
  // no .env file present — fine, env vars may already be set another way
}

const target = process.argv[2];

const run = {
  darwinbox: inspectDarwinbox,
  "darwinbox-exits": inspectDarwinboxExits,
  bigquery: inspectBigQuery,
}[target as "darwinbox" | "darwinbox-exits" | "bigquery"];

if (!run) {
  console.error(`Unknown target "${target}". Use one of: darwinbox, darwinbox-exits, bigquery.`);
  process.exit(1);
}

run().catch((e) => {
  console.error(`${target} inspection failed:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
