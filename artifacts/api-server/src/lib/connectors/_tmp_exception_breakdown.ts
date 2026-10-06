// One-off (2026-10-06): explain the Instructors tab's Exception count.
// Same filter as computeDepartmentAndExceptionRows() in routes/reports.ts:
// exitFlag && status != Revoked && no exitVerification && classification not
// in NOT_DEPARTMENT_CLASSIFICATIONS. Read-only.
import { desc } from "drizzle-orm";
import { db, instructorsTable, uploadsTable } from "@workspace/db";

const NOT_DEPARTMENT = new Set(["excluded_other_department", "excluded_non_department_team", "iit_kharagpur_team", "other_department_manual"]);

async function main() {
  const all = await db.select().from(instructorsTable);
  const flagged = all.filter((r) => r.exitFlag);
  const rows = all.filter((r) => r.exitFlag && (r.exitFlagStatus ?? "").trim().toLowerCase() !== "revoked" && !r.exitVerification && !NOT_DEPARTMENT.has(r.classification ?? ""));
  console.log(`Live rows: ${all.length} | exitFlag=true: ${flagged.length} | in Exception queue: ${rows.length}`);
  console.log(`  flagged but already verified by a Capability Manager (exitVerification set): ${flagged.filter((r) => r.exitVerification).length}`);
  console.log(`  flagged but filtered as not-department classification: ${flagged.filter((r) => NOT_DEPARTMENT.has(r.classification ?? "")).length}`);
  const tally = (label: string, f: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, number>(); for (const r of rows) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
    console.log(`\nBy ${label}:`); for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v}x ${k}`);
  };
  // Why did it jump? Show recent sync history and how recent the exit dates are.
  const uploads = await db.select().from(uploadsTable).orderBy(desc(uploadsTable.uploadedAt)).limit(15);
  console.log("\nRecent syncs/uploads (newest first):");
  for (const u of uploads) console.log(`  ${u.uploadedAt.toISOString()} | ${u.source} | ${u.filename} | ${u.rowCount} rows`);
  tally("exit month (exitFlagDate)", (r) => (r.exitFlagDate ?? "(no date)").slice(0, 7));
  tally("exit status", (r) => r.exitFlagStatus ?? "(none)");
  tally("where they are today", (r) => `${r.inDarwin ? "in Darwin" : "not in Darwin"} / ${r.inTeachos ? "in TeachOS" : "not in TeachOS"}`);
  tally("classification", (r) => r.classification ?? "(regular instructor)");
  console.log("\nAll Exception rows:");
  for (const r of rows.sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""))) console.log(`  ${r.fullName} | ${r.employeeId} | ${r.exitFlagStatus} | ${r.exitFlagDate} | ${r.inDarwin ? "Darwin" : "-"}/${r.inTeachos ? "TeachOS" : "-"} | ${r.classification ?? ""}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
