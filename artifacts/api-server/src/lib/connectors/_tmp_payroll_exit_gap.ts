// One-off (2026-10-06): of the payroll-converted people in the department
// baseline (~55), only 22 show a Darwinbox exit record. For the rest, find
// out WHY: no employee_id on file (exit matching is employee-ID-only, see
// loadLatestExitsByPerson in reconcile.ts), an ID with no row in the exits
// report, a Revoked/Rejected latest record, or an exit row that exists
// under the person's NAME but a different/missing ID. Read-only.
import { db, instructorArchiveTable, darwinboxExitsTable } from "@workspace/db";
import { normalize } from "../reconcile";

type Raw = Record<string, unknown>;
const pick = (raw: Raw, ...keys: string[]) => { for (const k of keys) { const v = raw?.[k]; if (v !== undefined && v !== null && String(v).trim() !== "") return String(v); } return ""; };

async function main() {
  const archive = await db.select().from(instructorArchiveTable);
  const exits = await db.select().from(darwinboxExitsTable);
  console.log(`Exit records in Darwinbox exits table: ${exits.length}`);

  const payroll = archive.filter((r) => r.inArchiveScope && r.classification === "payroll_converted");
  const flagged = payroll.filter((r) => r.exitFlag);
  const unflagged = payroll.filter((r) => !r.exitFlag);
  console.log(`Payroll-converted in baseline: ${payroll.length} | with exit record: ${flagged.length} | without: ${unflagged.length}\n`);

  const byId = new Map<string, typeof exits>();
  for (const e of exits) if (e.employeeId) byId.set(e.employeeId, [...(byId.get(e.employeeId) ?? []), e]);
  const byName = new Map<string, typeof exits>();
  for (const e of exits) { const n = normalize(e.fullName ?? ""); if (n) byName.set(n, [...(byName.get(n) ?? []), e]); }

  const groups: Record<string, string[]> = { "no employee_id": [], "ID has no exit row": [], "latest exit is Revoked/Rejected": [], "no ID match, but same NAME in exits report": [] };
  for (const r of unflagged) {
    const label = `${r.fullName} | emp=${r.employeeId ?? "(none)"} | teachos=${r.teachosUserId ? "yes" : "no"}`;
    const idRows = r.employeeId ? byId.get(r.employeeId) ?? [] : [];
    const nameRows = byName.get(normalize(r.fullName)) ?? [];
    if (idRows.length > 0) {
      const statuses = idRows.map((e) => pick(e.rawData as Raw, "Status", "status")).join(",");
      groups["latest exit is Revoked/Rejected"].push(`${label} | statuses=${statuses}`);
    } else if (nameRows.length > 0) {
      groups["no ID match, but same NAME in exits report"].push(`${label} | exits report has: ${nameRows.map((e) => `emp=${e.employeeId} status=${pick(e.rawData as Raw, "Status", "status")} date=${pick(e.rawData as Raw, "Exit Date", "exit_date")}`).join("; ")}`);
    } else if (!r.employeeId) {
      groups["no employee_id"].push(label);
    } else {
      groups["ID has no exit row"].push(`${label} | joined=${r.dateOfJoining ?? "?"} | designation=${r.designation ?? "?"}`);
    }
  }
  for (const [g, list] of Object.entries(groups)) {
    console.log(`=== ${g}: ${list.length} ===`);
    for (const l of list) console.log("  " + l);
    console.log("");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
