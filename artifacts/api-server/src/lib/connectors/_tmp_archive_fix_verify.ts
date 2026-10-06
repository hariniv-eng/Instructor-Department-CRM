// Verification (2026-10-05) for the Instructor Archive visibility fix:
// confirms the new allRows-based filter (a) surfaces the 34 previously-
// hidden fully-exited rows, (b) doesn't pull in a flood of full-roster
// noise, and (c) the exit counts now match reality.
import { db, instructorArchiveTable } from "@workspace/db";
import { CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER } from "../../data/classificationOverrides";
import { normalize } from "../reconcile";

type ArchiveRow = typeof instructorArchiveTable.$inferSelect;

function isConfirmedDespiteFullRoster(row: ArchiveRow): boolean {
  const n = normalize(row.fullName);
  return CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER.some((entry) => {
    if (entry.teachosUserId) return entry.teachosUserId === row.teachosUserId;
    if (entry.employeeId) return entry.employeeId === row.employeeId;
    return normalize(entry.fullName) === n;
  });
}

const NOT_DEPARTMENT_CLASSIFICATIONS = new Set(["excluded_other_department", "excluded_non_department_team", "iit_kharagpur_team", "other_department_manual"]);

function oldFilter(allRows: ArchiveRow[]) {
  const darwinInstructors = allRows.filter((r) => r.inDarwin && (!r.inDarwinFullRoster || isConfirmedDespiteFullRoster(r)) && !r.classification && (r.deptBucket === "tech" || r.deptBucket === "non_tech"));
  const teachosOnly = allRows.filter((r) => r.inTeachos && !r.inDarwin);
  const payrollConverted = teachosOnly.filter((r) => r.classification === "payroll_converted");
  const needsReview = teachosOnly.filter((r) => r.classification !== "excluded_other_department" && r.classification !== "excluded_non_department_team" && r.classification !== "iit_kharagpur_team" && r.classification !== "payroll_converted");
  const mentors = allRows.filter((r) => r.inDarwin && !r.inDarwinFullRoster && r.classification === "mentor");
  const opsTeamRows = allRows.filter((r) => r.classification === "excluded_ops_managers");
  return [...darwinInstructors, ...payrollConverted, ...needsReview, ...mentors, ...opsTeamRows];
}

function newFilter(allRows: ArchiveRow[]) {
  return allRows.filter((r) => !NOT_DEPARTMENT_CLASSIFICATIONS.has(r.classification ?? "") && (!r.inDarwinFullRoster || !!r.classification || isConfirmedDespiteFullRoster(r)));
}

async function main() {
  const allRows = await db.select().from(instructorArchiveTable);
  const oldPeople = oldFilter(allRows);
  const newPeople = newFilter(allRows);

  const oldIds = new Set(oldPeople.map((r) => r.id));
  const newIds = new Set(newPeople.map((r) => r.id));

  console.log("OLD total:", oldPeople.length);
  console.log("NEW total:", newPeople.length);

  const added = newPeople.filter((r) => !oldIds.has(r.id));
  const removed = oldPeople.filter((r) => !newIds.has(r.id));
  console.log(`\nRows ADDED by the new filter: ${added.length}`);
  console.log(`Rows REMOVED by the new filter: ${removed.length}`);
  if (removed.length > 0) {
    console.log("  (should be 0 -- new filter should be a strict superset) Sample:");
    for (const r of removed.slice(0, 10)) console.log(`    id=${r.id} name="${r.fullName}" classification=${r.classification}`);
  }

  // Of the added rows, how many are genuine exits vs. full-roster noise
  // that slipped in because they happen to have SOME classification?
  const addedWithExitSignal = added.filter((r) => r.exitFlag || !!r.exitFlagDate || !!r.exitDate);
  const addedWithoutExitSignal = added.filter((r) => !(r.exitFlag || !!r.exitFlagDate || !!r.exitDate));
  console.log(`\nOf the ${added.length} added rows:`);
  console.log(`  with a real exit signal (expected -- the fix target): ${addedWithExitSignal.length}`);
  console.log(`  WITHOUT an exit signal (unexpected -- would need a closer look): ${addedWithoutExitSignal.length}`);
  for (const r of addedWithoutExitSignal.slice(0, 15)) {
    console.log(`    id=${r.id} name="${r.fullName}" classification=${r.classification} inDarwin=${r.inDarwin} inDarwinFullRoster=${r.inDarwinFullRoster} inTeachos=${r.inTeachos} deptBucket=${r.deptBucket}`);
  }

  const exitDateOf = (r: ArchiveRow) => r.exitFlagDate ?? r.exitDate ?? null;
  const newExitedCount = newPeople.filter((r) => !!exitDateOf(r)).length;
  const newActiveCount = newPeople.filter((r) => !exitDateOf(r)).length;
  console.log(`\nNEW filter: active_count=${newActiveCount} exited_count=${newExitedCount} (user currently sees exited_count=27 on the old filter)`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
