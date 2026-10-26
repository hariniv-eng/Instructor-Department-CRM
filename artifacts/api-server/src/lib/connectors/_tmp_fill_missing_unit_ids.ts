// One-off, READ-ONLY (2026-10-26). For every lecture in src/data/lecture_sessions_master.csv that has NO Unit ID
// (Dynamic Web Application, Modern Responsive Web Design, the rest of Python and Maths, Framer, Aptitude "Introduction"),
// looks up the unit in BigQuery's course structure (niat_instructor_unit_wise_completion_and_best_attempt_details: course,
// topic, unit title, unit id, unit type) by course title + unit title, and also in the scheduled-sessions resources.
// Writes unit_id_lookup.csv (no staff data) and prints the result. Changes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_fill_missing_unit_ids.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";

const t = (x: string) => (x ?? "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
// Master course name -> words that must appear in the BigQuery course title.
const COURSE_HINT: Record<string, RegExp> = {
  "Programming Foundations": /programming foundations|python/i,
  "Mathematics for Computer Science": /mathematics|math/i,
  "Modern Responsive Web Design": /modern responsive/i,
  "Build Your Own Dynamic Web Application": /dynamic web/i,
  "Build Your Own Responsive Website": /responsive website/i,
};

function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const [h, ...rows] = parseCsv(fs.readFileSync(path.join(here, "../../data/lecture_sessions_master.csv"), "utf8"));
  const missing = rows.filter((r) => !r[h.indexOf("Unit ID")]?.trim()).map((r) => ({ course: r[h.indexOf("Course")], n: r[h.indexOf("#")], name: r[h.indexOf("Session name")] }));
  console.log(`Lectures with no Unit ID: ${missing.length}\n`);

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const [units] = await bq.query({ query: `SELECT course_id, ANY_VALUE(course_title) AS course_title, unit_id, ANY_VALUE(unit_title) AS unit_title, ANY_VALUE(unit_type) AS unit_type, ANY_VALUE(topic_title) AS topic_title, MIN(course_unit_order) AS ord, COUNT(DISTINCT instructor_user_id) AS instructors
    FROM \`${ds}.niat_instructor_unit_wise_completion_and_best_attempt_details\` GROUP BY course_id, unit_id` });
  const [sched] = await bq.query({ query: `SELECT resource_id AS unit_id, ANY_VALUE(resource_title) AS unit_title, ANY_VALUE(learning_portal_course_title) AS course_title, COUNT(DISTINCT session_id) AS sessions
    FROM \`${ds}.niat_scheduled_session_wise_resource_details\` WHERE UPPER(session_type) = 'LECTURE' GROUP BY resource_id` });
  type U = { course_id?: string; course_title: string; unit_id: string; unit_title: string; unit_type?: string; topic_title?: string; ord?: number; instructors?: number; sessions?: number };
  const norm = (id: string) => id.replace(/-/g, "").toLowerCase();
  const sessionsById = new Map((sched as U[]).map((s) => [norm(s.unit_id), s.sessions ?? 0]));

  const out = [["Course", "#", "Session name", "Found Unit ID", "BigQuery course", "BigQuery unit title", "Unit type", "Times scheduled as lecture", "How found", "Other candidates"].join(",")];
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  let found = 0;
  for (const m of missing) {
    const hint = COURSE_HINT[m.course];
    const pool = (units as U[]).filter((u) => t(u.unit_title) === t(m.name) && (u.unit_type ?? "").toUpperCase() === "LEARNING_SET");
    let cands = hint ? pool.filter((u) => hint.test(u.course_title ?? "")) : pool;
    let how = hint ? "course + title" : "title only";
    if (!cands.length) { cands = pool; how = "title only (course name differs)"; }
    if (!cands.length) { cands = (sched as U[]).filter((s) => t(s.unit_title) === t(m.name)); how = "scheduled lecture title"; }
    // Prefer the unit that is actually scheduled most, then the most-used course copy.
    cands.sort((a, b) => (sessionsById.get(norm(b.unit_id)) ?? 0) - (sessionsById.get(norm(a.unit_id)) ?? 0) || (b.instructors ?? 0) - (a.instructors ?? 0));
    const best = cands[0];
    if (best) found++;
    out.push([m.course, m.n, m.name, best?.unit_id ?? "", best?.course_title ?? "", best?.unit_title ?? "", best?.unit_type ?? "", best ? sessionsById.get(norm(best.unit_id)) ?? 0 : "", best ? how : "NOT FOUND",
      cands.slice(1, 4).map((c) => `${c.unit_id} (${c.course_title}, sched ${sessionsById.get(norm(c.unit_id)) ?? 0})`).join(" ; ")].map(esc).join(","));
    console.log(`${best ? "FOUND    " : "NOT FOUND"} ${m.course} #${m.n} ${m.name}${best ? ` -> ${best.unit_id} [${best.course_title}] scheduled ${sessionsById.get(norm(best.unit_id)) ?? 0}x (${how}${cands.length > 1 ? `, ${cands.length - 1} other copies` : ""})` : ""}`);
  }
  fs.writeFileSync("unit_id_lookup.csv", out.join("\n"));
  console.log(`\nFound ${found} of ${missing.length}. Written to unit_id_lookup.csv (no staff data) -- send it to Claude to add to the master list.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
