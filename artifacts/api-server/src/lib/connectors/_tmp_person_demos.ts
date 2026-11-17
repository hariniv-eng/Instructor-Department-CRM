// One-off, READ-ONLY (2026-11-17, per request: "NW2000651 has 16 demos recorded but FCC shows 15"). For one employee ID: every DEMO /
// TRAINING_DEMO (and AI) row in niat_session_wise_qa_rating, with what FCC does with it -- status, date, length, score, the lecture /
// course its topic matches (same matching as Training - Demos), in-training or after deployment, and whether it is counted. Then what
// FCC has STORED for her (instructor_demo_course, last Training Status sync) and when that sync ran.
//   pnpm exec tsx src/lib/connectors/_tmp_person_demos.ts NW2000651
import { BigQuery } from "@google-cloud/bigquery";
import { desc, eq, like } from "drizzle-orm";
import { db, instructorsTable, instructorDemoCourseTable, instructorContributionTable, uploadsTable } from "@workspace/db";
import { config } from "./config";
import { QA_RATING_VIEW, demoKindOf, lectureNameIndex, matchDemoTopic } from "./demoTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS id`); process.exit(0); }
  const [c] = await db.select().from(instructorContributionTable).where(eq(instructorContributionTable.instructorUserId, p.teachosUserId));
  const w = { joining: p.dateOfJoining ?? null, deployed: c?.deploymentDate ?? null };
  console.log(`${emp} | subject ${p.deptArea ?? p.manualDeptArea ?? "-"} | deployment date ${w.deployed ?? "not deployed"}`);
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `SELECT evaluation_type ty, status st, CAST(session_date AS STRING) d, CAST(evaluation_creation_datetime AS STRING) cr, session_title t,
      final_score s, SAFE_CAST(audio_duration AS FLOAT64) / 60 m FROM \`${P}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\`
      WHERE instructor_user_id = @u AND evaluation_type IN ('DEMO', 'TRAINING_DEMO', 'AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT') ORDER BY cr`, params: { u: p.teachosUserId } });
  const idx = lectureNameIndex();
  const tally = { all: 0, completed: 0, matched: 0, training: 0 };
  for (const kind of ["DEMO", "AI"]) {
    console.log(`\n${kind === "DEMO" ? "DEMOS (DEMO + TRAINING_DEMO)" : "AI ASSESSMENTS"}:`);
    for (const r of (rows as Record<string, unknown>[]).filter((x) => (kind === "DEMO") === plain(x.ty).endsWith("DEMO"))) {
      const done = plain(r.st).toLowerCase() === "completed";
      const hits = matchDemoTopic(idx, plain(r.t));
      const courses = [...new Set((hits ?? []).map((h) => LECTURE_COURSES[h.ci].title))];
      const k = demoKindOf(plain(r.ty), plain(r.d).slice(0, 10) || null, w);
      const counted = done && !!hits && k.endsWith("_training");
      if (kind === "DEMO") { tally.all++; if (done) tally.completed++; if (done && hits) tally.matched++; if (counted) tally.training++; }
      const why = !done ? `NOT COUNTED: status ${plain(r.st)}` : !hits ? "NOT COUNTED: topic matches no lecture" : !k.endsWith("_training") ? "after deployment (not in-training)" : "counted";
      console.log(`  ${plain(r.cr).slice(0, 16)} | ${plain(r.ty)} | ${plain(r.t)} | ${Math.round(Number(plain(r.m)) * 10) / 10} min | score ${plain(r.s) || "-"} | ${courses.join(" / ") || "-"} | ${why}`);
    }
  }
  console.log(`\nDemos in BigQuery: ${tally.all} | completed ${tally.completed} | completed + topic matched ${tally.matched} | in-training (what FCC counts) ${tally.training}`);
  const stored = await db.select().from(instructorDemoCourseTable).where(eq(instructorDemoCourseTable.instructorUserId, p.teachosUserId));
  console.log("\nStored in FCC (last Training Status sync):");
  for (const s of stored) console.log(`  ${s.courseTitle} | ${s.evaluationKind} | demos ${s.demos} | last ${s.lastDemoDate ?? "-"}`);
  const [last] = await db.select().from(uploadsTable).where(like(uploadsTable.source, "Instructor Demo Training%")).orderBy(desc(uploadsTable.uploadedAt)).limit(1);
  console.log(`Last demo sync: ${last ? new Date(last.uploadedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " | " + last.source : "never"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
