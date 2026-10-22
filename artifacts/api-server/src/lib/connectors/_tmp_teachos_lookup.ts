// One-off, READ-ONLY (2026-10-22): LIVE TeachOS lookup for one or more employee ids -- every account in niat_instructor_details
// (all statuses) under that employee id or that person's TeachOS user id, plus what the app currently has stored for them and when
// the last TeachOS sync ran. Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_teachos_lookup.ts NW2000736
//   pnpm exec tsx src/lib/connectors/_tmp_teachos_lookup.ts NW2000736 NW0007464
import { BigQuery } from "@google-cloud/bigquery";
import { desc, eq, inArray } from "drizzle-orm";
import { db, instructorsTable, uploadsTable } from "@workspace/db";
import { config } from "./config";

const T = process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details";

async function main() {
  const emps = process.argv.slice(2).filter((a) => a !== "--").map((a) => a.trim().toUpperCase()).filter(Boolean);
  if (!emps.length) { console.log("Give one or more employee ids"); process.exit(1); }
  const people = await db.select().from(instructorsTable).where(inArray(instructorsTable.employeeId, emps));
  const [last] = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "TeachOS")).orderBy(desc(uploadsTable.uploadedAt)).limit(1);
  console.log(`Now: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST | last TeachOS sync in the app: ${last ? last.uploadedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "never"}\n`);
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const uids = people.map((p) => p.teachosUserId).filter((x): x is string => !!x);
  const [rows] = await bq.query({
    query: `SELECT DISTINCT instructor_user_id, nw_instructor_id, instructor_name, instructor_status, instructor_role, institute_name
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${T}\`
            WHERE UPPER(REPLACE(nw_instructor_id, ' ', '')) IN UNNEST(@emps) OR instructor_user_id IN UNNEST(@uids)`,
    params: { emps, uids: uids.length ? uids : [""] },
  });
  for (const e of emps) {
    const p = people.find((x) => x.employeeId === e);
    console.log(`=== ${e} ${p ? `(${p.fullName})` : "(not in the app)"}`);
    if (p) console.log(`  App now: in TeachOS = ${p.inTeachos ? "yes" : "no"} | TeachOS user id ${p.teachosUserId ?? "-"} | campus ${(p.institutes ?? []).join(", ") || "-"} | marked ${p.exitVerification ?? "-"}`);
    const mine = (rows as Record<string, string>[]).filter((r) => (r.nw_instructor_id ?? "").toUpperCase().replace(/\s+/g, "") === e || (p?.teachosUserId && r.instructor_user_id === p.teachosUserId));
    if (!mine.length) console.log("  TeachOS (live): NO account found");
    for (const r of mine) console.log(`  TeachOS (live): ${r.instructor_user_id} | ${r.instructor_status} | ${r.instructor_role ?? "-"} | ${r.institute_name ?? "-"} | emp id ${r.nw_instructor_id ?? "-"} | ${r.instructor_name}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
