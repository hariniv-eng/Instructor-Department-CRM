// One-off, READ-ONLY (2026-10-13): checks the "Contribution of NIAT instructors" card. Takes the exact NIAT (Deployed)
// instructor list the Overview uses (from the live /api/reports/instructors, same rule as productLabel() in the frontend),
// then, for each person, shows which NIAT cohort(s) they were given and -- for those with none -- WHY (from the
// instructor_contribution table). Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_niat_deployed_check.ts
import { db, instructorContributionTable } from "@workspace/db";

const BASE = process.env.CHECK_BASE_URL ?? "https://instructor-department-crm.replit.app";

type P = { id: number; full_name: string; employee_id: string | null; teachos_user_id?: string | null; classification: string | null; institutes?: string[]; darwin_manager?: string | null; niat_cohorts?: string[] };

function productLabel(p: P): string {
  if (p.classification === "excluded_ops_managers" || p.classification === "instructor_ops") return "Support";
  const inst = p.institutes ?? [];
  if (inst.some((i) => i.toLowerCase().includes("academy"))) return "Academy";
  const dm = (p.darwin_manager ?? "").toLowerCase();
  if (dm.includes("nw0005864") || dm.includes("jashwanth dandu")) return "IIT X DSA";
  if (inst.some((i) => i.toLowerCase().includes("intensive"))) return "Intensive";
  if (inst.includes("Training Institute")) return "NIAT (Training)";
  if (inst.length === 0) return "NIAT (Training)";
  return "NIAT (Deployed)";
}

async function main() {
  const res = await fetch(`${BASE}/api/reports/instructors`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${BASE}`);
  const report: any = await res.json();
  const split = report.access_breakdown?.instructors;
  const seen = new Set<number>();
  const people: P[] = [...(split?.both?.people ?? []), ...(split?.darwin_only?.people ?? []), ...(split?.teachos_only?.people ?? [])].filter((p: P) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const byProduct = new Map<string, number>();
  for (const p of people) byProduct.set(productLabel(p), (byProduct.get(productLabel(p)) ?? 0) + 1);
  console.log(`Instructors on the Overview: ${people.length}`);
  console.log("By product:", Object.fromEntries(byProduct));
  const deployed = people.filter((p) => productLabel(p) === "NIAT (Deployed)");
  console.log(`\nNIAT (Deployed) instructors: ${deployed.length}\n`);

  const contrib = await db.select({ id: instructorContributionTable.instructorUserId, all: instructorContributionTable.allBatches, recent: instructorContributionTable.recentBatches, cohorts: instructorContributionTable.niatCohorts }).from(instructorContributionTable);
  const byUser = new Map(contrib.map((c) => [c.id, c]));

  const reasons = new Map<string, P[]>();
  const add = (k: string, p: P) => reasons.set(k, [...(reasons.get(k) ?? []), p]);
  const cohortCounts = new Map<string, number>();
  const unmapped = new Map<string, number>();
  for (const p of deployed) {
    const cohorts = [...new Set(p.niat_cohorts ?? [])];
    if (cohorts.length > 0) { const k = cohorts.join(" + "); cohortCounts.set(k, (cohortCounts.get(k) ?? 0) + 1); continue; }
    const c = p.teachos_user_id ? byUser.get(p.teachos_user_id) : undefined;
    if (!p.teachos_user_id) add("no TeachOS user id (cannot match sessions)", p);
    else if (!c) add("no contribution row at all (no completed session ever)", p);
    else if (c.recent.length === 0) add("has sessions, but none in the last 30 days and none mappable in the last 2 months", p);
    else { add("taught in the last 30 days, but batch maps to NO NIAT cohort", p); for (const b of c.recent) unmapped.set(b, (unmapped.get(b) ?? 0) + 1); }
  }
  console.log("With a cohort:");
  for (const [k, n] of [...cohortCounts.entries()].sort()) console.log(`  ${k}\t${n}`);
  const withCohort = [...cohortCounts.values()].reduce((a, b) => a + b, 0);
  console.log(`  -> ${withCohort} of ${deployed.length}\n`);
  console.log("Without a cohort, and why:");
  for (const [k, list] of reasons) { console.log(`  ${list.length}\t${k}`); for (const p of list.slice(0, 8)) console.log(`      ${p.full_name} (${p.employee_id ?? "-"}) campus: ${(p.institutes ?? []).join(", ") || "-"}`); if (list.length > 8) console.log(`      ... and ${list.length - 8} more`); }
  if (unmapped.size) { console.log("\nBatch names that map to no cohort (count of instructors):"); for (const [b, n] of [...unmapped.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${b}`); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
