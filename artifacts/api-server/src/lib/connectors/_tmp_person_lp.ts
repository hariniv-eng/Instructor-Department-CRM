// One-off, READ-ONLY (2026-11-07, per request: "in learning portal what is his DSA completion rate"). For one employee ID:
//   1. what the Training - LP tab holds (instructor_training_status): every course column with units completed / total and status
//   2. live from the learning-portal table: every portal course_title this person has units in, with completed / total
// Writes nothing; prints no names.
//   pnpm exec tsx src/lib/connectors/_tmp_person_lp.ts NW0004022
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable, instructorTrainingStatusTable } from "@workspace/db";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const pct = (done: number, total: number) => (total ? `${Math.round((done / total) * 1000) / 10}%` : "-");

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS user id`); process.exit(0); }

  const stored = await db.select().from(instructorTrainingStatusTable).where(eq(instructorTrainingStatusTable.instructorUserId, p.teachosUserId));
  console.log(`${emp} -- Training - LP tab (last sync):`);
  console.log("  group | course | completed / total units | % | status");
  for (const r of stored.sort((a, b) => a.trackGroup.localeCompare(b.trackGroup) || a.courseKey.localeCompare(b.courseKey)))
    console.log(`  ${r.trackGroup} | ${r.courseKey} | ${r.unitsCompleted} / ${r.unitsTotal} | ${pct(r.unitsCompleted, r.unitsTotal)} | ${r.status}${r.trackGroup === "DSA" ? "   <== DSA" : ""}`);
  if (!stored.length) console.log("  (nothing stored)");

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `
    SELECT course_title AS ct, COUNT(*) AS total, COUNTIF(completion_status = 'COMPLETED') AS done, COUNTIF(completion_status = 'IN_PROGRESS') AS prog
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${UNIT_COMPLETION_TABLE}\`
    WHERE instructor_user_id = @uid GROUP BY 1 ORDER BY 1`, params: { uid: p.teachosUserId } });
  console.log(`\nLive from the learning portal (every course with units for this person):`);
  console.log("  course title | completed / total units | % | in progress");
  for (const r of rows as Record<string, unknown>[]) {
    const ct = plain(r.ct), done = Number(plain(r.done)), total = Number(plain(r.total));
    console.log(`  ${ct} | ${done} / ${total} | ${pct(done, total)} | ${plain(r.prog)}${/dsa|algorithm|phase|sem 4/i.test(ct) ? "   <== DSA" : ""}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
