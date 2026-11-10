// One-off, READ-ONLY (2026-11-10, per request: "from the semester 1 and semester 3 instructors, bifurcate by subject -- Frontend,
// Backend, DSA, Gen AI, Aptitude, Maths, English -- by the subject they are TEACHING (Contribution's 'Subject (from sessions)'), not
// Darwin's"). Same population as the Overview "Contribution of NIAT instructors & mentors" card: Instructor Department instructors +
// mentors whose product is NIAT (Deployed); cohort from Contribution (NIAT 2026 = semester 1, NIAT 2025 = semester 3).
// Subject = Contribution's "Subject (from sessions, last 30 days)": completed lecture/practice sessions per subject, every subject with at
// least 20% of them (the top one always) -- same rule as the Contribution tab. Table 1 counts each person once, under their MAIN subject
// (most sessions), so the columns add up; table 2 counts a person in every subject they teach. Counts only -- no names.
//   pnpm exec tsx src/lib/connectors/_tmp_semester_subjects.ts
//   pnpm exec tsx src/lib/connectors/_tmp_semester_subjects.ts --instructors-only     (leave mentors out)
import { db, instructorsTable, instructorContributionTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { productOf } from "../product";

const MIN_SHARE = 0.2;
function subjectsOf(ss: Record<string, number>): { list: string[]; label: string } {
  const e = Object.entries(ss ?? {}).filter(([k]) => k !== "__previous_month");
  const subjects = e.filter(([k]) => k !== "__unmatched" && k !== "__general" && !k.startsWith("Other: ")).sort((a, b) => b[1] - a[1]);
  const total = subjects.reduce((s, [, n]) => s + n, 0);
  const list = subjects.filter(([, n], i) => i === 0 || n / total >= MIN_SHARE).map(([k]) => k);
  if (list.length) return { list, label: list[0] };
  const other = e.filter(([k]) => k.startsWith("Other: ")).sort((a, b) => b[1] - a[1])[0];
  if (other) return { list: [], label: `(other course: ${other[0].slice(7)})` };
  if (e.some(([k]) => k === "__unmatched")) return { list: [], label: "(no subject match)" };
  if (e.some(([k]) => k === "__general")) return { list: [], label: "(orientation only)" };
  return { list: [], label: "(no lecture/practice sessions)" };
}

async function main() {
  const instructorsOnly = process.argv.includes("--instructors-only");
  const all = await db.select().from(instructorsTable);
  const r = computeDepartmentAndExceptionRows(all);
  const seen = new Set<number>();
  const pop = [...r.countedInstructorRows, ...(instructorsOnly ? [] : r.mentors)]
    .filter((p) => productOf(p) === "NIAT (Deployed)" && (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [c.instructorUserId, c]));

  type Cnt = { s1: number; s3: number; both: number };
  const byMain = new Map<string, Cnt>(), every = new Map<string, Cnt>();
  const add = (m: Map<string, Cnt>, k: string, s1: boolean, s3: boolean) => {
    const c = m.get(k) ?? { s1: 0, s3: 0, both: 0 };
    if (s1) c.s1++; if (s3) c.s3++; if (s1 && s3) c.both++;
    m.set(k, c);
  };
  let s1Total = 0, s3Total = 0, bothTotal = 0, multi = 0;
  for (const p of pop) {
    const c = p.teachosUserId ? contrib.get(p.teachosUserId) : undefined;
    const cohorts = c?.niatCohorts ?? [];
    const s1 = cohorts.includes("NIAT 2026"), s3 = cohorts.includes("NIAT 2025");
    if (!s1 && !s3) continue;
    if (s1) s1Total++; if (s3) s3Total++; if (s1 && s3) bothTotal++;
    const subj = subjectsOf((c?.sessionSubjects ?? {}) as Record<string, number>);
    add(byMain, subj.label, s1, s3);
    for (const k of subj.list) add(every, k, s1, s3);
    if (subj.list.length > 1) multi++;
  }
  const print = (title: string, m: Map<string, Cnt>) => {
    console.log(`\n${title}`);
    console.log("  subject | semester 1 (NIAT 2026) | semester 3 (NIAT 2025) | of them in both");
    for (const [k, c] of [...m].sort((a, b) => (b[1].s1 + b[1].s3) - (a[1].s1 + a[1].s3))) console.log(`  ${k} | ${c.s1} | ${c.s3} | ${c.both}`);
  };
  console.log(`Population: NIAT (Deployed) ${instructorsOnly ? "instructors only" : "instructors + mentors"} teaching semester 1 or 3`);
  console.log(`Semester 1: ${s1Total} | Semester 3: ${s3Total} | in both: ${bothTotal} | different people: ${s1Total + s3Total - bothTotal}`);
  print("1. By MAIN subject (each person once -- columns add up to the totals above):", byMain);
  print(`2. By EVERY subject they teach (${multi} people teach more than one subject, so they appear in more than one row):`, every);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
