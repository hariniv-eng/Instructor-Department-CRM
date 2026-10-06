// One-off (2026-10-06): restore Approved exits that Darwinbox's live exits
// report no longer returns, from the old Aug-29 export kept in exports/.
// Dry-run by default (prints who would change); pass --apply to write.
// Only touches archive rows that are in the Archive scope, have NO exit date
// today (exitFlagDate / exitDate both empty), are not currently in Darwin
// (inDarwin=false), and whose employee_id has an Approved record in the old
// file. Writes archive.exit_date only (the sticky field the Archive page and
// archiveInstructors() already respect). Run from artifacts/api-server.
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, instructorArchiveTable } from "@workspace/db";

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, "")); rows.push(row); }
  return rows;
}
function toISO(v: string): string | null {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(t);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const file = path.resolve(process.cwd(), "exports", "darwinbox-exits.csv");
  const rows = parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const iId = col("employee id"), iStatus = col("status"), iDate = col("exit date");
  if (iId < 0 || iStatus < 0 || iDate < 0) throw new Error(`Unexpected columns: ${rows[0].join(" | ")}`);
  const approvedByEmp = new Map<string, string>();
  for (const r of rows.slice(1)) {
    const id = (r[iId] ?? "").trim();
    if ((r[iStatus] ?? "").trim().toLowerCase() !== "approved" || !id) continue;
    const iso = toISO(r[iDate] ?? "");
    if (!iso) continue;
    const prev = approvedByEmp.get(id);
    if (!prev || iso >= prev) approvedByEmp.set(id, iso);
  }
  console.log(`Old export: ${rows.length - 1} rows, ${approvedByEmp.size} employee IDs with an Approved record. Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

  const archive = await db.select().from(instructorArchiveTable);
  const todo: typeof archive = [];
  const skippedInDarwin: string[] = [];
  for (const a of archive) {
    if (!a.inArchiveScope || !a.employeeId || a.exitFlagDate || a.exitDate) continue;
    const iso = approvedByEmp.get(a.employeeId);
    if (!iso) continue;
    if (a.inDarwin) { skippedInDarwin.push(`${a.fullName} | ${a.employeeId} | old Approved ${iso} | but currently in Darwin -- skipped, check manually`); continue; }
    todo.push(a);
    console.log(`  RESTORE ${a.fullName} | ${a.employeeId} | class=${a.classification} | exit_date -> ${iso}`);
  }
  console.log(`\nWould restore: ${todo.length}`);
  if (skippedInDarwin.length) { console.log(`\nSkipped (currently in Darwin): ${skippedInDarwin.length}`); for (const s of skippedInDarwin) console.log("  " + s); }
  if (apply) {
    for (const a of todo) await db.update(instructorArchiveTable).set({ exitDate: approvedByEmp.get(a.employeeId!)! }).where(eq(instructorArchiveTable.id, a.id));
    console.log(`\nApplied ${todo.length} updates.`);
  } else console.log("\nDry run only -- re-run with --apply to write.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
