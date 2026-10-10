// One-off (2026-10-10): who is shown without a Date of exit although an exit record exists?
// Read-only. For everyone reviewed Exited / Absconded / Serving Notice Period, or with an Approved / Pending exit
// record, whose exit_last_working_date is empty, prints every Darwinbox exit record for that employee ID and every
// field on it that looks like a date, so we can see which column actually holds the last working day.
import { db, instructorsTable, darwinboxExitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DATE_KEY = /date|day|lwd|relie|leav|resign|notice/i;

async function main() {
  const people = await db.select().from(instructorsTable);
  const missing = people.filter((p) => {
    if (p.exitLastWorkingDate) return false;
    const status = (p.exitFlagStatus ?? "").trim().toLowerCase();
    const live = p.exitFlag && (status === "approved" || status.startsWith("pending"));
    const marked = ["exited", "absconded", "serving_notice_period"].includes(p.exitVerification ?? "");
    return live || marked || /thumb/i.test(p.fullName);
  });
  missing.sort((a, b) => a.fullName.localeCompare(b.fullName));
  console.log(`${missing.length} people with an exit record / exit review but no Date of exit\n`);
  for (const p of missing) {
    console.log(`=== ${p.fullName} | ${p.employeeId ?? "-"} | review=${p.exitVerification ?? "-"} | status=${p.exitFlagStatus ?? "-"} | requestDate=${p.exitFlagDate ?? "-"} | class=${p.classification ?? "-"}`);
    if (!p.employeeId) { console.log("   no employee ID on file, so no exit record can be matched\n"); continue; }
    const records = await db.select().from(darwinboxExitsTable).where(eq(darwinboxExitsTable.employeeId, p.employeeId));
    if (records.length === 0) { console.log("   no row in the exit table for this employee ID\n"); continue; }
    for (const record of records) {
      const raw = (record.rawData ?? {}) as Record<string, unknown>;
      const dates = Object.entries(raw).filter(([key]) => DATE_KEY.test(key)).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
      console.log(`   record ${record.id}: ${dates.join(" ; ") || "(no date-like fields)"}`);
    }
    console.log("");
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
