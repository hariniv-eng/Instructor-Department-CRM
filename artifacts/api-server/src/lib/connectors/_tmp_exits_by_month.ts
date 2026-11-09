// One-off, READ-ONLY (2026-11-09, per request: "we have 19 exits recorded in October, right?"). Uses exactly the Overview Exit data card's
// rule for an exit (Instructor Archive status Exited, Darwin exit Approved, not a payroll candidate) and counts them per month, two ways:
//   by Date of Exit (last working day)  and  by the date the exit was raised (Exit Date).
// Then lists the chosen month's exits by employee ID only (no names), with both dates.
//   pnpm exec tsx src/lib/connectors/_tmp_exits_by_month.ts            (lists October 2026)
//   pnpm exec tsx src/lib/connectors/_tmp_exits_by_month.ts 2026-09
import { loadArchivePeople } from "../../routes/reports";

async function main() {
  const month = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "2026-10").slice(0, 7);
  const people = (await loadArchivePeople()) as Array<Record<string, unknown>>;
  const exits = people.filter((p) => p.status === "Exited" && String(p.exit_status ?? "").trim().toLowerCase() === "approved" && !p.is_payroll);
  const count = (key: "date_of_exit" | "exit_date") => {
    const m = new Map<string, number>();
    for (const p of exits) { const k = String(p[key] ?? "").slice(0, 7) || "(no date)"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m].sort((a, b) => b[0].localeCompare(a[0]));
  };
  console.log(`Exits on the Exit data card (approved, not payroll): ${exits.length}`);
  console.log(`\nBy Date of Exit (last working day):`);
  for (const [k, v] of count("date_of_exit").slice(0, 8)) console.log(`  ${k}: ${v}`);
  console.log(`\nBy date the exit was raised (Exit Date):`);
  for (const [k, v] of count("exit_date").slice(0, 8)) console.log(`  ${k}: ${v}`);
  const inMonth = exits.filter((p) => String(p.date_of_exit ?? "").startsWith(month) || String(p.exit_date ?? "").startsWith(month));
  console.log(`\n${month}: exits whose Date of Exit OR raised date is in this month: ${inMonth.length}`);
  console.log(`   Deployed ${inMonth.filter((p) => p.deployed_or_training === "Deployed").length} | Training ${inMonth.filter((p) => p.deployed_or_training === "Training").length}`);
  for (const p of inMonth.sort((a, b) => String(a.date_of_exit ?? "").localeCompare(String(b.date_of_exit ?? ""))))
    console.log(`  ${p.employee_id ?? "(no id)"} | Date of Exit ${p.date_of_exit ?? "-"} | raised ${p.exit_date ?? "-"} | ${String(p.date_of_exit ?? "").startsWith(month) ? "LWD in month" : "raised in month only"} | ${p.deployed_or_training ?? "-"}${p.deployment_date ? ` (first session ${p.deployment_date})` : ""}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
