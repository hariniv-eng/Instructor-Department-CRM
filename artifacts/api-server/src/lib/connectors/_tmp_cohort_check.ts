// One-off, READ-ONLY (2026-10-27). Why does the Overview "Contribution of NIAT instructors & mentors" card show NIAT 2024 = 0 and
// "No cohort yet" for most people? Cohorts come from the batch_name of each person's sessions in the last 30 days (60 if none),
// mapped by BATCH_NAME_TO_NIAT_COHORT. This prints: when the Contribution data was last synced; how many people have no recent
// batches vs only unmapped batches; and every batch_name taught at a NIAT campus in the last 60 days, with whether it maps to a
// cohort. New batch names that are missing from the map are the usual cause. Changes nothing. No staff names printed.
//   pnpm exec tsx src/lib/connectors/_tmp_cohort_check.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorContributionTable } from "@workspace/db";
import { config } from "./config";
import { BATCH_NAME_TO_NIAT_COHORT, SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const map = BATCH_NAME_TO_NIAT_COHORT as Record<string, string>;
  const rows = await db.select().from(instructorContributionTable);
  const r0 = rows[0] as Record<string, unknown> | undefined;
  const synced = r0 ? (r0.syncedAt ?? r0.updatedAt ?? r0.createdAt) : null;
  console.log(`Contribution table: ${rows.length} people, last synced ${synced ? new Date(String(synced)).toISOString() : "unknown"}`);
  let withCohort = 0, noRecent = 0, unmappedOnly = 0;
  const cohortCount = new Map<string, number>();
  for (const r of rows) {
    if (r.niatCohorts.length) { withCohort++; for (const c of r.niatCohorts) cohortCount.set(c, (cohortCount.get(c) ?? 0) + 1); }
    else if (!r.recentBatches.length) noRecent++;
    else unmappedOnly++;
  }
  console.log(`  with a cohort: ${withCohort}  |  no batches in the last 30 days: ${noRecent}  |  only batches not in the cohort map: ${unmappedOnly}`);
  console.log(`  people per cohort: ${[...cohortCount].map(([k, v]) => `${k} ${v}`).join(", ") || "none"}\n`);

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const [fresh] = await bq.query({ query: `SELECT CAST(MAX(session_start_datetime) AS STRING) AS latest_start,
      CAST(MAX(IF(session_status = 'COMPLETED', session_start_datetime, NULL)) AS STRING) AS latest_completed FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
      WHERE session_start_datetime <= DATETIME_ADD(CURRENT_DATETIME(), INTERVAL 1 DAY)` });
  console.log(`Schedule data in BigQuery: latest session start ${plain((fresh as Record<string, unknown>[])[0]?.latest_start)}, latest COMPLETED ${plain((fresh as Record<string, unknown>[])[0]?.latest_completed)}\n`);
  const [b] = await bq.query({ query: `SELECT institute_name, batch_name, COUNT(DISTINCT instructor_user_id) AS instructors, COUNT(DISTINCT session_id) AS sessions,
      CAST(MIN(DATE(session_start_datetime)) AS STRING) AS first_d, CAST(MAX(DATE(session_start_datetime)) AS STRING) AS last_d
    FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
    WHERE institute_type = 'NIAT_OFFLINE' AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY)
      AND session_start_datetime <= DATETIME_ADD(CURRENT_DATETIME(), INTERVAL 30 DAY)
    GROUP BY 1, 2 ORDER BY instructors DESC` });
  console.log(`Batches taught at NIAT campuses, last 60 days to +30 days (instructors, sessions, dates) -> cohort:`);
  let unmapped = 0;
  for (const r of b as Record<string, unknown>[]) {
    const name = plain(r.batch_name), c = map[name];
    if (!c) unmapped++;
    console.log(`  ${(c ?? "NOT MAPPED").padEnd(11)} ${plain(r.institute_name)} | "${name}" | ${plain(r.instructors)} instructors, ${plain(r.sessions)} sessions, ${plain(r.first_d)}..${plain(r.last_d)}`);
  }
  console.log(`\n${unmapped} of ${(b as unknown[]).length} batch names are not in the cohort map.`);
  console.log(`Mapped batch names with NO sessions in this window: ${Object.keys(map).filter((k) => !(b as Record<string, unknown>[]).some((r) => plain(r.batch_name) === k)).join("; ") || "none"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
