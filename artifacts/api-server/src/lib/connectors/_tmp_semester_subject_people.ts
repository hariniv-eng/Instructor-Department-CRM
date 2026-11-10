// One-off, READ-ONLY (2026-11-10, per request: "the 9 instructors teaching Frontend in semester 3"). Same population and subject rule as
// _tmp_semester_subjects.ts. Picks the people whose MAIN subject is the given one and who teach the given cohort, and for each lists the
// courses of their completed lecture / practice sessions in the last 30 days PER COHORT -- the subject in the Contribution tab is per
// person, not per cohort, so this shows what they actually teach to each semester. Employee IDs, course names and counts only.
//   pnpm exec tsx src/lib/connectors/_tmp_semester_subject_people.ts Frontend "NIAT 2025"
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorContributionTable } from "@workspace/db";
import { config } from "./config";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { productOf } from "../product";
import { SESSION_SCHEDULE_TABLE, cohortForBatch } from "./instructorContribution";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const mainSubject = (ss: Record<string, number>) => Object.entries(ss ?? {})
  .filter(([k]) => !k.startsWith("__") && !k.startsWith("Other: ")).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

async function main() {
  const [subject = "Frontend", cohort = "NIAT 2025"] = process.argv.slice(2).filter((a) => a !== "--");
  const all = await db.select().from(instructorsTable);
  const r = computeDepartmentAndExceptionRows(all);
  const seen = new Set<number>();
  const pop = [...r.countedInstructorRows, ...r.mentors].filter((p) => productOf(p) === "NIAT (Deployed)" && (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [c.instructorUserId, c]));
  const picked = pop.filter((p) => {
    const c = p.teachosUserId ? contrib.get(p.teachosUserId) : undefined;
    return c && c.niatCohorts.includes(cohort) && mainSubject(c.sessionSubjects as Record<string, number>) === subject;
  });
  console.log(`${picked.length} people: main subject ${subject}, teaching ${cohort}\n`);
  if (!picked.length) process.exit(0);

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `
    SELECT instructor_user_id AS uid, batch_name AS b, IFNULL(CAST(course_title AS STRING), CAST(semester_course_title AS STRING)) AS course, COUNT(*) AS n
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
    WHERE instructor_user_id IN UNNEST(@uids) AND session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE')
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY) AND session_start_datetime <= CURRENT_DATETIME()
    GROUP BY 1, 2, 3`, params: { uids: picked.map((p) => p.teachosUserId!) } });
  const per = new Map<string, Map<string, Map<string, number>>>();
  for (const x of rows as Record<string, unknown>[]) {
    const c = cohortForBatch(plain(x.b)) ?? `other batch (${plain(x.b)})`;
    const byCohort = per.get(plain(x.uid)) ?? new Map();
    const courses = byCohort.get(c) ?? new Map<string, number>();
    courses.set(plain(x.course) || "(no course)", (courses.get(plain(x.course) || "(no course)") ?? 0) + Number(plain(x.n)));
    byCohort.set(c, courses); per.set(plain(x.uid), byCohort);
  }
  for (const p of picked) {
    const c = contrib.get(p.teachosUserId!)!;
    console.log(`${p.employeeId ?? "(no id)"} | cohorts ${c.niatCohorts.join(", ")} | subjects from sessions: ${Object.entries(c.sessionSubjects as Record<string, number>).filter(([k]) => !k.startsWith("__")).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    for (const [coh, courses] of [...(per.get(p.teachosUserId!) ?? new Map())].sort()) console.log(`   ${coh}: ${[...courses].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(", ")}`);
  }
  console.log("\n(sessions: completed lecture / practice, last 60 days)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
