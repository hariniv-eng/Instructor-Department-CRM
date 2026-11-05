// One-off, READ-ONLY (2026-11-05, per request: "are the 'Aurora Ins' record and the no-employee-ID Takshasila record in our manual
// sheet?"). Prints FCC's records whose employee ID is missing or not in NW format (e.g. "Aurora Ins") and who are in TeachOS: name,
// stored employee ID, TeachOS id, campus, org email, Darwin match -- so they can be found in the manual sheet by name. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_broken_id_records.ts
import { db, instructorsTable } from "@workspace/db";

async function main() {
  const rows = (await db.select().from(instructorsTable)).filter((r) => r.inTeachos && !/^NW\d{7}$/i.test((r.employeeId ?? "").trim()));
  console.log(`TeachOS-active records with a missing / non-NW employee ID: ${rows.length}`);
  for (const r of rows) console.log(`  ${r.fullName} | employee ID "${r.employeeId ?? ""}" | TeachOS ${r.teachosUserId} | campus ${(r.institutes ?? []).join(" + ") || "-"} | email ${r.orgEmail ?? "-"} | in Darwin ${r.inDarwin} | class ${r.classification ?? "-"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
