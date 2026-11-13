// One-off, READ-ONLY (2026-11-13, per request: "NW2000396 was ~85% complete on Modern Responsive UI when I checked during training --
// why does FCC show 39%?"). For one employee and every learning-portal course whose title matches a word (default "responsive"):
//   1. the unit table's columns (to see which ones describe a unit's type)
//   2. per course id + title: units total / completed / in progress / yet to start
//   3. per topic: the same split, in curriculum order
//   4. per unit type (if the table has a type column): the same split -- e.g. whether practice / exam units are what is left
// No names printed.   pnpm exec tsx src/lib/connectors/_tmp_lp_course_detail.ts NW2000396 responsive
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "-");

async function main() {
  const [emp, word = "responsive"] = process.argv.slice(2).filter((a) => a !== "--");
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, (emp ?? "").trim().toUpperCase()));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS user id`); process.exit(0); }
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const T = `\`${P}.${DS}.${UNIT_COMPLETION_TABLE}\``;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [cols] = await bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: UNIT_COMPLETION_TABLE } });
  const names = (cols as Record<string, unknown>[]).map((c) => plain(c.column_name));
  console.log(`Columns: ${names.join(", ")}\n`);
  const cid = names.find((c) => /^course_id$/i.test(c)) ?? names.find((c) => /course.*id/i.test(c));
  const typeCol = names.find((c) => /^unit_type$/i.test(c)) ?? names.find((c) => /unit.*type|content.*type|resource.*type/i.test(c));
  const split = `COUNT(*) AS total, COUNTIF(completion_status = 'COMPLETED') AS done, COUNTIF(completion_status = 'IN_PROGRESS') AS prog, COUNTIF(completion_status = 'YET_TO_START') AS todo`;
  const where = `instructor_user_id = @uid AND LOWER(course_title) LIKE @w`;
  const params = { uid: p.teachosUserId, w: `%${word.toLowerCase()}%` };
  const line = (r: Record<string, unknown>) => { const t = Number(plain(r.total)), d = Number(plain(r.done)); return `${d}/${t} completed (${pct(d, t)}) | in progress ${plain(r.prog)} | yet to start ${plain(r.todo)}`; };

  const [courses] = await bq.query({ query: `SELECT ${cid ? `${cid} AS cid,` : ""} course_title AS ct, ${split} FROM ${T} WHERE ${where} GROUP BY ${cid ? "cid, " : ""}ct ORDER BY ct`, params });
  console.log(`Courses matching "${word}" for ${emp}:`);
  for (const c of courses as Record<string, unknown>[]) console.log(`  ${plain(c.ct)}${cid ? ` [${plain(c.cid)}]` : ""}: ${line(c)}`);

  for (const c of courses as Record<string, unknown>[]) {
    const ct = plain(c.ct);
    console.log(`\n== ${ct}: by topic`);
    const [topics] = await bq.query({ query: `SELECT topic_title AS tt, MIN(course_unit_order) AS o, ${split} FROM ${T} WHERE instructor_user_id = @uid AND course_title = @ct GROUP BY tt ORDER BY o`, params: { uid: p.teachosUserId, ct } });
    for (const t of topics as Record<string, unknown>[]) console.log(`  ${plain(t.tt)}: ${line(t)}`);
    if (typeCol) {
      console.log(`== ${ct}: by ${typeCol}`);
      const [types] = await bq.query({ query: `SELECT ${typeCol} AS ty, ${split} FROM ${T} WHERE instructor_user_id = @uid AND course_title = @ct GROUP BY ty ORDER BY total DESC`, params: { uid: p.teachosUserId, ct } });
      for (const t of types as Record<string, unknown>[]) console.log(`  ${plain(t.ty) || "(blank)"}: ${line(t)}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
