// Dumps the full /api/reports/teachos-breakdown response (all buckets,
// counts only -- not the full people arrays) so we can see exactly what
// shape the live API is currently returning. Used to tell apart a backend
// issue (the endpoint itself doesn't have the new exit_candidates/
// iit_kharagpur fields) from a frontend issue (the API is fine, but the
// dashboard's UI code hasn't been rebuilt/redeployed with the new tab
// layout, or the browser is showing a cached version).
//
// Usage:
//   node check_breakdown_shape.cjs <base-url>

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node check_breakdown_shape.cjs <base-url>");
  process.exit(1);
}

(async () => {
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/reports/teachos-breakdown`);
  console.log(`GET /api/reports/teachos-breakdown -> HTTP ${res.status}`);
  if (!res.ok) { console.log(await res.text()); process.exit(1); }
  const data = await res.json();

  console.log(`\ntotal_active: ${data.total_active}`);
  console.log(`matched_with_darwin.count: ${data.matched_with_darwin?.count}`);
  console.log(`not_mapped.total: ${data.not_mapped?.total}`);
  console.log(`not_mapped.other_department.count: ${data.not_mapped?.other_department?.count}`);
  console.log(`not_mapped.exit_candidates: ${data.not_mapped?.exit_candidates === undefined ? "MISSING FROM RESPONSE" : data.not_mapped.exit_candidates.count}`);
  console.log(`not_mapped.iit_kharagpur: ${data.not_mapped?.iit_kharagpur === undefined ? "MISSING FROM RESPONSE" : data.not_mapped.iit_kharagpur.count}`);
  console.log(`not_mapped.payroll_converted.count: ${data.not_mapped?.payroll_converted?.count}`);
  console.log(`not_mapped.excluded.count: ${data.not_mapped?.excluded?.count}`);
  console.log(`not_mapped.needs_review.count: ${data.not_mapped?.needs_review?.count}`);

  console.log("\n--- full raw JSON (people arrays omitted) ---");
  const shallow = JSON.parse(JSON.stringify(data));
  for (const key of Object.keys(shallow.not_mapped || {})) {
    if (shallow.not_mapped[key]?.people) shallow.not_mapped[key].people = `[${shallow.not_mapped[key].people.length} people]`;
  }
  if (shallow.matched_with_darwin?.people) shallow.matched_with_darwin.people = `[${shallow.matched_with_darwin.people.length} people]`;
  console.log(JSON.stringify(shallow, null, 2));
})();
