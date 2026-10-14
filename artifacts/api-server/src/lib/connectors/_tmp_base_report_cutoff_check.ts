// One-off, READ-ONLY (2026-10-14): investigates why the base exit report stops at ~8 Oct while newer resignations exist in other
// Darwin reports. It (1) prints the raw response envelope (any fields besides the records), (2) shows base-report records per request
// date for the last 21 days, and (3) for every resignation raised since 25 Sep in the TA Employee Master, says whether the base report has
// that person -- grouped by request date. That shows whether the cut-off is a clean date or something else. Run from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_base_report_cutoff_check.ts
import { config } from "./config";
import { fetchRawReportResponse, fetchExitRecords, fetchEnrichmentRecords, employeeIdKey } from "./darwinboxExits";

const TA_MASTER = "1d513a4ccdf2e8";
function iso(v: unknown): string {
  const t = String(v ?? "").trim();
  let m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
}
const get = (r: Record<string, unknown>, ...names: string[]) => { const m = new Map(Object.keys(r).map((k) => [k.trim().toLowerCase(), r[k]])); for (const n of names) { const v = m.get(n.toLowerCase()); if (v !== undefined && v !== null && String(v).trim() !== "") return v; } return ""; };

async function main() {
  console.log(`Base report id: ${config.DBX_CHECK_REPORT_ID}`);
  const raw = (await fetchRawReportResponse(config.DBX_CHECK_REPORT_ID!)) as Record<string, unknown>;
  console.log("\n=== 1. Response envelope (everything except the big records array) ===");
  const brief = JSON.stringify(raw, (_k, v) => (Array.isArray(v) && v.length > 5 ? `[array of ${v.length}]` : v)).slice(0, 1500);
  console.log(brief);

  const base = await fetchExitRecords();
  console.log(`\n=== 2. Base report: ${base.length} records. Requests per date (last 21 days seen) ===`);
  const perDay = new Map<string, number>();
  for (const r of base) { const d = iso(get(r, "Separation Requested On")); if (d) perDay.set(d, (perDay.get(d) ?? 0) + 1); }
  [...perDay.entries()].sort().slice(-21).forEach(([d, n]) => console.log(`  ${d}  ${n}`));
  const maxReq = [...perDay.keys()].sort().pop();
  console.log(`  Latest "Separation Requested On": ${maxReq}`);

  console.log("\n=== 3. TA Employee Master resignations raised since 2026-09-25: is the person in the base report? ===");
  const baseIds = new Set(base.map((r) => employeeIdKey(r)).filter(Boolean) as string[]);
  const ta = await fetchEnrichmentRecords(TA_MASTER);
  const byDate = new Map<string, { inBase: number; notInBase: string[] }>();
  for (const r of ta) {
    const d = iso(get(r, "Separation Request Raised On", "Separation Transaction Date"));
    if (!d || d < "2026-09-25") continue;
    const id = employeeIdKey(r); if (!id) continue;
    const e = byDate.get(d) ?? { inBase: 0, notInBase: [] };
    if (baseIds.has(id)) e.inBase += 1; else e.notInBase.push(id.toUpperCase());
    byDate.set(d, e);
  }
  for (const [d, e] of [...byDate.entries()].sort()) console.log(`  ${d}: in base ${e.inBase}, NOT in base ${e.notInBase.length}${e.notInBase.length ? " (" + e.notInBase.slice(0, 6).join(", ") + (e.notInBase.length > 6 ? ", ..." : "") + ")" : ""}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
