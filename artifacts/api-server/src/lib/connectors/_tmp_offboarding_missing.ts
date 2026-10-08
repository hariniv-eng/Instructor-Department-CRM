// One-off (2026-10-08): who has a resignation in Darwin's Offboarding tracking
// / TA Employee Master reports but is MISSING from the base exit report (so our
// exit sync never creates a record for them)? Read-only; changes nothing.
// Run from artifacts/api-server:
//   pnpm exec tsx --env-file=.env src/lib/connectors/_tmp_offboarding_missing.ts > offboarding_missing.txt
import { db, instructorsTable } from "@workspace/db";
import { fetchExitRecords, fetchEnrichmentRecords, employeeIdKey } from "./darwinboxExits";

const OFFBOARDING = "9feb118d44726a";
const TA_MASTER = "1d513a4ccdf2e8";

type Rec = Record<string, unknown>;
const get = (r: Rec, ...names: string[]): string => {
  const lower = new Map(Object.keys(r).map((k) => [k.trim().toLowerCase(), r[k]]));
  for (const n of names) {
    const v = lower.get(n.toLowerCase());
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

async function main() {
  const base = await fetchExitRecords();
  const baseIds = new Set(base.map((r) => employeeIdKey(r)).filter((x): x is string => !!x));
  const baseNewest = base.map((r) => get(r, "Date Of Resignation", "Separation Requested On", "Exit Date")).filter(Boolean);
  console.log(`Base exit report: ${base.length} records, ${baseIds.size} distinct employees.\n`);

  const live = await db.select().from(instructorsTable);
  const liveById = new Map(live.filter((l) => l.employeeId).map((l) => [l.employeeId!.toLowerCase(), l]));

  const offb = await fetchEnrichmentRecords(OFFBOARDING);
  const ta = await fetchEnrichmentRecords(TA_MASTER);
  const taById = new Map<string, Rec>();
  for (const r of ta) { const k = employeeIdKey(r); if (k && !taById.has(k)) taById.set(k, r); }
  console.log(`Offboarding tracking: ${offb.length} records. TA Employee Master: ${ta.length} records${ta.length === 10000 ? "  <-- exactly 10,000: looks like a row cap, some people may be cut off" : ""}.\n`);

  const describe = (key: string, r: Rec, fromTa?: Rec) => {
    const t = fromTa ?? taById.get(key);
    const l = liveById.get(key);
    return [
      key.toUpperCase(),
      get(r, "Full Name", "Employee Name"),
      get(r, "Current Designation", "Designation"),
      get(r, "Current Department", "Department"),
      `resignation=${t ? get(t, "Date Of Resignation") || "-" : "-"}`,
      `raised=${t ? get(t, "Separation Request Raised On") || "-" : "-"}`,
      `lwdNotice=${t ? get(t, "Lwd As Per Notice Period") || "-" : "-"}`,
      `dateOfExit=${t ? get(t, "Date Of Exit") || "-" : "-"}`,
      `empStatus=${t ? get(t, "Employment Status") || "-" : "-"}`,
      l ? `OURS(inDarwin=${l.inDarwin}, inTeachos=${l.inTeachos}, dept=${l.department ?? "-"})` : "not in our instructors table",
    ].join(" | ");
  };

  const missingOffb: string[] = [];
  const seen = new Set<string>();
  for (const r of offb) {
    const k = employeeIdKey(r);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (!baseIds.has(k)) missingOffb.push(describe(k, r));
  }
  const ours = (s: string) => s.includes("OURS(");
  console.log(`=== A) In Offboarding tracking but NOT in the base exit report: ${missingOffb.length} (${missingOffb.filter(ours).length} are in our instructors table)`);
  for (const line of missingOffb.sort((a, b) => Number(ours(b)) - Number(ours(a)))) console.log(line);

  const missingTa: string[] = [];
  for (const [k, r] of taById) {
    if (baseIds.has(k) || seen.has(k)) continue;
    const resigned = get(r, "Date Of Resignation", "Separation Request Raised On");
    if (resigned) missingTa.push(describe(k, r, r));
  }
  console.log(`\n=== B) In TA Employee Master with a resignation date, NOT in the base report, and not already listed above: ${missingTa.length} (${missingTa.filter(ours).length} are in our instructors table)`);
  for (const line of missingTa.sort((a, b) => Number(ours(b)) - Number(ours(a)))) console.log(line);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
