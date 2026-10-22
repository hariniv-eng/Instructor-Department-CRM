// One-off, READ-ONLY (2026-10-22, per request): checks the two TeachOS-access lists in Overview > Admin actions against TeachOS itself
// (BigQuery niat_instructor_details, ALL statuses -- the sync only reads ACTIVE rows):
//   A) "Remove TeachOS access" (marked Exited/Absconded and still counted as in TeachOS): what TeachOS really has for them now --
//      every account under their TeachOS user id AND their employee id, with status. If none is ACTIVE any more, they are listed only
//      because our data is stale (last TeachOS sync before the removal).
//   B) "Give TeachOS access" (Darwin only, no TeachOS match): looks for a TeachOS account by employee id (ignoring case/spaces) and by
//      name. A hit means the access exists but our match missed it (blank / wrong employee id in TeachOS, or the account is INACTIVE).
//   C) TeachOS-wide data problems: ACTIVE accounts with no / malformed employee id, one employee id on several ACTIVE accounts, and
//      one person (user id) with several employee ids.
// Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_teachos_access_audit.ts
import { BigQuery } from "@google-cloud/bigquery";
import { desc, eq } from "drizzle-orm";
import { db, instructorsTable, uploadsTable } from "@workspace/db";
import { config } from "./config";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { productOf } from "../product";

