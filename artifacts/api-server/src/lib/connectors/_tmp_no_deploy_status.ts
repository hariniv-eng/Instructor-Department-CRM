// One-off, READ-ONLY (2026-11-18, per request: "for the instructors with no first-class date -- are they part of our team right now, why
// is there no data, and if they exited, their exit date"). The 99 employee IDs from the active-instructors list with no deployment date
// (no names here). For each: in FCC / counted in the Instructor department (as the Instructors tab), FCC team, product, subject, Darwin
// status / department / designation / joining date, TeachOS role, and every Darwin exit record (status, raised date, date of exit), plus
// the archive's exit date. Writes no_deploy_status.csv (employee IDs only).
//   pnpm exec tsx src/lib/connectors/_tmp_no_deploy_status.ts
import fs from "node:fs";
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable, darwinboxFullRosterTable, darwinboxActiveTable } from "@workspace/db";
import { cell } from "../reconcile";
import { productOf } from "../product";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";

const IDS = [
  "NW0003104", "NW0003517", "NW0003727", "NW0004107", "NW0001087", "NW0002531", "NW0003828", "NW0003968", "NW0004542", "NW0004570",
  "NW0003073", "NW0004661", "NW0004881", "NW0005276", "NW0003924", "NW0002241", "NW0005042", "NW0004821", "NW0005067", "NW0003952",
  "NW0005068", "NW2000490", "NW2000491", "NW2000511", "NW2000525", "NW2000544", "NW2000552", "NW2000564", "NW0002736", "NW0002770",
  "NW0007190", "NW2000670", "NW2000672", "NW0007373", "NW0007404", "NW0007471", "NW0007533", "NW0007534", "NW0007535", "NW0007552",
  "NW0007481", "NW0007636", "NW0007611", "NW0007613", "NW0007656", "NW0007714", "NW0007655", "NW0007684", "NW0007683", "NW0007685",
  "NW0007639", "NW0007738", "NW0007743", "NW0007712", "NW0007713", "NW0007709", "NW0007710", "NW0007747", "NW0007748", "NW0007671",
  "NW0007767", "NW0007799", "NW0007789", "NW0007765", "NW0007766", "NW0007768", "NW0007762", "NW0007769", "NW0007800", "NW0007771",
  "NW0007801", "NW0007770", "NW0007638", "NW0007774", "NW0007806", "NW0007804", "NW0007805", "NW0007807", "NW0007840", "NW0007841",
  "NW0007843", "NW0007844", "NW0007848", "NW0007850", "NW0007856", "NW0007867", "NW0007866", "NW0007877", "NW0007883", "NW0007902",
  "NW0007903", "NW0007921", "NW0007928", "NW2000760", "NW0007930", "NW0007956", "NW0007961", "NW0007973", "NW0007981",
];
const key = (s: unknown) => String(s ?? "").trim().toUpperCase();
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const iso = (v: unknown) => { const s = String(v ?? "").trim(); const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; };

async function main() {
  const all = await db.select().from(instructorsTable);
  const { countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(all);
  const deptIds = new Set([...countedInstructorRows, ...mentors].map((r) => r.id));
  const archive = new Map((await db.select().from(instructorArchiveTable)).map((a) => [key(a.employeeId), a]));
  const active = new Set((await db.select().from(darwinboxActiveTable)).map((r) => key(r.employeeId ?? cell(r.rawData as Record<string, unknown>, "Employee Id", "employee_id"))));
  const roster = new Map((await db.select().from(darwinboxFullRosterTable)).map((r) => [key(r.employeeId ?? cell(r.rawData as Record<string, unknown>, "Employee Id", "employee_id")), r.rawData as Record<string, unknown>]));
  const exits = await db.select().from(darwinboxExitsTable);
  const head = ["employee_id", "in_fcc", "counted_in_department", "fcc_team", "fcc_status", "product", "subject", "in_darwin_active", "darwin_status", "department", "designation", "date_of_joining",
    "in_teachos", "teachos_role", "exit_records", "latest_exit_status", "exit_raised_on", "date_of_exit", "archive_status", "archive_exit_date"];
  const out = [head.join(",")];
  for (const id of IDS) {
    const p = all.find((r) => key(r.employeeId) === id);
    const a = archive.get(id);
    const ro = roster.get(id);
    const ex = exits.filter((e) => key(e.employeeId ?? cell(e.rawData as Record<string, unknown>, "Employee Id", "employee_id")) === id)
      .map((e) => { const r = e.rawData as Record<string, unknown>; return { status: String(r["Status"] ?? ""), raised: iso(r["Exit Date"] ?? r["Separation Requested On"]), lwd: iso(r["Date Of Exit"]) }; })
      .sort((x, y) => y.raised.localeCompare(x.raised));
    const src = p ?? a;
    out.push([
      id, p ? "yes" : a ? "archive only" : "no", p && deptIds.has(p.id) ? "yes" : "no", src?.classification ?? "", p ? (p.manualStatus || p.computedStatus || "") : (a?.computedStatus ?? ""),
      src ? productOf(src) : "", src?.deptArea ?? (p?.manualDeptArea ?? ""), active.has(id) ? "yes" : "no",
      (src?.darwinEmployeeStatus ?? (ro ? cell(ro, "Employee Status", "employee_status") : "")) ?? "",
      src?.department ?? (ro ? cell(ro, "Department", "department") : "") ?? "", src?.designation ?? (ro ? cell(ro, "Designation", "designation") : "") ?? "",
      src?.dateOfJoining ?? (ro ? cell(ro, "Date Of Joining", "date_of_joining") : "") ?? "",
      src?.inTeachos ? "yes" : "no", src?.teachosRole ?? "", ex.length, ex[0]?.status ?? "", ex[0]?.raised ?? "", ex[0]?.lwd ?? "", a?.computedStatus ?? "", a?.exitDate ?? "",
    ].map(csvCell).join(","));
  }
  fs.writeFileSync("no_deploy_status.csv", out.join("\n"));
  console.log(`Wrote no_deploy_status.csv for ${IDS.length} employee IDs (no names). Print it with: cat no_deploy_status.csv`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
