// One-off, READ-ONLY (2026-11-10, per request: "from the payroll converted list, keep only the instructors a Capability Manager marked
// Payroll Converted"). FCC does not record WHO set an Employee Status before 2026-11-09, and until 2026-10-24 the sync itself filled in
// "Payroll Converted" for TeachOS-only people with no Darwin exit record -- so for them a saved value is not proof of a CM's decision.
// What IS proof:
//   A. a Darwin exit record + Employee Status "Payroll Converted": since 2026-10-12 the sync never pre-marks anyone with an exit record
//      (they must go to CM actions first), so only a person on the page could have set it;
//   B. a "Payroll Converted" saved on the page and logged in the change log (from 2026-11-09).
// Writes payroll_cm_marked.csv (Employee ID, Name, Campus, Evidence) -- HAS STAFF NAMES: download, then rm payroll_cm_marked.csv.
// The console shows counts only, and how many payroll people were left out (no proof of a CM mark).
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_cm_marked.ts
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, instructorsTable, uploadsTable } from "@workspace/db";
import { isPayrollPerson } from "../../routes/reports";

const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

async function main() {
  const all = await db.select().from(instructorsTable);
  const logged = new Map<string, string>();
  for (const l of await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Employee Status change"))) {
    const m = l.filename.match(/^(\S+): .* -> payroll_converted on the page/);
    if (m) logged.set(m[1].toUpperCase(), l.uploadedAt.toISOString().slice(0, 10));
  }
  const payroll = all.filter((r) => isPayrollPerson(r) && (r.inTeachos || r.inDarwin));
  const out: string[][] = [];
  let noProof = 0, noProofNoId = 0;
  for (const r of payroll.sort((a, b) => a.fullName.localeCompare(b.fullName))) {
    if (r.exitVerification !== "payroll_converted") { noProof++; continue; }
    const id = (r.employeeId ?? "").trim().toUpperCase();
    const evidence = r.exitFlag ? `Darwin exit record (${r.exitFlagStatus ?? "-"}) marked Payroll Converted on the page`
      : id && logged.has(id) ? `Marked Payroll Converted on the page on ${logged.get(id)}` : null;
    if (!evidence) { noProof++; if (!id || !/^NW\d{7}$/.test(id)) noProofNoId++; continue; }
    out.push([r.employeeId ?? "", r.fullName, (r.institutes ?? []).join("; "), evidence]);
  }
  // Missed out (2026-11-10, per request): people a CM provably marked Payroll Converted who are NOT in the payroll list -- e.g. no longer
  // in TeachOS or Darwin, or still in Darwin with no exit record but marked on the page since the change log started.
  const inList = new Set(payroll.map((r) => r.id));
  const missed: string[][] = [];
  for (const r of all.filter((x) => x.exitVerification === "payroll_converted" && !inList.has(x.id)).sort((a, b) => a.fullName.localeCompare(b.fullName))) {
    const id = (r.employeeId ?? "").trim().toUpperCase();
    const evidence = r.exitFlag ? `Darwin exit record (${r.exitFlagStatus ?? "-"}) marked Payroll Converted on the page`
      : id && logged.has(id) ? `Marked Payroll Converted on the page on ${logged.get(id)}` : null;
    if (!evidence) continue;
    const where = !r.inTeachos && !r.inDarwin ? "no longer in TeachOS or Darwin" : r.inDarwin && !r.exitFlag ? "in Darwin, no exit record" : `in TeachOS ${r.inTeachos ? "yes" : "no"}, in Darwin ${r.inDarwin ? "yes" : "no"}`;
    missed.push([r.employeeId ?? "", r.fullName, (r.institutes ?? []).join("; "), `${evidence} -- NOT in your list: ${where}`]);
  }
  fs.writeFileSync("payroll_cm_marked.csv", "\uFEFF" + [["Employee ID", "Name", "Campus", "Evidence"], ...out, ...missed].map((x) => x.map(esc).join(",")).join("\r\n"));
  console.log(`  MISSED from your list but provably CM-marked Payroll Converted: ${missed.length} (at the end of the CSV; Evidence says why they were not in the list)`);
  console.log(`Payroll converted (app rule): ${payroll.length}`);
  console.log(`  PROVEN marked by a Capability Manager: ${out.length}  -> payroll_cm_marked.csv`);
  console.log(`  left out, no proof of a CM mark: ${noProof} (TeachOS-only, no Darwin exit record; value set automatically before 24 Oct or not set) -- of them ${noProofNoId} have no valid employee ID`);
  console.log(`payroll_cm_marked.csv HAS STAFF NAMES -- download it, then: rm payroll_cm_marked.csv`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
