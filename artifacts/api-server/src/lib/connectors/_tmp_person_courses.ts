// One-off, READ-ONLY (2026-11-13, per request: "for this instructor, every learning-portal course she has started -- course id,
// progress, which ones are completed"). Prints her TeachOS user id, then every course_id in the unit table she has rows for:
// course title, units completed / in progress / total, % complete, status by FCC's rule (85%+ of units completed = Completed), and
// the Training - LP column it counts under (if any). Sorted: started courses by % complete, then not-started ones. No names printed.
//   pnpm exec tsx src/lib/connectors/_tmp_person_courses.ts NW2000396
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE, COMPLETED_THRESHOLD } from "./instructorLearningStatus";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const nid = (s: string) => s.toLowerCase().replace(/-/g, "").trim();

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS user id`); process.exit(0); }
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [cols] = await bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`, params: { t: UNIT_COMPLETION_TABLE } });
  const names = (cols as Record<string, unknown>[]).map((c) => plain(c.column_name));
  const cid = names.find((c) => /^course_id$/i.test(c)) ?? names.find((c) => /course.*id/i.test(c));
  const [rows] = await bq.query({ query: `
    SELECT ${cid ? `CAST(${cid} AS STRING)` : "''"} AS cid, ANY_VALUE(course_title) AS ct, COUNT(*) AS total,
           COUNTIF(completion_status = 'COMPLETED') AS done, COUNTIF(completion_status = 'IN_PROGRESS') AS prog
    FROM \`${P}.${DS}.${UNIT_COMPLETION_TABLE}\` WHERE instructor_user_id = @uid GROUP BY cid`, params: { uid: p.teachosUserId } });
  const colOf = (id: string, title: string) => TRAINING_COURSE_TAXONOMY.find((t) => (t.courseIds ?? []).some((x) => nid(x) === nid(id)) || t.courseTitles.includes(title))?.label ?? "";
  const list = (rows as Record<string, unknown>[]).map((r) => {
    const total = Number(plain(r.total)), done = Number(plain(r.done)), prog = Number(plain(r.prog));
    const share = total ? done / total : 0;
    return { id: plain(r.cid), title: plain(r.ct), total, done, prog, share,
      status: share >= COMPLETED_THRESHOLD ? "Completed" : done + prog > 0 ? "In progress" : "Not started", col: colOf(plain(r.cid), plain(r.ct)) };
  }).sort((a, b) => (b.done + b.prog > 0 ? 1 : 0) - (a.done + a.prog > 0 ? 1 : 0) || b.share - a.share || a.title.localeCompare(b.title));
  console.log(`${emp} | TeachOS user id ${p.teachosUserId} | ${list.length} portal courses | completed ${list.filter((x) => x.status === "Completed").length} | in progress ${list.filter((x) => x.status === "In progress").length} | not started ${list.filter((x) => x.status === "Not started").length}`);
  console.log(`(Completed = ${Math.round(COMPLETED_THRESHOLD * 100)}% or more of the course's units completed, FCC's rule)\n`);
  console.log("status | % complete | completed / total units | in progress | course title | course id | FCC Training - LP column");
  for (const x of list) console.log(`${x.status} | ${Math.round(x.share * 1000) / 10}% | ${x.done}/${x.total} | ${x.prog} | ${x.title} | ${x.id || "-"} | ${x.col || "-"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
