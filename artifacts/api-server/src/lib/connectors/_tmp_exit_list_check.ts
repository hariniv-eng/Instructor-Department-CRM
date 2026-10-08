// One-off (2026-10-07): why isn't someone on the Overview's Exception 2 Exit list?
// Lists every instructor reviewed Exited / Absconded / Serving Notice Period with
// the fields that decide which list they land in. Read-only.
import { db, instructorsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

async function main() {
  const rows = await db.select().from(instructorsTable).where(inArray(instructorsTable.exitVerification, ["exited", "absconded", "serving_notice_period"]));
  rows.sort((a, b) => (a.exitVerification ?? "").localeCompare(b.exitVerification ?? "") || a.fullName.localeCompare(b.fullName));
  console.log(`${rows.length} people reviewed Exited / Absconded / Serving Notice Period\n`);
  for (const r of rows) {
    const reasons: string[] = [];
    if (!r.exitFlag) reasons.push("NO EXIT RECORD (exitFlag false -> falls out of the queue)");
    if (!r.inTeachos) reasons.push("not in TeachOS (Exit list only shows people still in TeachOS)");
    if (r.classification === "excluded_ops_managers") reasons.push("ops/managers classification");
    console.log([
      r.fullName, r.employeeId ?? "-", `review=${r.exitVerification}`,
      `inTeachos=${r.inTeachos}`, `inDarwin=${r.inDarwin}`, `exitFlag=${r.exitFlag}`,
      `status=${r.exitFlagStatus ?? "-"}`, `requestDate=${r.exitFlagDate ?? "-"}`, `lastWorkingDay=${r.exitLastWorkingDate ?? "-"}`,
      `class=${r.classification ?? "-"}`, reasons.length ? `<< ${reasons.join("; ")}` : "",
    ].join(" | "));
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
