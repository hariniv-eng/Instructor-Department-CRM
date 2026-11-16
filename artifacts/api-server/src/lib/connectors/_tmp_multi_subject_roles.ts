// One-off, READ-ONLY (2026-11-16, per request: "the instructors active in several subjects -- what is their job title, mentor or
// instructor?"). NIAT (Training) instructors in TeachOS with activity in 2+ subjects in the last 30 days (demos / AI assessments or
// learning-portal units completed -- same data as Training - Readiness). Prints employee ID, name, Darwin designation, TeachOS role,
// FCC team (classification) and the subjects with counts. Console only, nothing written.
//   pnpm exec tsx src/lib/connectors/_tmp_multi_subject_roles.ts
import { db, instructorsTable, instructorContributionTable } from "@workspace/db";
import { fetchReadinessEvaluations, fetchRecentLpActivity, learningNowOf } from "./trainingReadiness";
import { lectureNameIndex } from "./demoTraining";
import { normUid } from "./topinAssessments";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const EXCL = new Set(["excluded_other_department", "excluded_non_department_team", "excluded_ops_managers", "instructor_ops"]);

async function main() {
  const people = (await db.select().from(instructorsTable)).filter((r) => r.inTeachos && r.teachosUserId && !EXCL.has(r.classification ?? "") && productOf(r) === "NIAT (Training)");
  const deployed = new Map((await db.select().from(instructorContributionTable)).map((c) => [normUid(c.instructorUserId), c.deploymentDate]));
  const [evs, lp] = await Promise.all([fetchReadinessEvaluations(true), fetchRecentLpActivity(true)]);
  const idx = lectureNameIndex();
  const out: { row: string; title: string; main: boolean }[] = [];
  for (const p of people) {
    const uid = normUid(p.teachosUserId!);
    const mapped = (normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null) ?? null;
    const l = learningNowOf(mapped, evs.byUid.get(uid) ?? [], { joining: null, deployed: deployed.get(uid) ?? null }, lp.get(uid), idx);
    const any = new Set([...l.demos, ...l.lp].map((a) => a.subject));
    if (any.size < 2) continue;
    const title = p.designation || "(no designation)";
    const fmt = (xs: { subject: string; count: number }[]) => xs.map((a) => `${a.subject} ${a.count}`).join(", ") || "-";
    out.push({ title, main: l.subjects.length > 1,
      row: `${p.employeeId ?? "?"} | ${p.fullName} | ${title} | TeachOS role ${p.teachosRole || "-"} | FCC team ${p.classification || "-"} | mapped ${mapped ?? "-"} | demos+AI: ${fmt(l.demos)} | LP units: ${fmt(l.lp)}${l.subjects.length > 1 ? ` | 2+ MAIN: ${l.subjects.join(" + ")}` : ""}` });
  }
  out.sort((a, b) => a.title.localeCompare(b.title) || a.row.localeCompare(b.row));
  console.log(`Active in 2+ subjects (last 30 days): ${out.length} of ${people.length} training instructors`);
  console.log("employee | name | designation | TeachOS role | FCC team | mapped | demos+AI per subject | LP units per subject | 2+ main subjects (25% rule)\n");
  for (const o of out) console.log(o.row);
  const tally = new Map<string, [number, number]>();
  for (const o of out) { const t = tally.get(o.title) ?? [0, 0]; t[0]++; if (o.main) t[1]++; tally.set(o.title, t); }
  console.log("\nBy designation (all with 2+ subjects / of them, 2+ main subjects):");
  for (const [t, [n, m]] of [...tally].sort((a, b) => b[1][0] - a[1][0])) console.log(`  ${t}: ${n} / ${m}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
