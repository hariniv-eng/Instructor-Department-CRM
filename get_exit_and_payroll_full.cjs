// Pulls the "Exit candidates" + "Payroll converted" buckets together from
// the TeachOS Breakdown tab (GET /api/reports/teachos-breakdown), tags each
// person with which bucket they landed in, and joins in every raw TeachOS
// column for each person (from GET /api/sync/teachos/data, the raw
// fully-replaced snapshot of the latest TeachOS upload/sync) -- same
// enrichment technique as get_needs_review_full.cjs.
//
// These two buckets together are the "TeachOS-only leftover" people who
// were NOT found anywhere else in Darwin (full-roster) and are NOT IIT
// Kharagpur institute, split into: matched a Darwin exit record
// (exit_candidates) vs. the exhaustive remainder (payroll_converted).
//
// Usage:
//   node get_exit_and_payroll_full.cjs <base-url> [output.json]
// Example:
//   node get_exit_and_payroll_full.cjs https://instructor-department-crm-instructorcentr.replit.app exit_and_payroll_full.json

const baseUrl = process.argv[2];
const outFile = process.argv[3] || "exit_and_payroll_full.json";
if (!baseUrl) {
  console.error("Usage: node get_exit_and_payroll_full.cjs <base-url> [output.json]");
  process.exit(1);
}

const normalize = (s) => (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

(async () => {
  const root = baseUrl.replace(/\/$/, "");

  const [breakdownRes, rawRes] = await Promise.all([
    fetch(`${root}/api/reports/teachos-breakdown`),
    fetch(`${root}/api/sync/teachos/data`),
  ]);
  if (!breakdownRes.ok) { console.error(`GET /api/reports/teachos-breakdown -> HTTP ${breakdownRes.status}`); process.exit(1); }
  if (!rawRes.ok) { console.error(`GET /api/sync/teachos/data -> HTTP ${rawRes.status}`); process.exit(1); }

  const breakdown = await breakdownRes.json();
  const rawPayload = await rawRes.json();
  const rawRows = rawPayload.rows ?? [];

  const rawByUserId = new Map();
  const rawByName = new Map();
  for (const r of rawRows) {
    if (r.instructorUserId) rawByUserId.set(r.instructorUserId, r.rawData);
    if (r.instructorName) rawByName.set(normalize(r.instructorName), r.rawData);
  }

  const exitPeople = breakdown.not_mapped?.exit_candidates?.people ?? [];
  const payrollPeople = breakdown.not_mapped?.payroll_converted?.people ?? [];

  if (breakdown.not_mapped?.exit_candidates === undefined || breakdown.not_mapped?.payroll_converted === undefined) {
    console.error("exit_candidates or payroll_converted missing from the response -- is the deployed app on the latest code?");
    process.exit(1);
  }

  const tag = (people, bucket) => people.map((p) => ({ ...p, bucket }));
  const combined = [...tag(exitPeople, "exit_candidate"), ...tag(payrollPeople, "payroll_converted")].map((person) => {
    const raw = (person.teachos_user_id && rawByUserId.get(person.teachos_user_id))
      ?? rawByName.get(normalize(person.full_name))
      ?? null;
    return { ...person, teachos_raw_columns: raw };
  });

  console.log(`exit_candidates count: ${exitPeople.length}`);
  console.log(`payroll_converted count: ${payrollPeople.length}`);
  console.log(`combined total: ${combined.length}\n`);

  for (const p of combined) {
    console.log(`--- [${p.bucket}] ${p.full_name} (id ${p.id}) ---`);
    console.log(`  employee_id: ${p.employee_id ?? "—"}`);
    console.log(`  teachos_user_id: ${p.teachos_user_id ?? "—"}`);
    console.log(`  institutes: ${(p.institutes ?? []).join(", ") || "—"}`);
    console.log("");
  }

  require("fs").writeFileSync(outFile, JSON.stringify(combined, null, 2));
  console.log(`Wrote full combined data (${combined.length} people) to ${outFile}`);
})();
