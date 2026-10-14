import { writeFileSync } from "node:fs";
import { db, instructorsTable, darwinboxExitsTable } from "@workspace/db";
import { cell, toISODate } from "../reconcile";
const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function main() {
  const exits = await db.select().from(darwinboxExitsTable);
  const columns = [...new Set(exits.flatMap((e) => Object.keys((e.rawData ?? {}) as Record<string, unknown>)))];
  const lines = [["employee_id", ...columns].map(esc).join(",")];
  for (const e of exits) { const raw = (e.rawData ?? {}) as Record<string, unknown>; lines.push([e.employeeId, ...columns.map((c) => raw[c])].map(esc).join(",")); }
  const file = `${process.env.HOME ?? "."}/workspace/darwin_exit_export.csv`;
  writeFileSync(file, lines.join("\n"), "utf8");
  console.log(`Wrote ${exits.length} exit records to ${file}\n`);
  const latest = new Map<string, { status: string; exitDate: string | null; lastDay: string | null; id: number }>();
  for (const e of exits) {
    if (!e.employeeId) continue;
    const raw = (e.rawData ?? {}) as Record<string, unknown>;
    const status = String(cell(raw as any, "Status", "status") ?? "").trim();
    const exitDate = toISODate(cell(raw as any, "Exit Date", "exit_date") as string | null);
    const lastDay = toISODate(cell(raw as any, "Date Of Exit", "date_of_exit") as string | null);
    const prev = latest.get(e.employeeId);
    if (!prev || (exitDate ?? "") > (prev.exitDate ?? "") || ((exitDate ?? "") === (prev.exitDate ?? "") && e.id > prev.id)) latest.set(e.employeeId, { status, exitDate, lastDay, id: e.id });
  }
  const live = await db.select().from(instructorsTable);
  const label: Record<string, string> = { exited: "Exited", serving_notice_period: "Serving notice period", payroll_converted: "Payroll converted", absconded: "Absconded" };
  const focus = live.filter((r) => !r.inDarwin && !r.inTeachos && r.employeeId && latest.has(r.employeeId) && (/^pending/i.test(latest.get(r.employeeId)!.status) || r.exitVerification === "serving_notice_period"));
  console.log(`Gone from Darwin AND TeachOS, with a pending exit or Serving notice period status: ${focus.length}\n`);
  focus.sort((a, b) => a.fullName.localeCompare(b.fullName)).forEach((r, i) => {
    const rec = latest.get(r.employeeId!)!;
    console.log(`${i + 1}. ${r.fullName} (${r.employeeId}) | Darwin exit status: ${rec.status} | Exit Date: ${rec.exitDate ?? "-"} | Date Of Exit: ${rec.lastDay ?? "-"} | Employee Status: ${r.exitVerification ? label[r.exitVerification] ?? r.exitVerification : "not set"}`);
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
