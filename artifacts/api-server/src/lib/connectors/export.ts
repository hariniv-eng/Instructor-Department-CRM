// Standalone CLI to fetch a live source and save it as a local CSV — a
// stand-in until the actual sync-to-database step is wired up (that part
// needs DATABASE_URL, which only resolves from inside Replit — see
// LIVE_SYNC.md). Run one of:
//   pnpm --filter @workspace/api-server run export:darwinbox
//   pnpm --filter @workspace/api-server run export:darwinbox-exits
//   pnpm --filter @workspace/api-server run export:teachos
//
// Writes to artifacts/api-server/exports/<source>.csv, overwriting each
// run. That folder is gitignored — these files contain real names, emails,
// and phone numbers, and must never end up in the shared repo.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import type { SheetRow } from "../reconcile";

// Same reasoning as inspect.ts: load .env by an explicit path, and only
// import the connector modules (dynamically) afterward — config.ts builds
// its config object at module-evaluation time, so a static import at the
// top of this file would run before .env is in process.env.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
}

// Exit-date-ish columns read as "NA" in the CSV when empty, rather than a
// blank cell — easier to scan at a glance than an ambiguous empty cell.
// Every other column is left as whatever the source actually returned.
const NA_FILL_COLUMNS = ["Date Of Exit", "Exit Date"];

function fillEmptyWithNA(rows: SheetRow[]): SheetRow[] {
  return rows.map((row) => {
    const filled: SheetRow = { ...row };
    for (const col of NA_FILL_COLUMNS) {
      if (col in filled) {
        const value = filled[col];
        const isEmpty = value === null || value === undefined || String(value).trim() === "";
        if (isEmpty) filled[col] = "NA";
      }
    }
    return filled;
  });
}

function toCsv(rows: SheetRow[]): string {
  if (!rows.length) return "";
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escape(row[c])).join(","));
  return lines.join("\r\n");
}

const loaders = {
  darwinbox: () => import("./darwinbox").then((m) => m.fetchDarwinRows()),
  "darwinbox-exits": () => import("./darwinboxExits").then((m) => m.fetchExitRows()),
  teachos: () => import("./bigquery").then((m) => m.fetchTeachosRows()),
} as const;

const target = process.argv[2];
const loadRows = loaders[target as keyof typeof loaders];

if (!loadRows) {
  console.error(`Unknown target "${target}". Use one of: darwinbox, darwinbox-exits, teachos.`);
  process.exit(1);
}

loadRows()
  .then((rows) => {
    const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../exports");
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${target}.csv`);
    writeFileSync(outPath, toCsv(fillEmptyWithNA(rows as SheetRow[])), "utf8");
    console.log(`Wrote ${rows.length} rows to ${outPath}`);
  })
  .catch((e) => {
    console.error(`${target} export failed:`, e instanceof Error ? e.message : e);
    process.exit(1);
  });
