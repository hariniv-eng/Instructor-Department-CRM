// One-off, READ-ONLY (2026-10-13): people whose latest Darwin exit record is still "Pending With Approver" but who are no
// longer in Darwin (inDarwin = false). Prints name, employee id, the exit record's status/dates, the Capability Manager's
// Employee Status, and classification. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_pending_exit_not_in_darwin.ts
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable } from "@workspace/db";
import { cell, toISODate } from "../reconcile";

const STATUS_LABEL: Record<string, string> = { exited: "Exited", serving_notice_period: "Serving notice period", payroll_converted: "Payroll converted", absconded: "Absconded" };

async function main() {
  const exits = await db.select().from(darwinboxExitsTable);
  // Latest record per employee (by Exit Date, then id).
  const latest = new Map<string, { id: number; status: string; exitDate: string | null; lastDay: string | null; raw: Record<string, unknown> }>();
  for (const e of exits) {
    if (!e.employeeId) continue;
    const raw = (e.rawData ?? {}) as Record<string, unknown>;
    const status = String(cell(raw as any, "Status", "status") ?? "").trim();
    const exitDate = toISODate(cell(raw as any, "Exit Date", "exit_date") as string | null);
    const lastDay = toISODate(cell(raw as any, "Date Of Exit", "date_of_exit") as string | null);
    const prev = latest.get(e.employeeId);
    if (!prev || (exitDate ?? "") > (prev.exitDate ?? "") || ((exitDate ?? "") === (prev.exitDate ?? "") && e.id > prev.id)) latest.set(e.employeeId, { id: e.id, status, exitDate, lastDay, raw });
  }
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const liveBy = new Map(live.filter((r) => r.employeeId).map((r) => [r.employeeId!, r]));
  const archBy = new Map(archive.filter((r) => r.employeeId).map((r) => [r.employeeId!, r]));

  const out: string[] = [];
  let n = 0;
  for (const [empId, rec] of latest) {
    if (!/^pending/i.test(rec.status)) continue;
    const l = liveBy.get(empId);
    const a = archBy.get(empId);
    const person = l ?? a;
    if (!person) continue; // not an instructor-department person at all
    const inDarwin = l ? l.inDarwin : a!.inDarwin;
    if (inDarwin) continue;
    n += 1;
    const verification = (l?.exitVerification ?? a?.exitVerification) ?? null;
    out.push([
      `${n}. ${person.fullName} (${empId})`,
      `   Darwin exit status: ${rec.status} | Exit Date (request raised): ${rec.exitDate ?? "-"} | Date Of Exit (last working day): ${rec.lastDay ?? "-"}`,
      `   Employee Status (Capability Manager): ${verification ? STATUS_LABEL[verification] ?? verification : "not set"}`,
      `   Classification: ${person.classification ?? "-"} | In TeachOS: ${l ? l.inTeachos : a!.inTeachos} | Live row: ${l ? "yes" : "no (archive only)"}`,
    ].join("\n"));
  }
  console.log(`People whose latest Darwin exit record is Pending With Approver and who are not in Darwin: ${n}\n`);
  console.log(out.join("\n\n"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
