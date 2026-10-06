// One-off (2026-10-06): export the CURRENT darwinbox_exits table (what the
// last live exits sync stored) to CSV -- every column found in raw_data, plus
// synced_at -- to the project tmp/ folder and Downloads. Read-only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db, darwinboxExitsTable } from "@workspace/db";

const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function main() {
  const rows = await db.select().from(darwinboxExitsTable).orderBy(darwinboxExitsTable.id);
  const keys: string[] = [];
  for (const r of rows) for (const k of Object.keys(r.rawData ?? {})) if (!keys.includes(k)) keys.push(k);
  const header = ["db_id", "employee_id", "full_name", ...keys, "synced_at"];
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    const raw = (r.rawData ?? {}) as Record<string, unknown>;
    lines.push([r.id, r.employeeId, r.fullName, ...keys.map((k) => raw[k]), r.syncedAt instanceof Date ? r.syncedAt.toISOString() : r.syncedAt].map(esc).join(","));
  }
  const name = "darwinbox_exit_database.csv";
  const projectDir = path.resolve(process.cwd(), "tmp");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, name), "﻿" + lines.join("\n"), "utf8");
  fs.writeFileSync(path.join(os.homedir(), "Downloads", name), "﻿" + lines.join("\n"), "utf8");
  const statuses = new Map<string, number>();
  for (const r of rows) { const s = String((r.rawData as Record<string, unknown>)?.["Status"] ?? "(none)"); statuses.set(s, (statuses.get(s) ?? 0) + 1); }
  console.log(`Exported ${rows.length} rows, ${keys.length} raw columns: ${keys.join(" | ")}`);
  console.log("By status:", Object.fromEntries(statuses));
  console.log(`Saved to tmp/${name} and Downloads/${name}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
