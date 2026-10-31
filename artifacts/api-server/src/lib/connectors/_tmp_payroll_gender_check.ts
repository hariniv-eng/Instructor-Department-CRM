// One-off, READ-ONLY (2026-10-30, per request: "gender is saved in the instructor archive -- why don't payroll-converted instructors show
// it on the Instructors tab?"). For every payroll-converted person in TeachOS (isPayrollPerson, same rule as the tab), works out the gender
// the tab shows today (same fallback order as toApiInstructorSummary in routes/reports.ts) and, for those with none, which other source
// DOES have it: the live row's stored Darwin gender (kept but hidden once they leave Darwin), the archive (gender / exitGender /
// manualGender), the Darwin full roster, and the Darwin exit records (incl. merged report fields). No staff names. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_gender_check.ts
import { db, instructorsTable, instructorArchiveTable, darwinboxFullRosterTable, darwinboxExitsTable } from "@workspace/db";
import { cell } from "../reconcile";

// Same rule as isPayrollPerson in routes/reports.ts (copied so this script does not load the whole router).
const isPayrollPerson = (r: { classification?: string | null; exitFlag?: boolean | null; exitVerification?: string | null }) =>
  r.classification === "payroll_converted" || (!!r.exitFlag && r.exitVerification === "payroll_converted");
async function main() {
  const rows = (await db.select().from(instructorsTable)).filter((r) => r.inTeachos && isPayrollPerson(r));
  const arch = await db.select().from(instructorArchiveTable);
  const aEmp = new Map(arch.filter((a) => a.employeeId).map((a) => [a.employeeId!, a]));
  const aUid = new Map(arch.filter((a) => a.teachosUserId).map((a) => [a.teachosUserId!, a]));
  const roster = new Map((await db.select().from(darwinboxFullRosterTable)).filter((r) => r.employeeId).map((r) => [r.employeeId!.toUpperCase(), cell(r.rawData, "Gender", "gender")]));
  const exits = new Map<string, string | null>();
  for (const e of await db.select().from(darwinboxExitsTable)) if (e.employeeId) { const g = cell(e.rawData, "Gender", "gender"); if (g || !exits.has(e.employeeId.toUpperCase())) exits.set(e.employeeId.toUpperCase(), g); }
  let shown = 0, missing = 0, inArchive = 0;
  const fix = new Map<string, number>(); const none: string[] = [];
  for (const r of rows) {
    const a = (r.employeeId ? aEmp.get(r.employeeId) : undefined) ?? (r.teachosUserId ? aUid.get(r.teachosUserId) : undefined);
    if (a) inArchive++;
    const g = (r.inDarwin ? r.gender : null) ?? r.exitGender ?? r.manualGender ?? a?.gender ?? a?.exitGender ?? a?.manualGender ?? null;
    if (g) { shown++; continue; }
    missing++;
    const emp = (r.employeeId ?? "").toUpperCase();
    const src = r.gender ? "live row (old Darwin value, hidden)" : roster.get(emp) ? "Darwin full roster" : exits.get(emp) ? "Darwin exit record" : null;
    if (src) fix.set(src, (fix.get(src) ?? 0) + 1); else none.push(r.employeeId || `(no employee id, TeachOS ${r.teachosUserId})`);
  }
  console.log(`Payroll-converted people in TeachOS: ${rows.length}; with an archive row: ${inArchive}`);
  console.log(`Gender shown on the Instructors tab today: ${shown}; missing: ${missing}`);
  console.log(`Of the missing, gender IS available in: ${[...fix].map(([k, v]) => `${k} ${v}`).join(", ") || "none of the sources"}`);
  console.log(`No gender anywhere (${none.length}): ${none.join(", ")}`);
  const noArchGender = rows.filter((r) => { const a = (r.employeeId ? aEmp.get(r.employeeId) : undefined) ?? (r.teachosUserId ? aUid.get(r.teachosUserId) : undefined); return a && !a.gender && !a.exitGender && !a.manualGender; }).length;
  console.log(`Archive rows of payroll people with NO gender stored: ${noArchGender} (they left Darwin before the archive started keeping gender, or were never in Darwin)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
