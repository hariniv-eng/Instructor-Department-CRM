// One-off, READ-ONLY (2026-11-24, per request: "everyone in the Darwin full roster whose manager is a given person").
// Looks through every field of every Darwin full-roster record whose name contains "manager" (direct manager, reporting manager, ...)
// for the given employee ID or name, and lists the matches with their Darwin details and what FCC has for them (subject, team,
// Capability Manager). Names are printed in the terminal only.
//   pnpm exec tsx src/lib/connectors/_tmp_manager_team.ts NW0000000 ["Manager Name"]
import { db, darwinboxFullRosterTable, instructorsTable } from "@workspace/db";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { productOf } from "../product";

const s = (v: unknown) => (v == null ? "" : String(v).trim());
const pick = (raw: Record<string, unknown>, ...keys: string[]) => {
  const lower = new Map(Object.keys(raw).map((k) => [k.toLowerCase(), raw[k]]));
  for (const k of keys) { const v = lower.get(k.toLowerCase()); if (s(v)) return s(v); }
  return "-";
};

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const id = (args.find((a) => /^NW\d+$/i.test(a)) ?? "").toUpperCase();
  if (!id) { console.log('usage: _tmp_manager_team.ts NW0000000 ["Manager Name"]'); process.exit(1); }
  const name = (args.find((a) => !/^NW\d+$/i.test(a)) ?? "\u0000").toLowerCase();
  const roster = await db.select().from(darwinboxFullRosterTable);
  const fcc = new Map((await db.select().from(instructorsTable)).filter((p) => p.employeeId).map((p) => [p.employeeId!.toUpperCase(), p]));
  const managerKeys = new Set<string>();
  const hits: { r: (typeof roster)[number]; via: string }[] = [];
  for (const r of roster) {
    const raw = r.rawData ?? {};
    const via: string[] = [];
    for (const [k, v] of Object.entries(raw)) {
      if (!/manager/i.test(k)) continue;
      managerKeys.add(k);
      const val = s(v).toLowerCase();
      if (val && (val.includes(id.toLowerCase()) || val.includes(name))) via.push(k);
    }
    if (via.length) hits.push({ r, via: via.join(", ") });
  }
  console.log(`Darwin full roster: ${roster.length} records | manager fields seen: ${[...managerKeys].join(", ") || "none"}`);
  console.log(`Records whose manager field contains ${id} or "${name}": ${hits.length}\n`);
  console.log("employee_id|name|designation|department|employee_status|date_of_joining|work_location|matched_field|in_FCC|FCC_subject|FCC_team|FCC_product|FCC_capability_manager");
  for (const { r, via } of hits.sort((a, b) => s(a.r.fullName).localeCompare(s(b.r.fullName)))) {
    const raw = r.rawData ?? {};
    const emp = s(r.employeeId).toUpperCase();
    const p = fcc.get(emp);
    console.log([emp || "-", s(r.fullName) || pick(raw, "full_name", "employee_name"), pick(raw, "designation", "designation_name"), pick(raw, "department", "dept"),
      pick(raw, "employee_status", "status", "employment_status"), pick(raw, "date_of_joining", "doj"), pick(raw, "work_location", "location"), via,
      p ? "yes" : "no", p ? normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) ?? "-" : "-", p?.classification ?? "-", p ? productOf(p) : "-",
      p ? p.teachosManager || p.manualCapabilityManager || "-" : "-"].join("|"));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
