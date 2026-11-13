// One-off, READ-ONLY (2026-11-13, per request: "which exits did Darwin stop sending that FCC still holds?"). Lists every row in the
// exits table marked "Kept from an earlier sync" (carried over because the Darwin reports no longer return that employee), with the
// person's state in FCC today. Writes kept_exits.csv (HAS STAFF NAMES -- download it, then: rm kept_exits.csv); the console shows counts only.
//   pnpm exec tsx src/lib/connectors/_tmp_kept_exits.ts
import fs from "node:fs";
import { db, darwinboxExitsTable, instructorsTable } from "@workspace/db";
import { isPayrollPerson } from "../../routes/reports";

const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
const cell = (raw: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) { const v = raw[k]; if (v != null && String(v).trim() !== "") return String(v).trim(); } return ""; };
const year = (s: string) => (s.match(/(\d{4})/)?.[1] ?? "unknown");

async function main() {
  const exits = await db.select().from(darwinboxExitsTable);
  const kept = exits.filter((r) => String((r.rawData as Record<string, unknown>)?.["Exit Source"] ?? "").startsWith("Kept from an earlier sync"));
  const live = new Map((await db.select().from(instructorsTable)).filter((r) => r.employeeId).map((r) => [r.employeeId!.trim().toUpperCase(), r]));
  const rows = kept.map((k) => {
    const raw = k.rawData as Record<string, unknown>;
    const id = String(k.employeeId ?? raw["Employee Id"] ?? "").trim().toUpperCase();
    const p = live.get(id);
    return {
      id, name: k.fullName ?? cell(raw, "Employee Name", "Full Name"), status: cell(raw, "Status", "Exit Status"),
      raised: cell(raw, "Exit Date", "Separation Requested On"), lwd: cell(raw, "Date Of Exit"), dept: cell(raw, "Department"), desig: cell(raw, "Designation"),
      reason: cell(raw, "Reason For Leaving", "Exit Reason", "Separation Reason"),
      inFcc: !!p, inDarwin: p?.inDarwin ? "yes" : "no", inTeachos: p?.inTeachos ? "yes" : "no", classification: p?.classification ?? "",
      empStatus: p?.exitVerification ?? "", payroll: p ? (isPayrollPerson(p) ? "yes" : "no") : "",
      lastSynced: k.syncedAt ? new Date(k.syncedAt).toISOString().slice(0, 10) : "",
    };
  }).sort((a, b) => a.raised.split("-").reverse().join("").localeCompare(b.raised.split("-").reverse().join("")) * -1 || a.id.localeCompare(b.id));
  const header = ["Employee ID", "Name", "Darwin exit status", "Exit raised on", "Date of exit", "Department", "Designation", "Reason", "In FCC", "Still in Darwin", "Still in TeachOS", "FCC classification", "Employee Status (CM)", "Payroll"];
  const lines = [header.map(esc).join(","), ...rows.map((r) => [r.id, r.name, r.status, r.raised, r.lwd, r.dept, r.desig, r.reason, r.inFcc ? "yes" : "no", r.inDarwin, r.inTeachos, r.classification, r.empStatus, r.payroll].map(esc).join(","))];
  fs.writeFileSync("kept_exits.csv", "﻿" + lines.join("\r\n"));
  const count = (f: (r: (typeof rows)[number]) => string) => { const m = new Map<string, number>(); for (const r of rows) m.set(f(r), (m.get(f(r)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k || "(blank)"} ${n}`).join(" | "); };
  console.log(`Kept exit rows: ${rows.length} | people: ${new Set(rows.map((r) => r.id)).size}`);
  console.log(`By Darwin exit status: ${count((r) => r.status)}`);
  console.log(`By year raised: ${count((r) => year(r.raised))}`);
  console.log(`Person in FCC: ${count((r) => (r.inFcc ? "yes" : "no"))}`);
  console.log(`Still in Darwin: ${count((r) => r.inDarwin)} | still in TeachOS: ${count((r) => r.inTeachos)}`);
  console.log(`Payroll: ${count((r) => r.payroll)} | Employee Status: ${count((r) => r.empStatus)}`);
  console.log("Wrote kept_exits.csv (HAS STAFF NAMES -- download it, then: rm kept_exits.csv)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
