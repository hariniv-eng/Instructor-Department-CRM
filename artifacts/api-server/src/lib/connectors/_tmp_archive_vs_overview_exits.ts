// One-off, READ-ONLY (2026-10-19): the Instructor Archive shows 24 "Exited" while the Overview's Exit data card shows 16.
// Both come from loadArchivePeople() (routes/reports.ts); the Overview card keeps only status Exited AND exit record "Approved"
// AND not payroll. This lists everyone counted as Exited in the Archive but NOT on the Overview card, with the reason.
// Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_archive_vs_overview_exits.ts
import { inArray } from "drizzle-orm";
import { db, instructorArchiveTable } from "@workspace/db";
import { loadArchivePeople } from "../../routes/reports";

async function main() {
  const people = await loadArchivePeople();
  const exited = people.filter((p) => p.status === "Exited");
  const onOverview = exited.filter((p) => (p.exit_status ?? "").trim().toLowerCase() === "approved" && !p.is_payroll);
  const gap = exited.filter((p) => !onOverview.includes(p));
  const extra = gap.length
    ? await db.select({ id: instructorArchiveTable.id, ev: instructorArchiveTable.exitVerification, manualExit: instructorArchiveTable.exitDate, cls: instructorArchiveTable.classification })
        .from(instructorArchiveTable).where(inArray(instructorArchiveTable.id, gap.map((p) => p.id)))
    : [];
  const byId = new Map(extra.map((e) => [e.id, e]));
  console.log(`Archive Exited: ${exited.length} | Overview Exit data (approved, non-payroll): ${onOverview.length} | difference: ${gap.length}\n`);
  console.log(`Name | Employee ID | Subject | Capability Manager | Darwin exit status | Exit date | Last working day | Payroll? | CM-marked status | Why not on Overview`);
  for (const p of gap) {
    const e = byId.get(p.id);
    const st = (p.exit_status ?? "").trim();
    const why = p.is_payroll ? "payroll-converted (Overview leaves payroll out)"
      : !st ? "no Darwin exit record -- Exited only because of a manually entered exit date"
      : st.toLowerCase().startsWith("pending") ? "resignation still pending approval in Darwin"
      : `Darwin status "${st}" is not Approved`;
    console.log(`${p.full_name} | ${p.employee_id ?? "-"} | ${p.dept_area ?? "-"} | ${p.capability_manager ?? "-"} | ${st || "-"} | ${p.exit_date ?? "-"} | ${p.date_of_exit ?? "-"} | ${p.is_payroll ? "yes" : "no"} | ${e?.ev ?? "-"} | ${why}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
