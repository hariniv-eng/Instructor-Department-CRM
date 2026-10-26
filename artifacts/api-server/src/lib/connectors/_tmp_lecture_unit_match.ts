// One-off, READ-ONLY (2026-10-26). Feasibility check before changing Taught in class: can held class sessions be tied to the
// official lecture-session list (src/data/lecture_sessions_master.csv, built from the prod-sequence sheets) by UNIT ID?
//   1. Shows every column of the two schedule tables, and the session_type / session_status values in use.
//   2. Matches each scheduled session's resource_id against the master Unit IDs (dashes ignored) and prints the match rate.
//   3. Per instructor x course: how many of the course's lecture sessions they have taken (distinct units, held sessions only),
//      written to lecture_unit_match_by_instructor.csv in the current folder. Contains staff names -- delete after download.
//   pnpm exec tsx src/lib/connectors/_tmp_lecture_unit_match.ts [since=2025-06-01]
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";

const since = (process.argv[2] ?? "2025-06-01").replace(/^since=/, "");
const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-f]/g, "");

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
  const [header, ...rows] = parseCsv(fs.readFileSync(path.join(here, "../../data/lecture_sessions_master.csv"), "utf8"));
  const ci = (n: string) => header.indexOf(n);
  const unitToLecture = new Map<string, { course: string; name: string; key: string }>();
  const noId: { course: string; name: string }[] = [];
  const lecturesPerCourse = new Map<string, number>();
  for (const r of rows) {
    const course = r[ci("Course")], name = r[ci("Session name")];
    lecturesPerCourse.set(course, (lecturesPerCourse.get(course) ?? 0) + 1);
    const ids = (r[ci("Unit ID")] ?? "").split(/[;,\s]+/).map(norm).filter((x) => x.length === 32);
    if (!ids.length) noId.push({ course, name });
    for (const u of ids) unitToLecture.set(u, { course, name, key: `${course}#${r[ci("#")]}` });
  }
  console.log(`Master list: ${rows.length} lecture sessions, ${lecturesPerCourse.size} courses, ${unitToLecture.size} unit IDs\n`);

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  for (const t of ["niat_scheduled_session_wise_resource_details", "niat_instructor_session_schedule_details"]) {
    const [cols] = await bq.query({ query: `SELECT column_name, data_type FROM \`${ds}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t } });
    console.log(`${t} columns: ${(cols as { column_name: string; data_type: string }[]).map((c) => `${c.column_name}(${c.data_type})`).join(", ")}\n`);
  }

  const [res] = await bq.query({
    query: `SELECT instructor_user_id, ANY_VALUE(instructor_name) AS instructor_name, ANY_VALUE(institute_name) AS institute_name,
              session_id, ANY_VALUE(session_type) AS session_type, ANY_VALUE(session_status) AS session_status,
              ANY_VALUE(session_title) AS session_title, ANY_VALUE(learning_portal_course_title) AS portal_course,
              CAST(MIN(session_start_datetime) AS STRING) AS start, resource_id, ANY_VALUE(resource_title) AS resource_title
            FROM \`${ds}.niat_scheduled_session_wise_resource_details\`
            WHERE DATE(session_start_datetime) >= @since AND resource_id IS NOT NULL
            GROUP BY instructor_user_id, session_id, resource_id`,
    params: { since },
  });
  type R = { instructor_user_id: string; instructor_name: string; institute_name: string; session_id: string; session_type: string; session_status: string; session_title: string; portal_course: string; start: string; resource_id: string; resource_title: string };
  const all = res as R[];
  const count = (f: (r: R) => string) => { const m = new Map<string, number>(); for (const r of all) m.set(f(r) ?? "(null)", (m.get(f(r) ?? "(null)") ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", "); };
  console.log(`Scheduled session x resource rows since ${since}: ${all.length}`);
  console.log(`session_type: ${count((r) => r.session_type)}`);
  console.log(`session_status: ${count((r) => r.session_status)}`);
  console.log(`resource_id examples: ${all.slice(0, 3).map((r) => `${r.resource_id} (${r.resource_title})`).join(" | ")}\n`);

  const matched = all.filter((r) => unitToLecture.has(norm(r.resource_id)));
  const byType = new Map<string, [number, number]>();
  for (const r of all) { const k = r.session_type ?? "(null)"; const v = byType.get(k) ?? [0, 0]; v[0]++; if (unitToLecture.has(norm(r.resource_id))) v[1]++; byType.set(k, v); }
  console.log(`MATCH: ${matched.length} of ${all.length} rows (${((100 * matched.length) / Math.max(1, all.length)).toFixed(1)}%) point at a master lecture unit.`);
  for (const [k, [n, m]] of byType) console.log(`  ${k}: ${m}/${n} matched`);
  // Count LECTURES (master rows), not unit IDs: an English slot carries several unit IDs.
  const hitLectures = new Set(matched.map((r) => unitToLecture.get(norm(r.resource_id))!.key));
  const perCourseHit = new Map<string, number>();
  for (const k of hitLectures) { const c = k.slice(0, k.lastIndexOf("#")); perCourseHit.set(c, (perCourseHit.get(c) ?? 0) + 1); }
  console.log(`\nPer course: master lecture sessions that were scheduled at least once (by unit ID):`);
  for (const [c, n] of [...lecturesPerCourse].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${perCourseHit.get(c) ?? 0} / ${n}`);

  // Unmatched LECTURE rows: which titles are scheduled as lectures but are not in the master list?
  const um = new Map<string, number>();
  for (const r of all) if (/lecture/i.test(r.session_type ?? "") && !unitToLecture.has(norm(r.resource_id))) { const k = `${r.portal_course} | ${r.resource_title}`; um.set(k, (um.get(k) ?? 0) + 1); }
  console.log(`\nTop 25 LECTURE resources NOT in the master list (course | resource title: rows):`);
  for (const [k, v] of [...um].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${k}: ${v}`);

  // Lectures in the master list with no Unit ID: look for a scheduled LECTURE resource with the same title (case/space-insensitive).
  const t = (x: string) => (x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const byTitle = new Map<string, Map<string, { id: string; course: string; n: number }>>();
  for (const r of all) {
    if (!/lecture/i.test(r.session_type ?? "")) continue;
    const m = byTitle.get(t(r.resource_title)) ?? new Map(); const e = m.get(r.resource_id) ?? { id: r.resource_id, course: r.portal_course, n: 0 }; e.n++; m.set(r.resource_id, e); byTitle.set(t(r.resource_title), m);
  }
  const sugg = [["Course", "Session name", "Suggested Unit ID", "Portal course in BigQuery", "Times scheduled", "Other IDs with same title"].join(",")];
  let found = 0;
  for (const l of noId) {
    const m = [...(byTitle.get(t(l.name)) ?? new Map()).values()].sort((a, b) => b.n - a.n);
    if (m.length) found++;
    sugg.push([l.course, l.name, m[0]?.id ?? "", m[0]?.course ?? "", m[0]?.n ?? 0, m.slice(1, 4).map((x) => `${x.id} (${x.course}, ${x.n})`).join(" ; ")].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
  }
  fs.writeFileSync("lecture_unit_id_suggestions.csv", sugg.join("\n"));
  console.log(`\nLectures with no Unit ID: ${noId.length}; a same-title scheduled lecture found for ${found}. Written to lecture_unit_id_suggestions.csv`);

  // Per instructor x course.
  const HELD = /complet|ended|done|conducted|finished/i;
  type Agg = { name: string; institute: string; course: string; units: Set<string>; heldUnits: Set<string>; sessions: Set<string> };
  const agg = new Map<string, Agg>();
  for (const r of matched) {
    const l = unitToLecture.get(norm(r.resource_id))!;
    const k = `${r.instructor_user_id}|${l.course}`;
    const a = agg.get(k) ?? { name: r.instructor_name, institute: r.institute_name, course: l.course, units: new Set(), heldUnits: new Set(), sessions: new Set() };
    a.units.add(l.key); a.sessions.add(r.session_id);
    if (HELD.test(r.session_status ?? "")) a.heldUnits.add(l.key);
    agg.set(k, a);
  }
  const lines = [["Instructor", "Institute", "Course", "Lecture sessions in course", "Lectures scheduled (distinct)", "Lectures held (distinct, status completed)", "Class sessions"].join(",")];
  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const sorted = [...agg.values()].sort((a, b) => a.course.localeCompare(b.course) || b.heldUnits.size - a.heldUnits.size);
  for (const a of sorted) lines.push([a.name, a.institute, a.course, lecturesPerCourse.get(a.course), a.units.size, a.heldUnits.size, a.sessions.size].map(esc).join(","));
  fs.writeFileSync("lecture_unit_match_by_instructor.csv", lines.join("\n"));
  console.log(`\n${agg.size} instructor x course rows written to lecture_unit_match_by_instructor.csv. First 15:`);
  for (const a of sorted.slice(0, 15)) console.log(`  ${a.name} (${a.institute}) -- ${a.course}: held ${a.heldUnits.size}, scheduled ${a.units.size} of ${lecturesPerCourse.get(a.course)}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
