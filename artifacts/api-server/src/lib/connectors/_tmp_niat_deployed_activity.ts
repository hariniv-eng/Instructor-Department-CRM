// One-off, READ-ONLY (2026-11-05, per request: "are all 498 NIAT (Deployed) people taking sessions -- in the last week, the last 1-2
// months?"). Same 498 as _tmp_niat_deployed_count.ts (department instructors + mentors, productOf = NIAT (Deployed)). From the session
// schedule (SESSION_SCHEDULE_TABLE, the Contribution tab's source): per person, completed sessions in the last 7 / 30 / 60 days, last
// completed session date, and upcoming PENDING sessions. Buckets everyone (taught in last 7 days / 8-30 / 31-60 / not in 60 days / never),
// split by instructors and mentors. Console: counts + employee IDs of those with nothing in 60 days. Full list WITH names:
// niat_deployed_activity.csv (delete after download). Writes nothing else.
//   pnpm exec tsx src/lib/connectors/_tmp_niat_deployed_activity.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { config } from "./config";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { computeDepartmentAndExceptionRows, isPayrollPerson } from "../../routes/reports";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const archMgr = new Map(archive.filter((a) => a.employeeId).map((a) => [a.employeeId!, a.directManager]));
  const { countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(live);
  const prod = (r: typeof live[number]) => productOf({ ...r, directManager: r.directManager || (!r.inDarwin && r.employeeId ? archMgr.get(r.employeeId) ?? null : null) });
  const seen = new Set<number>();
  const niat = [...countedInstructorRows.map((r) => ({ r, kind: "Instructor" })), ...mentors.map((r) => ({ r, kind: "Mentor" }))]
    .filter(({ r }) => (seen.has(r.id) ? false : (seen.add(r.id), true))).filter(({ r }) => prod(r) === "NIAT (Deployed)");
  const uids = niat.map(({ r }) => r.teachosUserId).filter(Boolean) as string[];

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `
    SELECT instructor_user_id AS uid,
      COUNTIF(session_status = 'COMPLETED' AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 7 DAY) AND session_start_datetime <= CURRENT_DATETIME()) AS d7,
      COUNTIF(session_status = 'COMPLETED' AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY) AND session_start_datetime <= CURRENT_DATETIME()) AS d30,
      COUNTIF(session_status = 'COMPLETED' AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY) AND session_start_datetime <= CURRENT_DATETIME()) AS d60,
      CAST(MAX(IF(session_status = 'COMPLETED' AND session_start_datetime <= CURRENT_DATETIME(), DATE(session_start_datetime), NULL)) AS STRING) AS last_done,
      COUNTIF(session_status = 'PENDING' AND session_start_datetime > CURRENT_DATETIME()) AS upcoming,
      CAST(MIN(IF(session_status = 'PENDING' AND session_start_datetime > CURRENT_DATETIME(), DATE(session_start_datetime), NULL)) AS STRING) AS next_up
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
    WHERE instructor_user_id IN UNNEST(@uids) GROUP BY 1`, params: { uids } });
  const S = new Map((rows as Record<string, unknown>[]).map((r) => [plain(r.uid), r]));
  const n = (r: Record<string, unknown> | undefined, k: string) => Number(plain(r?.[k])) || 0;
  const bucket = (s: Record<string, unknown> | undefined) => !s || !plain(s.last_done) ? "5 never taught a session" : n(s, "d7") ? "1 taught in the last 7 days" : n(s, "d30") ? "2 last session 8-30 days ago" : n(s, "d60") ? "3 last session 31-60 days ago" : "4 nothing in the last 60 days";
  const out = new Map<string, Map<string, number>>();
  for (const { r, kind } of niat) { const b = bucket(S.get(r.teachosUserId ?? "")); const m = out.get(b) ?? new Map(); m.set(kind, (m.get(kind) ?? 0) + 1); out.set(b, m); }
  console.log(`NIAT (Deployed): ${niat.length} (instructors ${niat.filter((x) => x.kind === "Instructor").length}, mentors ${niat.filter((x) => x.kind === "Mentor").length})\n`);
  console.log("Activity (completed sessions in the schedule) | instructors | mentors | total");
  for (const [b, m] of [...out].sort()) console.log(`  ${b.slice(2)} | ${m.get("Instructor") ?? 0} | ${m.get("Mentor") ?? 0} | ${(m.get("Instructor") ?? 0) + (m.get("Mentor") ?? 0)}`);
  const quiet = niat.filter(({ r }) => { const b = bucket(S.get(r.teachosUserId ?? "")); return b.startsWith("4") || b.startsWith("5"); });
  // University / campus (2026-11-05, per request): the TeachOS deployment campus(es) and Darwin's workspace.
  console.log(`\nNo completed session in the last 60 days (${quiet.length}) -- employee ID | role | subject | university (TeachOS campus) | Darwin workspace | last session | upcoming sessions (next):`);
  for (const { r, kind } of quiet) { const s = S.get(r.teachosUserId ?? ""); console.log(`  ${r.employeeId ?? "-"} | ${kind} | ${normalizeSubjectArea(r.deptArea || r.manualDeptArea || null) ?? "-"} | ${(r.institutes ?? []).join(" + ") || "-"} | ${r.workspace || "-"} | ${plain(s?.last_done) || "never"} | ${n(s, "upcoming")}${plain(s?.next_up) ? ` (${plain(s?.next_up)})` : ""}`); }
  const scheduledOnly = niat.filter(({ r }) => { const s = S.get(r.teachosUserId ?? ""); return !n(s, "d7") && n(s, "upcoming") > 0; }).length;
  console.log(`\nNot in the last 7 days but with upcoming sessions scheduled: ${scheduledOnly}`);

  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const csv = [["Name", "Employee ID", "Role", "Subject", "University (TeachOS campus)", "Darwin workspace", "Capability Manager", "Payroll", "Activity", "Sessions last 7 days", "Last 30 days", "Last 60 days", "Last completed session", "Upcoming sessions", "Next upcoming"].map(esc).join(",")];
  for (const { r, kind } of niat) { const s = S.get(r.teachosUserId ?? ""); csv.push([r.fullName, r.employeeId, kind, normalizeSubjectArea(r.deptArea || r.manualDeptArea || null), (r.institutes ?? []).join(" + "), r.workspace, r.teachosManager || r.manualCapabilityManager, isPayrollPerson(r) ? "yes" : "no", bucket(s).slice(2), n(s, "d7"), n(s, "d30"), n(s, "d60"), plain(s?.last_done), n(s, "upcoming"), plain(s?.next_up)].map(esc).join(",")); }
  fs.writeFileSync("niat_deployed_activity.csv", csv.join("\n"));
  console.log(`Full list with names: niat_deployed_activity.csv (delete after download).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
