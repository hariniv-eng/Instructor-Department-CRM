// One-off REPAIR (2026-11-09, per request: "NW2000452's Darwin details belong to someone else with the same name"). The old full-name
// fallback linked this TeachOS instructor to a DIFFERENT Darwin employee with the same name (OTHER_ID). Matching is employee-ID only now,
// and the next Darwin sync resets department / designation / manager / location / gender on the live row by itself -- but the old link
// also wrote org email, mobile and date of joining (not reset by the sync) and the Instructor Archive kept copies. This clears, on the live
// row and on the archive row of EMP, every Darwin field whose value is exactly OTHER_ID's value in Darwin's full roster (i.e. came from the
// other person). His own values (different from the other person's) are left alone. Gender is not touched on the archive (it could
// legitimately match). Prints field names and yes/no only -- no names, emails or numbers.
//   DRY RUN (shows what would change):  pnpm exec tsx src/lib/connectors/_tmp_fix_name_link.ts NW2000452 NW1008701
//   APPLY:                              pnpm exec tsx src/lib/connectors/_tmp_fix_name_link.ts NW2000452 NW1008701 --apply
import { sql } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, darwinboxFullRosterTable } from "@workspace/db";
import { toISODate } from "../reconcile";

const FIELDS: [string, string][] = [
  ["orgEmail", "Org Email Id"], ["mobile", "Primary Mobile Number"], ["dateOfJoining", "Date Of Joining"], ["department", "Department"],
  ["subDepartment", "Sub Department"], ["designation", "Designation"], ["directManager", "Direct Manager"], ["workLocation", "Work Location"],
  ["workspace", "Workspace"], ["gender", "Gender"], ["currentState", "Current State"], ["currentCity", "Current City"],
  ["darwinEmployeeStatus", "Employee Status"],
];
const same = (field: string, a: unknown, b: unknown) => {
  if (a == null || b == null || String(a).trim() === "" || String(b).trim() === "") return false;
  if (field === "dateOfJoining") return toISODate(String(a)) === toISODate(String(b));
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
};

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const apply = args.includes("--apply");
  const [emp, other] = args.filter((a) => a !== "--apply").map((a) => a.trim().toUpperCase());
  if (!emp || !other) { console.log("usage: <employee id> <other person's Darwin id> [--apply]"); process.exit(1); }
  const [darwin] = await db.select().from(darwinboxFullRosterTable).where(sql`UPPER(TRIM(${darwinboxFullRosterTable.employeeId})) = ${other}`);
  if (!darwin) { console.log(`${other} is not in Darwin's full roster -- nothing to compare with.`); process.exit(0); }
  const raw = darwin.rawData as Record<string, unknown>;

  for (const [label, table] of [["live row", instructorsTable], ["archive row", instructorArchiveTable]] as const) {
    const [row] = await db.select().from(table).where(sql`UPPER(TRIM(${table.employeeId})) = ${emp}`) as Record<string, unknown>[];
    if (!row) { console.log(`${label}: none`); continue; }
    const clear: Record<string, null> = {};
    for (const [field, key] of FIELDS) {
      if (label === "archive row" && field === "gender") continue;
      const hit = same(field, row[field], raw[key]);
      console.log(`  ${label} | ${field}: ${row[field] == null || row[field] === "" ? "(empty)" : "has a value"} | same as ${other}'s Darwin value: ${hit ? "YES -> clear" : "no"}`);
      if (hit) clear[field] = null;
    }
    if (label === "live row") Object.assign(clear, { inDarwin: false, inDarwinFullRoster: false });
    if (apply && Object.keys(clear).length) {
      await db.update(table).set(clear as never).where(sql`UPPER(TRIM(${table.employeeId})) = ${emp}`);
      console.log(`  ${label}: cleared ${Object.keys(clear).join(", ")}`);
    }
  }
  console.log(apply ? "\nDone." : "\nDry run -- nothing written. Add --apply to clear the YES fields.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
