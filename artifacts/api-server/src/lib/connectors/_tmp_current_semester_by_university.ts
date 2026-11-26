// One-off, READ-ONLY (2026-11-26, per request: "can we get what is the current semester going on in every university right now").
// From niat_schedule_details_as_per_prod_sequence (FCC's own BigQuery dataset): per university (institute) and batch, the semester that is
// current -- is_current_semester = true, or else the semester whose start/end dates include today -- with its dates and the next semester's
// start date. University and batch names only (no people). Writes current_semester_by_university.csv too (no names of people, safe to keep).
//   pnpm exec tsx src/lib/connectors/_tmp_current_semester_by_university.ts
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const csv = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.${DS}.niat_schedule_details_as_per_prod_sequence\``;
  const [rows] = await bq.query({ query: `
    WITH sem AS (
      SELECT institute_type AS ty, institute_name AS u, batch_name AS b, semester_title AS s,
             MIN(semester_start_date) AS st, MAX(semester_end_date) AS en,
             LOGICAL_OR(SAFE_CAST(CAST(is_current_semester AS STRING) AS BOOL)) AS cur, COUNT(*) AS n
      FROM ${T} GROUP BY 1, 2, 3, 4),
    pick AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY ty, u, b ORDER BY cur DESC, (CURRENT_DATE('Asia/Kolkata') BETWEEN st AND en) DESC, st DESC) AS k
      FROM sem WHERE cur OR CURRENT_DATE('Asia/Kolkata') BETWEEN st AND en OR st <= CURRENT_DATE('Asia/Kolkata'))
    SELECT p.ty, p.u, p.b, p.s, CAST(p.st AS STRING) AS st, CAST(p.en AS STRING) AS en, p.cur,
           (SELECT CONCAT(x.s, ' from ', CAST(x.st AS STRING)) FROM sem x WHERE x.ty = p.ty AND x.u = p.u AND x.b = p.b AND x.st > p.st ORDER BY x.st LIMIT 1) AS nxt
    FROM pick p WHERE k = 1 ORDER BY p.ty, p.u, p.b` });
  const list = rows as Record<string, unknown>[];
  const out = [["institute_type", "university", "batch", "current_semester", "semester_start", "semester_end", "flagged_current", "next_semester"].join(",")];
  const tally = new Map<string, number>();
  let last = "";
  for (const r of list) {
    const ty = plain(r.ty), u = plain(r.u);
    if (`${ty}|${u}` !== last) { console.log(`\n${u} (${ty})`); last = `${ty}|${u}`; }
    console.log(`   ${plain(r.b).padEnd(40).slice(0, 40)} ${plain(r.s).padEnd(11)} ${plain(r.st)} -> ${plain(r.en)}${plain(r.cur) === "true" ? "" : "  (by dates)"}${r.nxt ? `   next: ${plain(r.nxt)}` : ""}`);
    out.push([ty, u, plain(r.b), plain(r.s), plain(r.st), plain(r.en), plain(r.cur), plain(r.nxt)].map(csv).join(","));
    if (ty === "NIAT_OFFLINE") tally.set(plain(r.s), (tally.get(plain(r.s)) ?? 0) + 1);
  }
  console.log(`\nNIAT_OFFLINE batches by current semester: ${[...tally].sort().map(([s, n]) => `${s}: ${n}`).join(" | ")}`);
  fs.writeFileSync("current_semester_by_university.csv", out.join("\n"));
  console.log("Wrote current_semester_by_university.csv (universities and batches only). gzip -kf it to download.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
