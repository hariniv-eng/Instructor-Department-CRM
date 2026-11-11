// One-off, READ-ONLY (2026-11-11, per request: "approved Serving Notice Period people do not show their date of exit; move those whose
// date has passed to remove access"). Lists everyone with Employee Status = Serving Notice Period: Darwin exit status, the date of exit the
// app now uses (typed date, else Darwin's last working day -- "Date Of Exit", else "Lwd As Per Notice Period"), where it comes from,
// whether it has passed, whether they are still in TeachOS, and which Overview list they belong in. Employee IDs and dates only.
//   pnpm exec tsx src/lib/connectors/_tmp_snp_check.ts
import { db, instructorsTable } from "@workspace/db";

async function main() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rows = (await db.select().from(instructorsTable)).filter((r) => r.exitVerification === "serving_notice_period");
  console.log(`Marked Serving Notice Period: ${rows.length} (today ${today})\n`);
  console.log("employee id | Darwin exit status | date of exit | from | passed? | in TeachOS | in Darwin | belongs in");
  let noDate = 0, passedTeachos = 0, passedGone = 0, waiting = 0;
  for (const r of rows.sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId)))) {
    const date = r.manualExitDate ?? r.exitLastWorkingDate ?? null;
    const from = r.manualExitDate ? "typed in FCC" : r.exitLastWorkingDate ? "Darwin" : "-";
    const passed = !!date && date < today;
    const where = !date ? "Serving notice (NO DATE -- Darwin has none and none typed)" : passed ? (r.inTeachos ? "REMOVE TeachOS access (Exited at next sync)" : "Exited at next sync (already out of TeachOS)") : "Serving notice";
    if (!date) noDate++; else if (passed && r.inTeachos) passedTeachos++; else if (passed) passedGone++; else waiting++;
    console.log(`${r.employeeId ?? "(no id)"} | ${r.exitFlagStatus ?? "-"} | ${date ?? "-"} | ${from} | ${passed ? "yes" : "no"} | ${r.inTeachos ? "yes" : "no"} | ${r.inDarwin ? "yes" : "no"} | ${where}`);
  }
  console.log(`\nSummary: still serving ${waiting} | date passed, still in TeachOS -> remove access ${passedTeachos} | date passed, already out of TeachOS ${passedGone} | no date at all ${noDate}`);
  console.log("Dates are as of the last sync; after Publish + Sync Now the 'date passed' people are set to Exited automatically.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
