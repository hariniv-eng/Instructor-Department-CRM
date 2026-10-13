// One-off, READ-ONLY (2026-10-13): everyone on the Overview's "Contribution of NIAT instructors & mentors" card who is in the
// "No cohort yet" row -- instructors AND mentors, Product NIAT (Deployed) -- with the reason and any classes scheduled from
// 30 days ago to 30 days ahead. People whose only batch is an MVR batch are listed separately (the 2026 mapping fixes them
// on the next Contribution sync). Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_no_cohort_check.ts
import { db, instructorContributionTable } from "@workspace/db";
import { BATCH_NAME_TO_NIAT_COHORT } from "./instructorContribution";
import { inspectScheduleForUsers } from "./instructorContribution";

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
  const deployed = people.filter((p) => productLabel(p) === "NIAT (Deployed)");
  const none = deployed.filter((p) => (p.niat_cohorts ?? []).length === 0);
  console.log(`NIAT (Deployed) instructors + mentors: ${deployed.length}; with no cohort: ${none.length} (${none.filter((p) => p.role === "Mentor").length} mentors, ${none.filter((p) => p.role === "Instructor").length} instructors)\n`);

  const contrib = await db.select({ id: instructorContributionTable.instructorUserId, all: instructorContributionTable.allBatches, recent: instructorContributionTable.recentBatches }).from(instructorContributionTable);
  const byUser = new Map(contrib.map((c) => [c.id, c]));
  const ids = none.map((p) => p.teachos_user_id).filter((x): x is string => !!x);
  const sched = await inspectScheduleForUsers(ids, 30, 30);
  const map = BATCH_NAME_TO_NIAT_COHORT as Record<string, string>;

  for (const p of none.sort((a, b) => a.full_name.localeCompare(b.full_name))) {
    const c = p.teachos_user_id ? byUser.get(p.teachos_user_id) : undefined;
    let reason: string;
    if (!p.teachos_user_id) reason = "no TeachOS user id";
    else if (!c) reason = "no completed session ever";
    else if (c.recent.length === 0) reason = `completed sessions only before the last 2 months (batches: ${c.all.join("; ") || "-"})`;
    else {
      const unmapped = c.recent.filter((b) => !map[b]);
      reason = unmapped.length > 0 ? `batch not mapped to a cohort: ${unmapped.join("; ")}` : "has mapped batches (will show after the next Contribution sync)";
    }
    console.log(`${p.full_name} (${p.employee_id ?? "-"}) [${p.role}] campus: ${(p.institutes ?? []).join(", ") || "-"}`);
    console.log(`   why: ${reason}`);
    const mine = sched.filter((r) => r.instructor_user_id === p.teachos_user_id);
    if (p.teachos_user_id) console.log(mine.length === 0 ? "   classes -30d..+30d: none" : mine.map((r) => `   ${r.sessions} x ${r.session_status} ${r.session_type} | ${r.batch_name} | ${r.first_day} to ${r.last_day}`).join("\n"));
    console.log("");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
