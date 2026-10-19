// One-off, READ-ONLY (2026-10-19, per request: "check for any instances where there is no TeachOS account for a person, yet we show
// TeachOS details -- campus, Capability Manager -- for them"). For every live record NOT in TeachOS (inTeachos = false) it checks every
// TeachOS-sourced field and every place the app can still pull TeachOS data from:
//   teachosManager / institutes (campus) / teachosRole / enrolledPlans  -- should be empty (the TeachOS sync clears them)
//   manualCapabilityManager  -- a Capability Manager picked by hand on the Instructors tab (shown when TeachOS has none)
//   teachosUserId            -- an OLD TeachOS id kept from an earlier sync (never cleared), which Contribution / Training / profile
//                               data is joined on
//   archive niatCohorts      -- NIAT cohort shown from the Instructor Archive when the live data has none
// Prints a count per field, then every affected person. Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_no_teachos_audit.ts
import { eq } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, instructorContributionTable, instructorTrainingStatusTable } from "@workspace/db";

async function main() {
  const off = await db.select().from(instructorsTable).where(eq(instructorsTable.inTeachos, false));
  const archive = await db.select().from(instructorArchiveTable);
  const archByEmp = new Map(archive.filter((a) => a.employeeId).map((a) => [a.employeeId!, a]));
  const contribIds = new Set((await db.select({ id: instructorContributionTable.instructorUserId }).from(instructorContributionTable)).map((r) => r.id));
  const trainingIds = new Set((await db.select({ id: instructorTrainingStatusTable.instructorUserId }).from(instructorTrainingStatusTable)).map((r) => r.id));

  type Check = { key: string; label: string; test: (p: (typeof off)[number]) => string | null };
  const checks: Check[] = [
    { key: "cm_teachos", label: "Capability Manager from TeachOS (should be empty)", test: (p) => p.teachosManager || null },
    { key: "cm_manual", label: "Capability Manager picked by hand", test: (p) => p.manualCapabilityManager || null },
    { key: "campus", label: "Campus / institutes (should be empty)", test: (p) => ((p.institutes ?? []).length ? (p.institutes ?? []).join(", ") : null) },
    { key: "role", label: "TeachOS role (should be empty)", test: (p) => p.teachosRole || null },
    { key: "plans", label: "Enrolled plans (should be empty)", test: (p) => p.enrolledPlans || null },
    { key: "old_id", label: "Old TeachOS user id still stored", test: (p) => p.teachosUserId || null },
    { key: "contrib", label: "Contribution data joined on that old id", test: (p) => (p.teachosUserId && contribIds.has(p.teachosUserId) ? "yes" : null) },
    { key: "training", label: "Training data joined on that old id", test: (p) => (p.teachosUserId && trainingIds.has(p.teachosUserId) ? "yes" : null) },
    { key: "cohort_archive", label: "NIAT cohort shown from the Archive", test: (p) => { const a = p.employeeId ? archByEmp.get(p.employeeId) : undefined; return a?.niatCohorts?.length ? a.niatCohorts.join(", ") : null; } },
  ];
  console.log(`Live records NOT in TeachOS: ${off.length}\n`);
  for (const c of checks) console.log(`  ${c.label}: ${off.filter((p) => c.test(p)).length}`);
  const affected = off.filter((p) => checks.some((c) => c.test(p)));
  console.log(`\nAffected people: ${affected.length}`);
  console.log(`Name | Employee ID | Classification | Designation | In Darwin | ${checks.map((c) => c.key).join(" | ")}`);
  for (const p of affected.sort((a, b) => a.fullName.localeCompare(b.fullName))) {
    console.log(`${p.fullName} | ${p.employeeId ?? "-"} | ${p.classification ?? "-"} | ${p.designation ?? "-"} | ${p.inDarwin ? "yes" : "no"} | ${checks.map((c) => c.test(p) ?? "-").join(" | ")}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
