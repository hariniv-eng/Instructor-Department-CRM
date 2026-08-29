// Standalone entry point: load the three raw CSV exports (TeachOS deployment
// data, Darwin's active-employee export, Darwin's exit-report export)
// straight into the same raw tables the live syncs use (see storeRaw.ts),
// then run the EXACT SAME reconciliation + classification pipeline
// (../lib/reconcile.ts) the running app uses for live syncs and manual
// uploads. This is deliberately not a second copy of the bifurcation rules —
// every future change to who counts as an instructor, what "excluded" or
// "payroll_converted" means, etc. only ever needs to happen in reconcile.ts.
//
// Usage (from artifacts/api-server/):
//   pnpm run reconcile:from-csv -- \
//     --teachos exports/teachos.csv \
//     --darwin exports/darwinbox.csv \
//     --exits exports/darwinbox-exits.csv \
//     --out exports/teachos_instructors_master.csv
//
// All three input flags are optional — pass just the ones you have a fresh
// export for. Darwin exits (--exits) only refreshes the flag-only exit
// signal (see routes/sync.ts's comment on why exits never auto-subtract);
// it never sets manual_status="exited". recomputeStatuses() always re-runs
// at the end regardless of which inputs were given, since classification
// depends on whatever the instructors table + raw tables currently hold.
//
// Requires: DATABASE_URL configured (same as the rest of the app) and the
// classification/exit_flag columns already pushed —
// `pnpm --filter @workspace/db run push` — before this will work. This
// writes to your real Postgres DB, the same one the running app reads from.

import { readFileSync, writeFileSync } from "node:fs";
import { db, instructorsTable, uploadsTable } from "@workspace/db";
import { reconcileDarwin, reconcileTeachos, recomputeStatuses, type SheetRow } from "../lib/reconcile";
import { storeDarwinboxActive, storeDarwinboxExits, storeTeachosDeployment } from "../lib/storeRaw";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { cells.push(cell); cell = ""; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text: string): SheetRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: SheetRow = {};
    headers.forEach((header, index) => { row[header] = cells[index]?.trim() ?? ""; });
    return row;
  });
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// "exit_flag_status" -> "exitFlagStatus" — so the output header list below
// stays the single readable source of truth instead of a parallel mapping.
function toCamel(snakeCase: string): string {
  return snakeCase.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith("--") ? next : "true";
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = args.out ?? "exports/teachos_instructors_master.csv";
  let touchedAnySource = false;

  if (args.darwin) {
    const rows = parseCsv(readFileSync(args.darwin, "utf-8"));
    console.log(`Darwin active: ${rows.length} rows from ${args.darwin}`);
    const stored = await storeDarwinboxActive(rows);
    const result = await reconcileDarwin(rows);
    await db.insert(uploadsTable).values({ source: "Darwin", filename: args.darwin, rowCount: stored });
    console.log("  reconciled:", result);
    touchedAnySource = true;
  }

  if (args.teachos) {
    const rows = parseCsv(readFileSync(args.teachos, "utf-8"));
    console.log(`TeachOS: ${rows.length} rows from ${args.teachos}`);
    const stored = await storeTeachosDeployment(rows);
    const result = await reconcileTeachos(rows);
    await db.insert(uploadsTable).values({ source: "TeachOS", filename: args.teachos, rowCount: stored });
    console.log("  reconciled:", result);
    touchedAnySource = true;
  }

  if (args.exits) {
    const rows = parseCsv(readFileSync(args.exits, "utf-8"));
    console.log(`Darwin exits: ${rows.length} rows from ${args.exits} (flag-only — never auto-subtracted from the instructor count, see routes/sync.ts)`);
    const stored = await storeDarwinboxExits(rows);
    await db.insert(uploadsTable).values({ source: "Exit List", filename: args.exits, rowCount: stored });
    touchedAnySource = true;
  }

  if (!touchedAnySource) {
    console.log("No --teachos / --darwin / --exits given — re-running classification only, against whatever is already in the DB.");
  }

  await recomputeStatuses();
  console.log("recomputeStatuses() complete — classification + exit flags refreshed for every instructor.");

  const rows = await db.select().from(instructorsTable);
  const header = [
    "id", "employee_id", "teachos_user_id", "full_name", "org_email", "department", "sub_department", "designation",
    "in_darwin", "in_teachos", "computed_status", "manual_status", "classification", "classification_reason",
    "exit_flag", "exit_flag_status", "exit_flag_date", "notes",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    lines.push(header.map((h) => csvEscape(record[toCamel(h)])).join(","));
  }
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf-8");
  console.log(`Wrote ${rows.length} rows to ${outPath}`);

  console.log("Summary:", {
    total: rows.length,
    excluded: rows.filter((r) => r.classification?.startsWith("excluded")).length,
    payroll_converted: rows.filter((r) => r.classification === "payroll_converted").length,
    exit_flagged: rows.filter((r) => r.exitFlag).length,
    active: rows.filter((r) => (r.manualStatus ?? r.computedStatus) === "active").length,
    pending_deployment: rows.filter((r) => (r.manualStatus ?? r.computedStatus) === "pending_deployment").length,
    needs_review: rows.filter((r) => (r.manualStatus ?? r.computedStatus) === "needs_review").length,
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
