// One-off, READ-ONLY (2026-10-23, per request: "why did the exit count go from 21 to 20?"). The Overview's Exit data card counts
// Archive people with status Exited, Darwin exit Approved, and not marked Payroll Converted by their CM (GET /reports/approved-exits).
// This prints today's list, then everyone who has an APPROVED Darwin exit record somewhere but is NOT on it, with the reason -- the
// person who dropped off will be among them (e.g. CM changed them to Payroll Converted, their latest Darwin record is now Revoked /
// Rejected / Pending, they left the Archive scope, or the record is no longer returned by Darwin). Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_exit_count_drop.ts
import { db, darwinboxExitsTable, instructorArchiveTable } from "@workspace/db";
import { loadArchivePeople } from "../../routes/reports";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

async function main() {
  const people = await loadArchivePeople();
  const onCard = people.filter((p) => p.status === "Exited" && s(p.exit_status).toLowerCase() === "approved" && !p.is_payroll);
  console.log(`Exit data card today: ${onCard.length}`);
  for (const p of onCard.sort((a, b) => s(b.date_of_exit ?? b.exit_date).localeCompare(s(a.date_of_exit ?? a.exit_date)))) console.log(`  ${p.full_name} | ${p.employee_id ?? "-"} | exit ${p.exit_date ?? "-"} | LWD ${p.date_of_exit ?? "-"}`);

  const onIds = new Set(onCard.map((p) => p.employee_id).filter(Boolean));
  const archive = await db.select().from(instructorArchiveTable);
  const archByEmp = new Map(archive.filter((a) => a.employeeId).map((a) => [a.employeeId!, a]));
  const shownByEmp = new Map(people.filter((p) => p.employee_id).map((p) => [p.employee_id!, p]));
  const exits = await db.select().from(darwinboxExitsTable);
  const byEmp = new Map<string, typeof exits>();
  for (const x of exits) { if (!x.employeeId) continue; if (!byEmp.has(x.employeeId)) byEmp.set(x.employeeId, []); byEmp.get(x.employeeId)!.push(x); }

  console.log(`\nHave an APPROVED Darwin exit record but are NOT on the card:`);
  let n = 0;
  for (const [emp, recs] of byEmp) {
    if (onIds.has(emp)) continue;
    if (!recs.some((r) => s((r.rawData as Record<string, unknown>)?.["Status"]).toLowerCase() === "approved")) continue;
    const a = archByEmp.get(emp);
    if (!a) continue; // not someone the Archive has ever tracked (other departments) -- never on the card
    const shown = shownByEmp.get(emp);
    const statuses = recs.map((r) => { const d = r.rawData as Record<string, unknown>; return `${s(d["Status"]) || "?"} (raised ${s(d["Exit Date"]) || "-"}${s(d["Exit Source"]) ? `, ${s(d["Exit Source"])}` : ""})`; }).join("; ");
    const why = !a.inArchiveScope ? "not in the Archive scope (never flagged as a department member)"
      : !shown ? `left the department population (classification now ${a.classification ?? "-"})`
      : a.exitVerification === "payroll_converted" ? "CM marked them PAYROLL CONVERTED"
      : shown.status !== "Exited" ? `Archive status ${shown.status} (latest Darwin record is not Approved)`
      : s(shown.exit_status).toLowerCase() !== "approved" ? `latest Darwin exit status: ${shown.exit_status}`
      : "other";
    n++;
    console.log(`  ${a.fullName} | ${emp} | WHY: ${why} | CM status: ${a.exitVerification ?? "-"} | Darwin records: ${statuses}`);
  }
  if (!n) console.log("  none");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
