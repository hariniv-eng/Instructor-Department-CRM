// One-off, READ-ONLY (2026-11-19, per request: "Instructor Archive shows 39 exited, Exit Breakdown shows 32 -- who are the other 7?").
// Archive "Exited" = every archive person with status Exited. Exit Breakdown "All exits" = status Exited AND Darwin exit Approved,
// plus payroll people with a typed date of exit of today or earlier. Lists the difference both ways by employee ID only (no names).
//   pnpm exec tsx src/lib/connectors/_tmp_archive_vs_exit_breakdown.ts
import { loadArchivePeople } from "../../routes/reports";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
async function main() {
  const people = (await loadArchivePeople()) as Array<Record<string, any>>;
  const approved = (p: any) => String(p.exit_status ?? "").trim().toLowerCase() === "approved";
  const payrollExit = (p: any) => p.is_payroll && !!p.manual_exit_date && p.manual_exit_date <= today;
  const inBreakdown = (p: any) => payrollExit(p) || (p.status === "Exited" && approved(p));
  const onOverview = (p: any) => p.status === "Exited" && approved(p) && !p.is_payroll;
  const archiveExited = people.filter((p) => p.status === "Exited");
  const breakdown = people.filter(inBreakdown);
  console.log(`Archive Exited: ${archiveExited.length} | Exit Breakdown (All exits): ${breakdown.length} | Overview Exit data: ${people.filter(onOverview).length}`);
  const line = (p: any, why: string) => console.log(`  ${p.employee_id ?? "(no id)"} | ${why} | Darwin exit status: ${p.exit_status ?? "(none)"} | date of exit ${p.date_of_exit ?? "-"} | raised ${p.exit_date ?? "-"} | payroll ${p.is_payroll ? "yes" : "no"} | typed date ${p.manual_exit_date ?? "-"} | team ${p.classification ?? "-"}`);
  console.log(`\nIn the Archive as Exited but NOT in Exit Breakdown:`);
  for (const p of archiveExited.filter((p) => !inBreakdown(p)))
    line(p, !p.exit_status ? "no Darwin exit record" : `Darwin exit not Approved`);
  console.log(`\nIn Exit Breakdown but NOT Exited in the Archive:`);
  for (const p of breakdown.filter((p) => p.status !== "Exited")) line(p, `payroll, typed date passed (archive says ${p.status})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
