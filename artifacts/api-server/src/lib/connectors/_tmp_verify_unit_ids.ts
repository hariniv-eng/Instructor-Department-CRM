// One-off, READ-ONLY (2026-10-26). Checks every Unit ID in src/data/lecture_sessions_master.csv (and the conflicting
// alternatives in src/data/lecture_unit_id_candidates.csv) against the learning portal data in BigQuery: what is that unit's
// real title and type, and how often was it scheduled as a LECTURE. Flags IDs whose portal title does not match the lecture
// name (copy-paste slips in the sheets) and, for conflicts, says which candidate is right. Writes unit_id_check.csv. Changes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_verify_unit_ids.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";

const norm = (id: string | null | undefined) => (id ?? "").replace(/-/g, "").toLowerCase();
const t = (x: string) => (x ?? "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
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
  const [mh, ...mrows] = parseCsv(fs.readFileSync(path.join(here, "../../data/lecture_sessions_master.csv"), "utf8"));
  const [, ...crows] = parseCsv(fs.readFileSync(path.join(here, "../../data/lecture_unit_id_candidates.csv"), "utf8"));
  type Item = { course: string; name: string; id: string; source: string };
  const items: Item[] = [];
  for (const r of mrows) for (const id of (r[mh.indexOf("Unit ID")] ?? "").split(/[;,\s]+/).filter((x) => norm(x).length === 32))
    items.push({ course: r[mh.indexOf("Course")], name: r[mh.indexOf("Session name")], id, source: "master" });
  for (const r of crows) if (!items.some((i) => i.course === r[0] && i.name === r[1] && norm(i.id) === norm(r[2]))) items.push({ course: r[0], name: r[1], id: r[2], source: r[3] });

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const ids = [...new Set(items.map((i) => norm(i.id)))];
  const [units] = await bq.query({ query: `SELECT REPLACE(LOWER(unit_id), '-', '') AS uid, ANY_VALUE(unit_title) AS title, ANY_VALUE(unit_type) AS type, ANY_VALUE(course_title) AS course
    FROM \`${ds}.niat_instructor_unit_wise_completion_and_best_attempt_details\` WHERE REPLACE(LOWER(unit_id), '-', '') IN UNNEST(@ids) GROUP BY 1`, params: { ids } });
  const [sched] = await bq.query({ query: `SELECT REPLACE(LOWER(resource_id), '-', '') AS uid, ANY_VALUE(resource_title) AS title, ANY_VALUE(learning_portal_course_title) AS course,
      COUNTIF(UPPER(session_type) = 'LECTURE') AS lecture_rows, COUNT(*) AS all_rows
    FROM \`${ds}.niat_scheduled_session_wise_resource_details\` WHERE REPLACE(LOWER(resource_id), '-', '') IN UNNEST(@ids) GROUP BY 1`, params: { ids } });
  const U = new Map((units as { uid: string; title: string; type: string; course: string }[]).map((u) => [u.uid, u]));
  const S = new Map((sched as { uid: string; title: string; course: string; lecture_rows: number; all_rows: number }[]).map((s) => [s.uid, s]));

  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const out = [["Course", "Lecture", "Unit ID", "Source", "Portal title", "Portal type", "Portal course", "Scheduled as lecture", "Verdict"].join(",")];
  let ok = 0, bad = 0, unknown = 0;
  const problems: string[] = [];
  for (const i of items) {
    const u = U.get(norm(i.id)), s = S.get(norm(i.id));
    const title = u?.title ?? s?.title ?? "";
    const base = t(i.name.replace(/\(\+.*\)/, ""));
    const verdict = !title ? "NOT IN BIGQUERY" : (t(title) === base || t(title).includes(base) || base.includes(t(title))) ? "OK" : "TITLE MISMATCH";
    if (verdict === "OK") ok++; else if (verdict === "TITLE MISMATCH") bad++; else unknown++;
    if (verdict !== "OK" || i.source !== "master") problems.push(`${verdict.padEnd(16)} ${i.course} | ${i.name} | ${i.id} [${i.source}] -> portal: "${title}" (${u?.type ?? "?"}, ${u?.course ?? s?.course ?? "?"}), lecture rows ${s?.lecture_rows ?? 0}`);
    out.push([i.course, i.name, i.id, i.source, title, u?.type, u?.course ?? s?.course, s?.lecture_rows ?? 0, verdict].map(esc).join(","));
  }
  fs.writeFileSync("unit_id_check.csv", out.join("\n"));
  console.log(`Checked ${items.length} unit IDs: ${ok} OK, ${bad} TITLE MISMATCH, ${unknown} NOT IN BIGQUERY\n`);
  console.log(`Mismatches, unknowns and all conflict candidates:`);
  for (const p of problems) console.log("  " + p);
  console.log(`\nFull list in unit_id_check.csv (no staff data).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
