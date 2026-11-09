// One-off, READ-ONLY (2026-11-09, per request: "NW2000452's Darwin details belong to someone else with the same name -- map by employee
// ID only"). Shows WHERE a person's employee ID on the FCC row comes from, and how many FCC rows hold an employee ID that TeachOS itself
// does not give them (= linked to Darwin by name in the past). Prints employee IDs and yes/no name checks only -- no names.
//   pnpm exec tsx src/lib/connectors/_tmp_id_link_check.ts NW2000452
import { BigQuery } from "@google-cloud/bigquery";
import { sql, eq } from "drizzle-orm";
import { db, instructorsTable, teachosIdReferenceTable, darwinboxActiveTable, darwinboxFullRosterTable } from "@workspace/db";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
const up = (v: unknown) => String(v ?? "").trim().toUpperCase();

async function main() {
  const emp = up(process.argv.slice(2).filter((a) => a !== "--")[0] ?? "");
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details"}\``;
  const [tos] = await bq.query({ query: `SELECT instructor_user_id AS uid, nw_instructor_id AS eid, instructor_name AS n, instructor_status AS st FROM ${T}` });
  const teachos = new Map((tos as Record<string, unknown>[]).map((r) => [plain(r.uid), { eid: up(plain(r.eid)), name: plain(r.n), status: plain(r.st) }]));
  const bridge = new Map((await db.select().from(teachosIdReferenceTable)).filter((b) => b.instructorUserId).map((b) => [b.instructorUserId!, up(b.employeeId)]));

  // 1. The person
  const [p] = await db.select().from(instructorsTable).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${emp}`);
  if (p) {
    const t = p.teachosUserId ? teachos.get(p.teachosUserId) : undefined;
    const darwin = [...await db.select().from(darwinboxActiveTable).where(sql`UPPER(TRIM(${darwinboxActiveTable.employeeId})) = ${emp}`),
                    ...await db.select().from(darwinboxFullRosterTable).where(sql`UPPER(TRIM(${darwinboxFullRosterTable.employeeId})) = ${emp}`)];
    console.log(`1. ${emp} (FCC row ${p.id})`);
    console.log(`   TeachOS account: ${p.teachosUserId ? "yes" : "no"} | TeachOS gives employee id: ${t ? (t.eid || "(none)") : "(not in TeachOS table)"} | TeachOS status ${t?.status ?? "-"} | ID reference file gives: ${p.teachosUserId ? bridge.get(p.teachosUserId) ?? "(none)" : "-"}`);
    for (const d of darwin) {
      const raw = d.rawData as Record<string, unknown>;
      console.log(`   Darwin employee ${emp}: same name as in TeachOS? ${t && norm(t.name) === norm(d.fullName) ? "yes" : "NO"} | same name as the FCC row? ${norm(p.fullName) === norm(d.fullName) ? "yes" : "NO"} | Department ${raw["Department"] ?? "-"} | Designation ${raw["Designation"] ?? "-"} | Status ${raw["Employee Status"] ?? "-"}`);
    }
    if (!darwin.length) console.log(`   No Darwin employee record with ${emp} (active / full roster).`);
    if (t) {
      const sameName = (await db.select({ e: darwinboxFullRosterTable.employeeId, n: darwinboxFullRosterTable.fullName }).from(darwinboxFullRosterTable)).filter((d) => norm(d.n) === norm(t.name));
      console.log(`   Darwin employees with exactly his TeachOS name: ${sameName.length}${sameName.length ? ` -> ${sameName.map((d) => d.e).join(", ")}` : ""}`);
    }
  } else console.log(`1. no FCC row with ${emp}`);

  // 2. Everyone: FCC rows whose employee id TeachOS does not back up
  const rows = await db.select().from(instructorsTable).where(eq(instructorsTable.inTeachos, true));
  const notBacked = rows.filter((r) => r.employeeId && r.teachosUserId).filter((r) => {
    const t = teachos.get(r.teachosUserId!);
    const own = t?.eid || bridge.get(r.teachosUserId!) || "";
    return own !== up(r.employeeId);
  });
  console.log(`\n2. FCC rows in TeachOS: ${rows.length}. Holding an employee id that TeachOS (and the ID reference file) does NOT give them: ${notBacked.length}`);
  for (const r of notBacked) {
    const t = teachos.get(r.teachosUserId!);
    console.log(`   ${r.employeeId} | TeachOS gives ${t?.eid || "(none)"} | reference ${bridge.get(r.teachosUserId!) ?? "(none)"} | in Darwin ${r.inDarwin}`);
  }
  console.log(`   FCC rows in TeachOS with NO employee id at all: ${rows.filter((r) => !r.employeeId).length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
