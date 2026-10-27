// One-off, READ-ONLY (2026-10-27): what the Overview "Contribution of NIAT instructors & mentors" card WILL show after the next
// Contribution sync, worked out live from BigQuery with the current code (fetchContributionRows + the batch -> cohort map), without
// writing anything. Prints people per cohort, why the rest have no cohort (nothing in the last 60 days vs only unmapped batches),
// and every batch name still not mapped, with how many people it affects. No staff names printed.
//   pnpm exec tsx src/lib/connectors/_tmp_cohort_preview.ts
import { fetchContributionRows, cohortForBatch } from "./instructorContribution";

async function main() {
  const rows = await fetchContributionRows();
  const per = new Map<string, number>();
  let withCohort = 0, noBatches = 0, unmappedOnly = 0;
  const unmapped = new Map<string, number>();
  for (const r of rows) {
    if (r.niat_cohorts.length) { withCohort++; for (const c of r.niat_cohorts) per.set(c, (per.get(c) ?? 0) + 1); continue; }
    const batches = [...new Set([...r.recent_batches, ...r.all_batches])];
    if (!r.recent_batches.length) noBatches++; else unmappedOnly++;
    for (const b of r.recent_batches) if (!cohortForBatch(b)) unmapped.set(b, (unmapped.get(b) ?? 0) + 1);
    void batches;
  }
  console.log(`People in Contribution: ${rows.length}`);
  console.log(`  with a cohort: ${withCohort}  ->  ${[...per].sort().map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  console.log(`  no cohort, no completed session in the last 30 days (60-day / pending fallback found nothing mapped): ${noBatches}`);
  console.log(`  no cohort, taught recently but only batches not in the map: ${unmappedOnly}`);
  console.log(`\nBatch names taught in the last 30 days that still have no cohort (people):`);
  for (const [b, n] of [...unmapped].sort((a, b) => b[1] - a[1])) console.log(`  ${b} | ${n}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
