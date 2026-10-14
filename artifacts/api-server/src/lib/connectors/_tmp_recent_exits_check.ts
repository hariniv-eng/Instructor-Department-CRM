// One-off, READ-ONLY (2026-10-14): checks the RECENT resignations (raised after the base exit report's last date). It lists everyone
// in the "Offboarding tracking" report who is not in the base exit report, and shows -- per person -- whether the other reports
// carry the request date / employment status the fallback needs, i.e. whether the sync would add them or skip them and why.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_recent_exits_check.ts
import { fetchExitRecords, fetchEnrichmentRecords, employeeIdKey, parseEnrichReportIds } from "./darwinboxExits";

const NAMES: Record<string, string> = { "70c916bd0ed8bb": "EIF Main", "1d513a4ccdf2e8": "TA Employee Master", "9feb118d44726a": "Offboarding tracking", "853905cf311922": "L&D Details" };
const OFFBOARDING = "9feb118d44726a";
const get = (rec: Record<string, unknown>, ...names: string[]) => {
  const m = new Map(Object.keys(rec).map((k) => [k.trim().toLowerCase(), rec[k]]));
  for (const n of names) { const v = m.get(n.toLowerCase()); if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim(); }
  return "";
};

async function main() {
  const base = await fetchExitRecords();
  const baseIds = new Set(base.map((r) => employeeIdKey(r)).filter(Boolean) as string[]);
  const dates = base.map((r) => get(r, "Date Of Resignation", "Separation Requested On")).filter(Boolean);
  console.log(`Base exit report: ${base.length} records, ${baseIds.size} people. Last request dates (as text): ${dates.slice(-5).join(" | ")}`);

  const reports = new Map<string, Map<string, Record<string, unknown>[]>>();
  for (const id of parseEnrichReportIds()) {
    try {
      const recs = await fetchEnrichmentRecords(id);
      const byId = new Map<string, Record<string, unknown>[]>();
      for (const r of recs) { const k = employeeIdKey(r); if (!k) continue; (byId.get(k) ?? byId.set(k, []).get(k)!).push(r); }
      reports.set(id, byId);
      console.log(`${NAMES[id] ?? id}: ${recs.length} records, ${byId.size} people`);
    } catch (e) { console.log(`${NAMES[id] ?? id}: FAILED ${(e as Error).message.slice(0, 200)}`); }
  }
  const off = reports.get(OFFBOARDING);
  if (!off) { console.log("Offboarding tracking report could not be read."); process.exit(0); }
  const missing = [...off.keys()].filter((k) => !baseIds.has(k));
  console.log(`\nPeople in Offboarding tracking but NOT in the base exit report: ${missing.length}\n`);
  let wouldAdd = 0;
  for (const id of missing) {
    const recs = [...reports.values()].flatMap((m) => m.get(id) ?? []);
    const first = off.get(id)![0];
    const name = get(first, "Employee Name", "Full Name", "Name");
    const reqDate = recs.map((r) => get(r, "Date Of Resignation", "Separation Request Raised On")).find(Boolean) ?? "";
    const employment = recs.map((r) => get(r, "Employment Status")).find(Boolean) ?? "";
    const exitDate = recs.map((r) => get(r, "Date Of Exit")).find(Boolean) ?? "";
    const where = [...reports.entries()].filter(([, m]) => m.has(id)).map(([rid]) => NAMES[rid] ?? rid).join(", ");
    const inactive = employment.toLowerCase() === "inactive";
    const ok = !!reqDate && (!inactive || !!exitDate);
    if (ok) wouldAdd++;
    console.log(`${id.toUpperCase()} | ${name} | request date ${reqDate || "-"} | employment ${employment || "-"} | date of exit ${exitDate || "-"} | in: ${where} | ${ok ? "WOULD BE ADDED" : "SKIPPED (" + (!reqDate ? "no request date" : "inactive with no exit date") + ")"}`);
  }
  console.log(`\nWould be added by the sync: ${wouldAdd} of ${missing.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