const T = process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details";
const emp = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "");
const nm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const [tRows] = await bq.query({ query: `SELECT DISTINCT instructor_user_id, nw_instructor_id, instructor_name, instructor_status, institute_name, instructor_role FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${T}\`` });
  type TR = { instructor_user_id: string; nw_instructor_id: string | null; instructor_name: string; instructor_status: string; institute_name: string | null; instructor_role: string | null };
  const teachos = tRows as TR[];
  const byUid = new Map<string, TR[]>(), byEmp = new Map<string, TR[]>(), byName = new Map<string, TR[]>();
  for (const r of teachos) {
    for (const [m, k] of [[byUid, r.instructor_user_id], [byEmp, emp(r.nw_instructor_id)], [byName, nm(r.instructor_name)]] as const) {
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
  }
  const lastSync = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "TeachOS")).orderBy(desc(uploadsTable.uploadedAt)).limit(1);
  console.log(`TeachOS rows (all statuses): ${teachos.length} | last TeachOS sync stored: ${lastSync[0]?.uploadedAt?.toISOString() ?? "never"}\n`);
  const fmt = (rs: TR[]) => [...new Map(rs.map((r) => [`${r.instructor_user_id}|${r.instructor_status}`, r])).values()]
    .map((r) => `${r.instructor_user_id.slice(0, 8)}… ${r.instructor_status}${r.nw_instructor_id ? ` (${r.nw_instructor_id})` : " (no emp id)"}${r.institute_name ? ` @ ${r.institute_name}` : ""}`).join("; ") || "none";

  const people = await db.select().from(instructorsTable);
  const { exceptionRemoveRows, countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(people);

  // A) Remove access
  console.log(`=== A) Remove TeachOS access list: ${exceptionRemoveRows.length}`);
  let staleA = 0;
  for (const p of [...exceptionRemoveRows].sort((a, b) => a.fullName.localeCompare(b.fullName))) {
    const rows = [...(p.teachosUserId ? byUid.get(p.teachosUserId) ?? [] : []), ...(p.employeeId ? byEmp.get(emp(p.employeeId)) ?? [] : [])];
    const active = rows.some((r) => String(r.instructor_status).toUpperCase() === "ACTIVE");
    if (!active) staleA++;
    console.log(`  ${active ? "STILL ACTIVE  " : "NOT ACTIVE NOW"} | ${p.fullName} | ${p.employeeId ?? "-"} | marked ${p.exitVerification} | TeachOS: ${fmt(rows)}`);
  }
  console.log(`  -> ${staleA} of ${exceptionRemoveRows.length} no longer have an ACTIVE TeachOS account (listed only because our data is stale)\n`);

  // B) Give access
  const seen = new Set<number>();
  const give = [...countedInstructorRows, ...mentors].filter((p) => {
    if (seen.has(p.id) || !p.inDarwin || p.inTeachos) return false;
    seen.add(p.id);
    if (["Support", "IIT X DSA"].includes(productOf(p))) return false;
    const st = (p.exitFlagStatus ?? "").toLowerCase();
    if (p.exitFlag && (st === "approved" || st.startsWith("pending"))) return false;
    return p.exitVerification !== "exited" && p.exitVerification !== "absconded";
  });
  console.log(`=== B) Give TeachOS access list: ${give.length}`);
  const tally: Record<string, number> = {};
  for (const p of give.sort((a, b) => a.fullName.localeCompare(b.fullName))) {
    const byId = p.employeeId ? byEmp.get(emp(p.employeeId)) ?? [] : [];
    const byN = byName.get(nm(p.fullName)) ?? [];
    const activeId = byId.filter((r) => String(r.instructor_status).toUpperCase() === "ACTIVE");
    const activeName = byN.filter((r) => String(r.instructor_status).toUpperCase() === "ACTIVE");
    const verdict = activeId.length ? "HAS ACTIVE ACCOUNT (same emp id) - our match missed it"
      : activeName.length ? "HAS ACTIVE ACCOUNT (same name, emp id blank/different in TeachOS)"
      : byId.length || byN.length ? "account exists but INACTIVE - needs reactivation"
      : "no TeachOS account - genuinely needs access";
    tally[verdict] = (tally[verdict] ?? 0) + 1;
    console.log(`  ${verdict} | ${p.fullName} | ${p.employeeId ?? "-"} | TeachOS by emp id: ${fmt(byId)} | by name: ${fmt(byN.filter((r) => !byId.includes(r)))}`);
  }
  console.log("  Summary:"); for (const [k, n] of Object.entries(tally)) console.log(`    ${k}: ${n}`);

  // C) TeachOS-wide data problems (ACTIVE accounts only)
  const act = teachos.filter((r) => String(r.instructor_status).toUpperCase() === "ACTIVE");
  const actUids = new Map<string, TR[]>(); for (const r of act) { if (!actUids.has(r.instructor_user_id)) actUids.set(r.instructor_user_id, []); actUids.get(r.instructor_user_id)!.push(r); }
  const noEmp = [...actUids.values()].filter((rs) => rs.every((r) => !r.nw_instructor_id));
  const badEmp = [...actUids.values()].filter((rs) => rs.some((r) => r.nw_instructor_id && !/^NW\d{7}$/.test(emp(r.nw_instructor_id))));
  const empToUids = new Map<string, Set<string>>(); for (const r of act) if (r.nw_instructor_id) { const k = emp(r.nw_instructor_id); if (!empToUids.has(k)) empToUids.set(k, new Set()); empToUids.get(k)!.add(r.instructor_user_id); }
  const sharedEmp = [...empToUids].filter(([, s]) => s.size > 1);
  const multiEmp = [...actUids].filter(([, rs]) => new Set(rs.map((r) => emp(r.nw_instructor_id)).filter(Boolean)).size > 1);
  console.log(`\n=== C) TeachOS data problems (ACTIVE accounts: ${actUids.size})`);
  console.log(`  No employee id: ${noEmp.length}`); for (const rs of noEmp.slice(0, 40)) console.log(`    ${rs[0].instructor_name} | ${rs[0].instructor_user_id} | ${rs[0].instructor_role ?? "-"} | ${rs[0].institute_name ?? "-"}`);
  console.log(`  Employee id not in NW0000000 format: ${badEmp.length}`); for (const rs of badEmp.slice(0, 40)) console.log(`    ${rs[0].instructor_name} | "${rs.map((r) => r.nw_instructor_id).filter(Boolean).join('", "')}"`);
  console.log(`  One employee id on several ACTIVE accounts: ${sharedEmp.length}`); for (const [k, s] of sharedEmp.slice(0, 40)) console.log(`    ${k}: ${[...s].map((u) => `${byUid.get(u)?.[0]?.instructor_name ?? "?"} (${u.slice(0, 8)}…)`).join(", ")}`);
  console.log(`  One account with several employee ids: ${multiEmp.length}`); for (const [u, rs] of multiEmp.slice(0, 40)) console.log(`    ${rs[0].instructor_name} (${u.slice(0, 8)}…): ${[...new Set(rs.map((r) => r.nw_instructor_id))].join(", ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
