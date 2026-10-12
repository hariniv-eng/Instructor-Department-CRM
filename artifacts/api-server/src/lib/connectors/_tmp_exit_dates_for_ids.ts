// One-off, READ-ONLY (2026-10-13): prints name, employee_id and the Darwin exit data's "Date Of Exit" for a fixed list of employee IDs, straight
// from darwinboxExitsTable, and writes the same rows to a CSV.
// Run in the Replit shell from artifacts/api-server:  pnpm exec tsx src/lib/connectors/_tmp_exit_dates_for_ids.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { db, darwinboxExitsTable } from "@workspace/db";
import { cell } from "../reconcile";

const IDS = "NW0001780, NW0003443, NW0003537, NW0003927, NW0003935, NW0004042, NW0004728, NW0005043, NW0005549, NW0005733, NW0006757, NW0006883, NW0007018, NW2000299, NW2000339, NW2000377, NW2000393, NW2000442, NW2000516, NW2000538, NW2000560, NW2000575, NW2000604, NW2000632, NW2000642, NW2000646, NW2000654, NW2000656, NW2000668, NW2000678, NW2000683, NW2000690, NW2000697, NW2000719, NW2000721".split(",").map((id) => id.trim());

async function main() {
  const records = await db.select().from(darwinboxExitsTable);
  // One row per person: name, employee_id, date of exit. The Date Of Exit is taken from the person's newest exit record that
  // has one (Revoked / Rejected records skipped); blank when no record has it, "NO EXIT RECORD" when there is none at all.
  const lines = [["name", "employee_id", "date_of_exit"]];
  for (const id of IDS) {
    const mine = records.filter((record) => record.employeeId === id).sort((a, b) => b.id - a.id);
    if (mine.length === 0) { lines.push(["", id, "NO EXIT RECORD"]); continue; }
    const valid = mine.filter((record) => !["revoked", "rejected"].includes((cell(record.rawData as Record<string, unknown>, "Status") ?? "").trim().toLowerCase()));
    const withDate = (valid.length ? valid : mine).find((record) => cell(record.rawData as Record<string, unknown>, "Date Of Exit"));
    const chosen = withDate ?? mine[0];
    const raw = chosen.rawData as Record<string, unknown>;
    lines.push([cell(raw, "Full Name", "Employee Name") ?? "", id, withDate ? (cell(raw, "Date Of Exit") ?? "") : ""]);
  }
  console.log(lines.map((line) => line.join("\t")).join("\n"));
  mkdirSync("exports", { recursive: true });
  writeFileSync("exports/exit_dates_for_ids.csv", lines.map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n"));
  console.log("\nAlso saved to artifacts/api-server/exports/exit_dates_for_ids.csv");
  process.exit(0);
}
main().catch((error) => { console.error(error); process.exit(1); });
