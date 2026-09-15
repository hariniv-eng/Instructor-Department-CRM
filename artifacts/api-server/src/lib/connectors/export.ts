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

// "teachos" deliberately does NOT use bigquery.ts's fetchTeachosRows()
// anymore (2026-09-15 fix) -- that connector queries
// niat_instructor_managers_and_instructors_details, which the live sync
// stopped using back on 2026-09-XX in favor of the two-connector split
// sync.ts itself runs (see its comment there): identity/institute/role/
// category from niatInstructorDetails.ts's niat_instructor_details, plus a
// supplementary Capability Manager pass from capabilityManager.ts's
// niat_instructor_managers_and_instructors_details, keyed on
// instructor_user_id. bigquery.ts's EXPECTED_COLUMNS still expects
// instructor_manager/instructor_manager_mail/instructormanager_id columns
// that niat_instructor_details never had -- calling it here (as this used
// to) just throws "missing expected columns". This mirrors sync.ts's real
// pipeline instead, so the export actually reflects what a live sync does.
async function loadTeachosRows(): Promise<SheetRow[]> {
  const [{ fetchNiatInstructorDetailsRows }, { fetchCapabilityManagerRows }] = await Promise.all([
    import("./niatInstructorDetails"),
    import("./capabilityManager"),
  ]);
  const [detailRows, managerRows] = await Promise.all([
    fetchNiatInstructorDetailsRows(),
    // Non-fatal, same as sync.ts's own capability-manager pass -- an export
    // shouldn't fail outright just because this supplementary table is
    // unreachable; it just comes back with no manager data attached.
    fetchCapabilityManagerRows().catch(() => [] as SheetRow[]),
  ]);
  const managersByTeachosId = new Map<string, string[]>();
  for (const row of managerRows) {
    const teachosUserId = row["instructor_user_id"] as string | null;
    const manager = row["instructor_manager"] as string | null;
    if (!teachosUserId || !manager) continue;
    const list = managersByTeachosId.get(teachosUserId) ?? [];
    if (!list.includes(manager)) list.push(manager);
    managersByTeachosId.set(teachosUserId, list);
  }
  return detailRows.map((row) => {
    const teachosUserId = row["instructor_user_id"] as string | null;
    const managers = teachosUserId ? managersByTeachosId.get(teachosUserId) : undefined;
    // Raw, un-reconciled candidate list (joined, when more than one) -- NOT
    // run through reconcileCapabilityManager()'s valid-roster/low-priority
    // filtering, since this is a straight data dump, not a sync.
    return { ...row, "Capability Manager (raw)": managers?.join("; ") ?? "" };
  });
}

const loaders = {
  darwinbox: () => import("./darwinbox").then((m) => m.fetchDarwinRows()),
  "darwinbox-exits": () => import("./darwinboxExits").then((m) => m.fetchExitRows()),
  teachos: loadTeachosRows,
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
