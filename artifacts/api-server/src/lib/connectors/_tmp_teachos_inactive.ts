// One-off, READ-ONLY (2026-11-05, per request: "can I get TeachOS inactive data?"). From BigQuery niat_instructor_details (TeachOS's own
// instructor list): everyone with instructor_status = INACTIVE, joined with FCC: still in Darwin?, Darwin exit record + status, Capability
// Manager review, in the Instructor Archive (and its status), and their last completed session (session schedule). Console: counts by
// category / role / institute type and by "why inactive" bucket (no names). Full list WITH names: teachos_inactive.csv (delete after download).
//   pnpm exec tsx src/lib/connectors/_tmp_teachos_inactive.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { loadArchivePeople } from "../../routes/reports";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const [rows] = await bq.query({ query: `SELECT d.instructor_user_id AS uid, d.instructor_name AS name, d.nw_instructor_id AS emp, d.instructor_category AS cat, d.instructor_role AS role,
      d.institute_type AS it, d.institute_name AS inst, CAST(s.last_done AS STRING) AS last_done
    FROM \`${ds}.niat_instructor_details\` d
    LEFT JOIN (SELECT instructor_user_id, MAX(IF(session_status = 'COMPLETED', DATE(session_start_datetime), NULL)) AS last_done FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\` GROUP BY 1) s
      ON s.instructor_user_id = d.instructor_user_id
    WHERE UPPER(d.instructor_status) = 'INACTIVE'` });
  const R = rows as Record<string, unknown>[];
  const live = await db.select().from(instructorsTable);
  const byUid = new Map(live.filter((r) => r.teachosUserId).map((r) => [r.teachosUserId!, r]));
  const byEmp = new Map(live.filter((r) => r.employeeId).map((r) => [r.employeeId!.toUpperCase(), r]));
  const archive = await loadArchivePeople();
  const arcBy = new Map(archive.flatMap((p) => [p.employee_id ? [`e:${p.employee_id.toUpperCase()}`, p] : null, p.teachos_user_id ? [`u:${p.teachos_user_id}`, p] : null].filter(Boolean) as [string, typeof archive[number]][]));
  const tally = (f: (r: Record<string, unknown>) => string) => { const m = new Map<string, number>(); for (const r of R) m.set(f(r) || "(blank)", (m.get(f(r) || "(blank)") ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "); };
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const out = [["Name", "Employee ID", "TeachOS user ID", "Category", "Role", "Institute type", "Institute", "Last completed session", "Still in Darwin", "Darwin exit status", "CM review", "In Instructor Archive", "Archive status", "Why inactive (best guess)"].map(esc).join(",")];
  const why = new Map<string, number>();
  for (const r of R) {
    const p = byUid.get(plain(r.uid)) ?? (plain(r.emp) ? byEmp.get(plain(r.emp).toUpperCase()) : undefined);
    const a = arcBy.get(`u:${plain(r.uid)}`) ?? (plain(r.emp) ? arcBy.get(`e:${plain(r.emp).toUpperCase()}`) : undefined);
    const exit = p?.exitFlagStatus ?? "";
    const reason = /approved/i.test(exit) || a?.status === "Exited" ? "left (approved exit / archived as Exited)"
      : /pending/i.test(exit) ? "exit pending approval"
      : p?.inDarwin ? "still in Darwin -- inactive in TeachOS only (moved team? access removed?)"
      : !p ? "not in FCC (never in the department, or left before FCC)"
      : "not in Darwin, no exit record";
    why.set(reason, (why.get(reason) ?? 0) + 1);
    out.push([plain(r.name), plain(r.emp) || p?.employeeId, plain(r.uid), plain(r.cat), plain(r.role), plain(r.it), plain(r.inst), plain(r.last_done), p ? (p.inDarwin ? "yes" : "no") : "", exit, p?.exitVerification ?? "", a ? "yes" : "no", a?.status ?? "", reason].map(esc).join(","));
  }
  console.log(`TeachOS INACTIVE instructors (niat_instructor_details): ${R.length}`);
  console.log(`  category: ${tally((r) => plain(r.cat))}`);
  console.log(`  role: ${tally((r) => plain(r.role))}`);
  console.log(`  institute type: ${tally((r) => plain(r.it))}`);
  console.log(`  with an employee ID: ${R.filter((r) => plain(r.emp)).length}; ever taught a session: ${R.filter((r) => plain(r.last_done)).length}`);
  console.log(`\nWhy inactive (best guess from FCC data):`);
  for (const [k, v] of [...why].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  fs.writeFileSync("teachos_inactive.csv", out.join("\n"));
  console.log(`\nFull list with names: teachos_inactive.csv (${R.length} rows -- delete after download).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
