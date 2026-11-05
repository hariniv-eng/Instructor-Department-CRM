// One-off, READ-ONLY (2026-11-05, per request: "is our NIAT Deployed strength 498 -- correct, or has it changed?"). Counts NIAT (Deployed)
// with the app's own rules: the Instructor Department (computeDepartmentAndExceptionRows) -> instructors + mentors (the Overview
// "Contribution of NIAT instructors & mentors" card's population; ops team is Support, not NIAT) -> productOf() = "NIAT (Deployed)"
// (TeachOS campus is a NIAT campus, not Training Institute / Academy / Intensive / IIT X DSA). Splits by instructors / mentors, subject,
// payroll; lists who joined NIAT (Deployed) in the last 14 days and who is on the exit card in the last 14 days; and compares with
// BigQuery niat_instructor_details (NIAT_OFFLINE + ACTIVE). Employee IDs only. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_niat_deployed_count.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { config } from "./config";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { computeDepartmentAndExceptionRows, isPayrollPerson, loadArchivePeople } from "../../routes/reports";

async function main() {
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const archMgr = new Map(archive.filter((a) => a.employeeId).map((a) => [a.employeeId!, a.directManager]));
  const { countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(live);
  // Same as the Instructors tab: a person outside Darwin uses the Darwin manager kept in the archive (needed for the IIT X DSA rule).
  const prod = (r: typeof live[number]) => productOf({ ...r, directManager: r.directManager || (!r.inDarwin && r.employeeId ? archMgr.get(r.employeeId) ?? null : null) });
  const seen = new Set<number>();
  const pool = [...countedInstructorRows.map((r) => ({ r, kind: "Instructor" })), ...mentors.map((r) => ({ r, kind: "Mentor" }))].filter(({ r }) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const byProduct = new Map<string, number>(); for (const { r } of pool) byProduct.set(prod(r), (byProduct.get(prod(r)) ?? 0) + 1);
  const niat = pool.filter(({ r }) => prod(r) === "NIAT (Deployed)");
  const tally = (f: (x: (typeof niat)[number]) => string) => { const m = new Map<string, number>(); for (const x of niat) m.set(f(x) || "(none)", (m.get(f(x) || "(none)") ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "); };
  console.log(`Instructor Department instructors + mentors: ${pool.length}  -> by product: ${[...byProduct].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`\nNIAT (Deployed) = ${niat.length}`);
  console.log(`  instructors / mentors: ${tally((x) => x.kind)}`);
  console.log(`  subject: ${tally((x) => normalizeSubjectArea(x.r.deptArea || x.r.manualDeptArea || null) ?? "")}`);
  console.log(`  payroll: ${niat.filter((x) => isPayrollPerson(x.r)).length}, in Darwin: ${niat.filter((x) => x.r.inDarwin).length}, in TeachOS: ${niat.filter((x) => x.r.inTeachos).length}`);
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const joined = niat.filter((x) => x.r.dateOfJoining && String(x.r.dateOfJoining) >= since);
  console.log(`\nJoined in the last 14 days (since ${since}, Darwin joining date): ${joined.length}${joined.length ? ` -- ${joined.map((x) => x.r.employeeId).join(", ")}` : ""}`);
  const people = await loadArchivePeople();
  const exits = people.filter((p) => p.status === "Exited" && (p.exit_status ?? "").toLowerCase() === "approved" && !p.is_payroll && (p.date_of_exit ?? p.exit_date ?? "") >= since);
  console.log(`On the exit card with an exit date in the last 14 days: ${exits.length}${exits.length ? ` -- ${exits.map((p) => `${p.employee_id} (${p.date_of_exit ?? p.exit_date})`).join(", ")}` : ""}`);
  const stillHere = niat.filter((x) => x.r.exitFlag && (x.r.exitFlagStatus ?? "").toLowerCase() === "approved");
  console.log(`Counted in NIAT (Deployed) but with an APPROVED Darwin exit (serving notice / payroll move): ${stillHere.length}${stillHere.length ? ` -- ${stillHere.map((x) => `${x.r.employeeId}${isPayrollPerson(x.r) ? " (payroll)" : ""}`).join(", ")}` : ""}`);

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [d] = await bq.query({ query: `SELECT instructor_role AS role, COUNT(*) AS n FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.niat_instructor_details\`
    WHERE institute_type = 'NIAT_OFFLINE' AND instructor_status = 'ACTIVE' GROUP BY 1 ORDER BY 2 DESC` });
  const D = d as { role: string; n: number }[];
  console.log(`\nFor comparison, BigQuery niat_instructor_details NIAT_OFFLINE + ACTIVE: ${D.reduce((a, r) => a + Number(r.n), 0)} (${D.map((r) => `${r.role} ${r.n}`).join(", ")}) -- includes central instructors, people outside the department, no Darwin check.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
