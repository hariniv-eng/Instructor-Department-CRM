// One-off CLI: prints an instructor's full current record straight from
// Postgres (the `instructors` table -- the app's own live, reconciled data),
// by a case-insensitive partial name match. Useful for answering "why is
// this specific person classified this way" (in_teachos, in_darwin,
// classification/classification_reason, exit_flag*, dept_bucket/dept_area)
// without clicking through the app's tabs, or independently double-checking
// a record this session's cloud sandbox can't query directly (no live
// DATABASE_URL there) -- see the "Mani Teja Jinkala" payroll/TeachOS-active
// question this was written for (2026-09-26).
//
// Run: pnpm --filter @workspace/api-server run check:instructor -- "Mani Teja Jinkala"
// (partial match is fine, e.g. "Mani Teja")

import path from "node:path";
import { fileURLToPath } from "node:url";

// Same reasoning as check:capability-managers/check:darwinbox-ids -- load
// .env by an explicit path (harmless no-op in Replit, where Secrets already
// populate process.env), and only import @workspace/db (which reads
// DATABASE_URL at module-evaluation time) afterward.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
try {
  process.loadEnvFile(envPath);
} catch {
  // Fine if this doesn't exist -- Replit Secrets already populate
  // process.env before this script runs there.
}

const search = process.argv[2];
if (!search) {
  console.error('Usage: pnpm --filter @workspace/api-server run check:instructor -- "Full Name or part of it"');
  process.exit(1);
}

Promise.all([import("@workspace/db"), import("drizzle-orm")])
  .then(async ([dbModule, orm]) => {
    const { db, instructorsTable } = dbModule;
    const rows = await db.select().from(instructorsTable).where(orm.ilike(instructorsTable.fullName, `%${search}%`));

    if (rows.length === 0) {
      console.log(`No instructor record found matching "${search}".`);
      return;
    }

    for (const row of rows) {
      console.log("----------------------------------------");
      console.log(`Name: ${row.fullName}  (row id ${row.id})`);
      console.log(`Employee Id: ${row.employeeId ?? "(none)"}`);
      console.log(`TeachOS User Id (BigQuery instructor_user_id): ${row.teachosUserId ?? "(none)"}`);
      console.log(`In TeachOS (last sync): ${row.inTeachos}`);
      console.log(`In Darwin (primary Instructors dept): ${row.inDarwin}    Via full-roster fallback: ${row.inDarwinFullRoster}`);
      console.log(`Darwin employee status: ${row.darwinEmployeeStatus ?? "(none)"}`);
      console.log(`Department: ${row.department ?? "(none)"}    Designation: ${row.designation ?? "(none)"}`);
      console.log(`Classification: ${row.classification ?? "(none, normal instructor)"}`);
      console.log(`Classification reason: ${row.classificationReason ?? "(none)"}`);
      console.log(`Computed status: ${row.computedStatus}`);
      console.log(`Exit flag: ${row.exitFlag}    Exit status: ${row.exitFlagStatus ?? "(none)"}    Exit date: ${row.exitFlagDate ?? "(none)"}`);
      console.log(`Exit-derived department: ${row.exitDepartment ?? "(none)"}    Exit-derived designation: ${row.exitDesignation ?? "(none)"}`);
      console.log(`Dept bucket: ${row.deptBucket ?? "(none)"}    Subject / dept area: ${row.deptArea ?? row.manualDeptArea ?? "(none)"}`);
      console.log(`Institutes (TeachOS): ${JSON.stringify(row.institutes)}`);
      console.log(`Capability Manager: ${row.teachosManager || row.manualCapabilityManager || "(none)"}`);
    }
    console.log("----------------------------------------");
    console.log(`${rows.length} matching record(s).`);
  })
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
