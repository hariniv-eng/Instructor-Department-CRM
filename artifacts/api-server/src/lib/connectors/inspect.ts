// Standalone CLI to confirm the real field names each live source returns,
// before relying on the sync endpoints. Run one of:
//   pnpm --filter @workspace/api-server run inspect:darwinbox
//   pnpm --filter @workspace/api-server run inspect:darwinbox-exits
//   pnpm --filter @workspace/api-server run inspect:bigquery
//   pnpm --filter @workspace/api-server run inspect:instructor-unit-completion
//   pnpm --filter @workspace/api-server run inspect:instructor-practice-exam
//   pnpm --filter @workspace/api-server run inspect:training-status-aggregation
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

// "darwinbox-exits-for" is its own branch, not a plain no-arg loader like
// the others below -- it takes a third argv, a comma-separated list of
// employee_ids, and checks each one against the base report + every
// configured enrichment report individually (see
// inspectExitDataForEmployees() in darwinboxExits.ts for why this exists
// separately from the aggregate inspectDarwinboxExits() below).
if (target === "darwinbox-exits-for") {
  const idsArg = process.argv[3];
  if (!idsArg) {
    console.error(`Usage: npx tsx src/lib/connectors/inspect.ts darwinbox-exits-for <comma-separated employee_ids>`);
    process.exit(1);
  }
  const employeeIds = idsArg.split(",").map((id) => id.trim()).filter(Boolean);
  import("./darwinboxExits")
    .then((m) => m.inspectExitDataForEmployees(employeeIds))
    .catch((e) => {
      console.error(`darwinbox-exits-for inspection failed:`, e instanceof Error ? e.message : e);
      process.exit(1);
    });
} else {
  const loaders = {
    darwinbox: () => import("./darwinbox").then((m) => m.inspectDarwinbox),
    "darwinbox-exits": () => import("./darwinboxExits").then((m) => m.inspectDarwinboxExits),
    bigquery: () => import("./bigquery").then((m) => m.inspectBigQuery),
    "instructor-unit-completion": () => import("./instructorLearningStatus").then((m) => m.inspectUnitCompletion),
    "instructor-practice-exam": () => import("./instructorLearningStatus").then((m) => m.inspectPracticeExamAttempts),
    "training-status-aggregation": () => import("./instructorLearningStatus").then((m) => m.inspectTrainingStatusAggregation),
  } as const;

  const loadRun = loaders[target as keyof typeof loaders];

  if (!loadRun) {
    console.error(
      `Unknown target "${target}". Use one of: darwinbox, darwinbox-exits, darwinbox-exits-for, bigquery, instructor-unit-completion, instructor-practice-exam, training-status-aggregation.`
    );
    process.exit(1);
  }

  loadRun()
    .then((run) => run())
    .catch((e) => {
      console.error(`${target} inspection failed:`, e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
