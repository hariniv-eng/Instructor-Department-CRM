// One-off, READ-ONLY (2026-11-13, per request: for a list of payroll instructors -- deployment date from the Contribution data and
// "transfer date" = the date their Darwin exit request was raised ("Exit Date" on the exit record; for payroll people that record is
// the move to university payroll). Employee IDs come from the request (no names in this file); blank when there is no data.
// Prints one line of JSON per employee: id, found in FCC, deployment date, transfer date (latest exit record), its status and
// date of exit, and every exit record's raised date if there are several.
//   pnpm exec tsx src/lib/connectors/_tmp_deploy_transfer_dates.ts
import { db, instructorsTable, instructorContributionTable, darwinboxExitsTable } from "@workspace/db";

const IDS = ["NW2000396", "NW0004555", "NW0004155", "NW0004563", "NW2000516", "NW2000721", "NW2000444", "NW0005555", "NW2000555", "NW0004019",
  "NW0005158", "Aurora Ins", "NW2000385", "NW2000622", "NW2000319", "NW0004164", "NW0005556", "NW0005110", "NW0005550", "NW0007582",
  "NW2000532", "NW2000290", "NW2000557", "NW0003871", "NW0005557", "NW0004963", "NW2000344", "NW0004566", "NW2000327", "NW2000656",
  "NW0004077", "NW2000481", "NW2000538", "NW0004558", "NW2000409", "NW0004264", "NW2000362", "NW0004223", "NW2000352", "NW0004379",
  "NW2000478", "NW2000560", "NW0004042", "NW0005147", "NW2000304", "NW2000407", "NW0004701", "NW0004808", "NW2000471", "NW2000485",
  "NW0007870", "NW2000574", "NW2000452", "NW0004066", "NW0003994", "NW0004695", "NW0003833", "NW2000390", "NW2000438", "NW2000297",
  "NW2000587", "NW0004034", "NW0004704", "NW2000374", "NW0005219", "NW2000294", "NW2000301", "NW0005187"];
const key = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();
const iso = (s: string) => { const m = s.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""; };

async function main() {
  const people = await db.select().from(instructorsTable);
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [c.instructorUserId, c]));
  const exits = await db.select().from(darwinboxExitsTable);
  for (const id of IDS) {
    const p = people.find((x) => key(x.employeeId) === key(id));
    const c = p?.teachosUserId ? contrib.get(p.teachosUserId) : undefined;
    const recs = exits.filter((e) => key(e.employeeId ?? (e.rawData as Record<string, unknown>)?.["Employee Id"] as string) === key(id))
      .map((e) => { const r = e.rawData as Record<string, unknown>; return { raised: iso(String(r["Exit Date"] ?? r["Separation Requested On"] ?? "")), status: String(r["Status"] ?? ""), lwd: iso(String(r["Date Of Exit"] ?? "")) }; })
      .sort((a, b) => b.raised.localeCompare(a.raised));
    const latest = recs[0];
    console.log(JSON.stringify({ id, in_fcc: !!p, deployment_date: c?.deploymentDate ?? "", transfer_date: latest?.raised ?? "", exit_status: latest?.status ?? "",
      date_of_exit: latest?.lwd ?? "", exit_records: recs.length, all_raised: recs.length > 1 ? recs.map((r) => r.raised).join(" / ") : "" }));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
