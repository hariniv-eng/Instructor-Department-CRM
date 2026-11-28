// One-off, READ-ONLY (2026-11-27, per request: "add those subject related data in Training - LP, Training - Demos, Taught in Class and the
// other tabs" -- the Semester 4 (CDU Batch-1) and Semester 6 (KKH Batch-2) courses). Builds each course's LECTURE list the way
// data/lectureSessions.ts holds them, from the prod sequence:
//   lectures  = distinct LECTURE session titles of that course in niat_schedule_details_as_per_prod_sequence (the batch + semester below),
//               in prod order (lowest session_id_order, then first date);
//   unit IDs  = the resource_id of those same sessions in niat_scheduled_session_wise_resource_details (joined on session_id; the table
//               Taught in Class reads), and, when a lecture has none,
//               the learning-portal unit with the same title in the course's portal course (LEARNING_SET units, not "Reading Material").
// Writes lecture_courses_new.json (courses / lectures / unit IDs only, no people) to be merged into lectureSessions.ts + the master CSV.
//   pnpm exec tsx src/lib/connectors/_tmp_build_sem46_lectures.ts && gzip -kf lecture_courses_new.json
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";

type Spec = { key: string; portalKey: string | null; title: string; subject: string; semester: number; batch: string; prodId: string; lpId: string | null };
const SPECS: Spec[] = [
  // Semester 4 -- CDU Batch-1
  { key: "advanced_aptitude", portalKey: "advanced_aptitude", title: "Advanced Aptitude", subject: "Aptitude", semester: 4, batch: "CDU Batch", prodId: "10a4c4a216cb4ad1a4b1cd1bbddf54af", lpId: "8024ea95e38e40f89664aaada968168f" },
  { key: "language_analytics", portalKey: "language_analytics", title: "Language Analytics", subject: "English", semester: 4, batch: "CDU Batch", prodId: "9c7bed6b26cb4490a786b0db13936955", lpId: "7288e9d8992549758490a8a87b8b3dd9" },
  { key: "linear_algebra_calculus", portalKey: "linear_algebra_calculus", title: "Linear Algebra and Calculus", subject: "Maths", semester: 4, batch: "CDU Batch", prodId: "19f67ff81c6c4edea2771ff1669320b4", lpId: "ce546ef7181e427cb2b779492736e578" },
  { key: "computer_networks", portalKey: "computer_networks", title: "Computer Networks", subject: "CS Core", semester: 4, batch: "CDU Batch", prodId: "20354608c2d4443f9907e02af468aa8e", lpId: "6e937f2929d54a649e3106eb23f456e1" },
  { key: "operating_systems", portalKey: "operating_systems", title: "Operating Systems", subject: "CS Core", semester: 4, batch: "CDU Batch", prodId: "768b6c7fcd684eceb89ba6d25ed77e6d", lpId: "91b2de7926d14101b4f45156a5649ebf" },
  { key: "production_ai", portalKey: "production_ai", title: "Production AI Engineering", subject: "GenAI", semester: 4, batch: "CDU Batch", prodId: "3fc64ce63b9b4e3b834a27d376ae8bfe", lpId: "3b6305a6ceab4483a02d57b599d61a19" },
  { key: "environmental_science", portalKey: "environmental_science", title: "Environmental Science", subject: "Interdisciplinary & Applied Sciences", semester: 4, batch: "CDU Batch", prodId: "8e7bb12c574e43c48f8e33283fae1750", lpId: "53251ac6dc7d44839752e8c07b721f96" },
  // Semester 6 -- KKH Batch-2
  { key: "ml", portalKey: "ml", title: "Introduction to ML", subject: "Artificial Intelligence & Emerging Technologies", semester: 6, batch: "KKH Batch", prodId: "d0dcbaeb1dd74c9983359ddc93badfe6", lpId: "919bb576966a48dfa1e0b8b071fc7f69" },
  { key: "deep_learning", portalKey: "deep_learning", title: "Introduction to Deep Learning", subject: "Artificial Intelligence & Emerging Technologies", semester: 6, batch: "KKH Batch", prodId: "03dd24730ec544ad9f9cc153c0434536", lpId: "90d1855388db4c029eb3eb9869c882d9" },
  { key: "lecture_data_visualization", portalKey: null, title: "Data Visualization", subject: "Artificial Intelligence & Emerging Technologies", semester: 6, batch: "KKH Batch", prodId: "bf39d4ae62b74e3fa91dcc2ab7eaf86f", lpId: null },
  { key: "practical_software_engineering", portalKey: "practical_software_engineering", title: "Practical Software Engineering", subject: "Emerging Tech", semester: 6, batch: "KKH Batch", prodId: "c02985272c9c494e91c120f88ec24070", lpId: "3d3d4f4b2df54db5bed585a3e0164ecd" },
  { key: "iot", portalKey: "iot", title: "Internet of Things", subject: "Emerging Tech", semester: 6, batch: "KKH Batch", prodId: "3a6cdc7ebb2a402882fa3e25ca5a1358", lpId: "c41ce78c1b0745b2978fb4ea16d364af" },
  { key: "lecture_robotics_operating_system", portalKey: null, title: "Robotics Operating System", subject: "Emerging Tech", semester: 6, batch: "KKH Batch", prodId: "c18cab37e48b460cbc0850c0015054ea", lpId: null },
];
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const key = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const N = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = (t: string) => `\`${P}.${DS}.${t}\``;
  const out: unknown[] = [];
  for (const s of SPECS) {
    const [rows] = await bq.query({ query: `
      WITH p AS (SELECT session_id, session_title, session_id_order, session_start_datetime FROM ${T("niat_schedule_details_as_per_prod_sequence")}
                 WHERE ${N("semester_course_id")} = @id AND semester_title = @sem AND LOWER(batch_name) LIKE LOWER(@b) AND session_type = 'LECTURE'),
           r AS (SELECT ${N("session_id")} AS sid, ${N("resource_id")} AS rid FROM ${T("niat_scheduled_session_wise_resource_details")}
                 WHERE resource_id IS NOT NULL AND ${N("session_id")} IN (SELECT ${N("session_id")} FROM p) GROUP BY 1, 2)
      SELECT p.session_title AS t, MIN(p.session_id_order) AS ord, CAST(MIN(p.session_start_datetime) AS STRING) AS first,
             ARRAY_AGG(DISTINCT r.rid IGNORE NULLS) AS rids
      FROM p LEFT JOIN r ON r.sid = ${N("p.session_id")} GROUP BY 1 ORDER BY ord, first`,
      params: { id: s.prodId, sem: `Semester ${s.semester}`, b: `%${s.batch}%` } });
    let units = new Map<string, string>();
    if (s.lpId) {
      const [u] = await bq.query({ query: `SELECT unit_title AS ut, ANY_VALUE(${N("unit_id")}) AS uid FROM ${T(UNIT_COMPLETION_TABLE)}
          WHERE ${N("course_id")} = @c AND unit_type = 'LEARNING_SET' AND NOT REGEXP_CONTAINS(LOWER(unit_title), r'reading material') GROUP BY 1`, params: { c: s.lpId } });
      units = new Map((u as Record<string, unknown>[]).map((r) => [key(plain(r.ut)), plain(r.uid)]));
    }
    let fromSchedule = 0, fromPortal = 0, none = 0;
    const lectures = (rows as Record<string, unknown>[]).map((r, i) => {
      const name = plain(r.t);
      let ids = ((r.rids as unknown[]) ?? []).map(plain).filter(Boolean);
      if (ids.length) fromSchedule++;
      else if (units.get(key(name))) { ids = [units.get(key(name))!]; fromPortal++; }
      else none++;
      return { n: i + 1, name, unitIds: ids };
    });
    console.log(`${s.title} (Sem ${s.semester}, ${s.subject}): ${lectures.length} lectures -- unit IDs from the schedule ${fromSchedule}, from the portal ${fromPortal}, none ${none}`);
    out.push({ key: s.key, portalKey: s.portalKey, title: s.title, subject: s.subject, semester: s.semester, courseId: s.lpId ?? s.prodId, lectures });
  }
  fs.writeFileSync("lecture_courses_new.json", JSON.stringify(out, null, 1));
  console.log("\nWrote lecture_courses_new.json (courses and lectures only, no people). gzip -kf lecture_courses_new.json and upload the .gz.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
