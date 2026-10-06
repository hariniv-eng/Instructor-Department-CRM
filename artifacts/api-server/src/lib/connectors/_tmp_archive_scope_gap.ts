// One-off diagnostic (2026-10-06): Instructors-tab department count (~695)
// vs Instructor Archive page total (~687) after the inArchiveScope change.
// Re-runs the live department filter (same as departmentRows in reports.ts)
// and compares against archive rows flagged inArchiveScope, matching the
// way archiveInstructors.ts's findArchiveMatch() does (employee_id, then
// teachos_user_id, then normalized name), to list exactly who is missing.
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { normalize } from "../reconcile";

type LiveRow = typeof instructorsTable.$inferSelect;
type ArchiveRow = typeof instructorArchiveTable.$inferSelect;

function departmentRows(all: LiveRow[], confirmed: (r: LiveRow) => boolean) {
  const darwin = all.filter((r) => r.inDarwin && (!r.inDarwinFullRoster || confirmed(r)) && !r.classification && (r.deptBucket === "tech" || r.deptBucket === "non_tech"));
  const teachosOnly = all.filter((r) => r.inTeachos && !r.inDarwin);
  const payroll = teachosOnly.filter((r) => r.classification === "payroll_converted");
  const needsReview = teachosOnly.filter((r) => r.classification !== "excluded_other_department" && r.classification !== "excluded_non_department_team" && r.classification !== "iit_kharagpur_team" && r.classification !== "payroll_converted");
  const mentors = all.filter((r) => r.inDarwin && !r.inDarwinFullRoster && r.classification === "mentor");
  const ops = all.filter((r) => r.classification === "excluded_ops_managers");
  return [...darwin, ...payroll, ...needsReview, ...mentors, ...ops];
}

function findArchive(archived: ArchiveRow[], r: LiveRow): ArchiveRow | undefined {
  if (r.employeeId) { const m = archived.find((a) => a.employeeId === r.employeeId); if (m) return m; }
  if (r.teachosUserId) { const m = archived.find((a) => a.teachosUserId === r.teachosUserId); if (m) return m; }
  const n = normalize(r.fullName);
  return archived.find((a) => normalize(a.fullName) === n);
}

async function main() {
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const { CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER } = await import("../../data/classificationOverrides");
  const confirmed = (r: LiveRow) => CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER.some((e) => (e.teachosUserId ? e.teachosUserId === r.teachosUserId : e.employeeId ? e.employeeId === r.employeeId : normalize(e.fullName) === normalize(r.fullName)));

  const dept = departmentRows(live, confirmed);
  const flagged = archive.filter((a) => a.inArchiveScope);
  console.log(`Live department rows (Instructors tab count): ${dept.length}`);
  console.log(`Archive rows total: ${archive.length}, flagged inArchiveScope: ${flagged.length}`);
  console.log(`Archive most recent lastSyncedAt: ${archive.map((a) => a.lastSyncedAt.getTime()).reduce((x, y) => Math.max(x, y), 0) ? new Date(Math.max(...archive.map((a) => a.lastSyncedAt.getTime()))).toISOString() : "n/a"}`);

  let notInArchive = 0, notFlagged = 0, sharedArchiveRow = 0;
  const archiveIdUse = new Map<number, LiveRow[]>();
  for (const r of dept) {
    const a = findArchive(archive, r);
    if (!a) { notInArchive += 1; console.log(`  NO ARCHIVE ROW: live id=${r.id} emp=${r.employeeId} teachos=${r.teachosUserId} name="${r.fullName}"`); continue; }
    archiveIdUse.set(a.id, [...(archiveIdUse.get(a.id) ?? []), r]);
    if (!a.inArchiveScope) { notFlagged += 1; console.log(`  ARCHIVE ROW NOT FLAGGED: live id=${r.id} -> archive id=${a.id} name="${r.fullName}" emp=${r.employeeId}`); }
  }
  for (const [aid, rows] of archiveIdUse) {
    if (rows.length > 1) { sharedArchiveRow += rows.length - 1; console.log(`  ONE ARCHIVE ROW (id=${aid}) SHARED BY ${rows.length} LIVE ROWS: ${rows.map((r) => `live id=${r.id} emp=${r.employeeId} name="${r.fullName}"`).join(" | ")}`); }
  }
  console.log(`\nSummary: dept rows with no archive row=${notInArchive}, archive row exists but unflagged=${notFlagged}, extra live rows collapsed into a shared archive row=${sharedArchiveRow}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
