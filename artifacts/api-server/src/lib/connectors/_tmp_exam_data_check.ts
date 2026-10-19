// One-off, READ-ONLY (2026-10-19, per request: "do we have details about any course exams -- completed or not -- and how much they
// scored?"). Inspects the two training tables in BigQuery:
//   1. niat_instructor_unit_wise_completion_and_best_attempt_details   (what Training Stats uses today: completion only)
//   2. niat_instructor_pracitce_exam_assessment_and_question_set_all_attempt_details   (exam / assessment attempts; never used yet)
// For each: every column with its type, the values of every short-list column (unit types, statuses, results...), and a few sample
// rows. Give an employee id to see THAT person's exam rows instead of random ones. Writes nothing. Run in the Replit shell from
// artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_exam_data_check.ts
//   pnpm exec tsx src/lib/connectors/_tmp_exam_data_check.ts NW0007870
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { getSchema, UNIT_COMPLETION_TABLE, PRACTICE_EXAM_TABLE } from "./instructorLearningStatus";

const show = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v === null || v === undefined ? "" : String(v));

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const employeeId = (args[0] ?? "").trim().toUpperCase();
  let userId: string | null = null;
  if (employeeId) {
    const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId));
    userId = p?.teachosUserId ?? null;
    console.log(`${employeeId}: ${p?.fullName ?? "not found"} · TeachOS ${userId ?? "-"}\n`);
  }
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  for (const table of [UNIT_COMPLETION_TABLE, PRACTICE_EXAM_TABLE]) {
    const ref = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${table}\``;
    console.log(`==================== ${table}`);
    let schema: Array<[string, string]>;
    try { schema = await getSchema(table); } catch (e) { console.log(`  FAILED: ${(e as Error).message}\n`); continue; }
    console.log(`Columns (${schema.length}):`);
    for (const [n, t] of schema) console.log(`  ${n} (${t})`);
    const [[{ total }]] = await bq.query({ query: `SELECT COUNT(*) AS total FROM ${ref}` });
    console.log(`Rows: ${show(total)}`);
    // Short-list columns: text columns with at most 25 different values -- unit types, statuses, results.
    const textCols = schema.filter(([, t]) => t === "STRING").map(([n]) => n);
    if (textCols.length) {
      const [[counts]] = await bq.query({ query: `SELECT ${textCols.map((c) => `APPROX_COUNT_DISTINCT(${c}) AS \`${c}\``).join(", ")} FROM ${ref}` });
      for (const c of textCols) {
        const n = Number(show((counts as Record<string, unknown>)[c]));
        if (n > 0 && n <= 25) {
          const [vals] = await bq.query({ query: `SELECT ${c} AS v, COUNT(*) AS n FROM ${ref} GROUP BY 1 ORDER BY n DESC` });
          console.log(`  values of ${c}: ${(vals as Record<string, unknown>[]).map((r) => `${show(r.v) || "(blank)"}=${show(r.n)}`).join(", ")}`);
        }
      }
    }
    const idCol = schema.find(([n]) => n === "instructor_user_id")?.[0];
    const [rows] = await bq.query({
      query: `SELECT * FROM ${ref} ${userId && idCol ? `WHERE ${idCol} = @id` : ""} LIMIT 4`,
      params: userId && idCol ? { id: userId } : undefined,
    });
    console.log(`Sample rows${userId ? ` for ${employeeId}` : ""}: ${rows.length}`);
    (rows as Record<string, unknown>[]).forEach((r, i) => {
      console.log(`  --- row ${i + 1}`);
      for (const [c] of schema) { const v = show(r[c]); if (v !== "") console.log(`    ${c}: ${v.length > 150 ? v.slice(0, 150) + "…" : v}`); }
    });
    console.log("");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
