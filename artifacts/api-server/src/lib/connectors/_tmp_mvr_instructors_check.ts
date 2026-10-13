// One-off, READ-ONLY (2026-10-13): who is deployed at campus MVR, and which batches/cohorts are they teaching?
// Takes instructors + mentors from the live /api/reports/instructors (campus = person.institutes) and the batches from the
// instructor_contribution table. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_mvr_instructors_check.ts
import { db, instructorContributionTable } from "@workspace/db";
import { BATCH_NAME_TO_NIAT_COHORT } from "./instructorContribution";

const BASE = process.env.CHECK_BASE_URL ?? "https://instructor-department-crm.replit.app";
type P = { id: number; full_name: string; employee_id: string | null; teachos_user_id?: string | null; institutes?: string[]; niat_cohorts?: string[] };

async function main() {
  const res = await fetch(`${BASE}/api/reports/instructors`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${BASE}`);
  const report: any = await res.json();
  const seen = new Set<number>();
  const people: (P & { role: string })[] = [];
  for (const role of ["instructors", "mentors"] as const) {
    const split = report.access_breakdown?.[role];
    for (const p of [...(split?.both?.people ?? []), ...(split?.darwin_only?.people ?? []), ...(split?.teachos_only?.people ?? [])] as P[]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      people.push({ ...p, role: role === "instructors" ? "Instructor" : "Mentor" });
    }
  }
  const mvr = people.filter((p) => (p.institutes ?? []).some((i) => /mvr/i.test(i)));
  const campusNames = new Set(mvr.flatMap((p) => (p.institutes ?? []).filter((i) => /mvr/i.test(i))));
  console.log(`People (instructors + mentors) with a campus containing "MVR": ${mvr.length}`);
  console.log(`Campus names matched: ${[...campusNames].join(" | ") || "-"}\n`);

  const contrib = await db.select({ id: instructorContributionTable.instructorUserId, all: instructorContributionTable.allBatches, recent: instructorContributionTable.recentBatches, cohorts: instructorContributionTable.niatCohorts }).from(instructorContributionTable);
  const byUser = new Map(contrib.map((c) => [c.id, c]));
  const cohortOf = (batch: string) => (BATCH_NAME_TO_NIAT_COHORT as Record<string, string>)[batch] ?? "(no cohort mapped)";

  let teaching2026 = 0;
  for (const p of mvr.sort((a, b) => a.full_name.localeCompare(b.full_name))) {
    const c = p.teachos_user_id ? byUser.get(p.teachos_user_id) : undefined;
    const all = c?.all ?? [];
    const recent = c?.recent ?? [];
    const mvrBatches = all.filter((b) => /mvr/i.test(b));
    const is2026 = mvrBatches.some((b) => cohortOf(b) === "NIAT 2026");
    if (is2026) teaching2026 += 1;
    console.log(`${p.full_name} (${p.employee_id ?? "-"}) [${p.role}]`);
    console.log(`   campus: ${(p.institutes ?? []).join(", ")}`);
    console.log(`   MVR batches taught (all time): ${mvrBatches.map((b) => `${b} -> ${cohortOf(b)}`).join("; ") || "none"}`);
    console.log(`   recent (30 days) batches: ${recent.join("; ") || "none"}`);
    console.log(`   cohort shown on the Overview now: ${(p.niat_cohorts ?? []).join(", ") || "none"}   | NIAT 2026 at MVR: ${is2026 ? "YES" : "no"}\n`);
  }
  console.log(`Teaching NIAT 2026 at MVR (any completed MVR batch mapped to NIAT 2026): ${teaching2026} of ${mvr.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
