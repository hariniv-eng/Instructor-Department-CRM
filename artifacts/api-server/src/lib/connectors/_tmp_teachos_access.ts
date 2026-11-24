// One-off, READ-ONLY (2026-11-24, per request: "does NW0002241 have access to TeachOS?"). For the employee IDs given: the TeachOS
// instructor list (niat_instructor_details, matched by nw_instructor_id -- employee ID only, never by name): TeachOS user id, status
// (ACTIVE / INACTIVE), role, category, institutes; whether FCC has a row for them; and, by that TeachOS user id, their last completed class
// session and last topin exam -- signs of real use. No names printed.
//   pnpm exec tsx src/lib/connectors/_tmp_teachos_access.ts NW0002241
import { BigQuery } from "@google-cloud/bigquery";
import { sql } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^NW\d+$/i.test(a)).map((a) => a.toUpperCase());
  if (!ids.length) { console.log("usage: _tmp_teachos_access.ts NW0000000 [...]"); process.exit(1); }
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.${DS}.${process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details"}\``;
  const topin = `\`${P}.${DS}.${process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details"}\``;
  for (const emp of ids) {
    console.log(`\n== ${emp}`);
    const [rows] = await bq.query({ query: `SELECT instructor_user_id AS u, instructor_status AS st, instructor_role AS role, instructor_category AS cat,
        STRING_AGG(DISTINCT CAST(institute_name AS STRING), ', ') AS inst FROM ${T} WHERE UPPER(TRIM(CAST(nw_instructor_id AS STRING))) = @e GROUP BY 1, 2, 3, 4`, params: { e: emp } });
    const list = rows as Record<string, unknown>[];
    if (!list.length) console.log("TeachOS instructor list: NOT FOUND under this employee ID (no TeachOS instructor account linked to it)");
    for (const r of list) console.log(`TeachOS: user id ${plain(r.u)} | status ${plain(r.st) || "-"} | role ${plain(r.role) || "-"} | category ${plain(r.cat) || "-"} | institutes ${plain(r.inst) || "-"}`);
    const fcc = await db.select().from(instructorsTable).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${emp}`);
    console.log(fcc.length ? fcc.map((p) => `FCC row ${p.id}: in TeachOS ${p.inTeachos} | in Darwin ${p.inDarwin} | classification ${p.classification ?? "-"}`).join("\n") : "FCC: no row with this employee ID");
    for (const r of list) {
      const u = plain(r.u);
      const [s] = await bq.query({ query: `SELECT MAX(CAST(session_start_datetime AS STRING)) AS last, COUNT(*) AS n FROM \`${P}.${DS}.${SESSION_SCHEDULE_TABLE}\`
          WHERE instructor_user_id = @u AND session_status = 'COMPLETED'`, params: { u } });
      const [t] = await bq.query({ query: `SELECT MAX(CAST(exam_attempt_start_date AS STRING)) AS last, COUNT(DISTINCT organisation_assessment_id) AS n FROM ${topin} WHERE instructor_user_id = @u`, params: { u } });
      const a = (s as Record<string, unknown>[])[0] ?? {}, b = (t as Record<string, unknown>[])[0] ?? {};
      console.log(`Activity for ${u}: completed class sessions ${plain(a.n) || 0} (last ${plain(a.last).slice(0, 10) || "-"}) | topin exams ${plain(b.n) || 0} (last ${plain(b.last).slice(0, 10) || "-"})`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
