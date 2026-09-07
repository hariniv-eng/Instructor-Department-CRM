// Pulls the "needs_review" people (status=needs_review) and attaches every
// original TeachOS column for each one, not just the fields the app's
// instructorsTable normalizes -- joins /api/instructors?status=needs_review
// (for id/employee_id/teachos_user_id/etc.) against /api/sync/teachos/data
// (the raw, fully-replaced snapshot of the most recent TeachOS
// upload/sync -- every column exactly as uploaded: institute_name,
// institute_type, instructor_category, instructor_role, instructor_status,
// nw_instructor_id, instructor_name, instructor_user_id, ...), matched by
// instructor_user_id (falling back to normalized full name if that's
// missing on either side).
//
// After the 2026-09-03 payroll-cascade change this bucket should normally
// be empty (0) -- the cascade is exhaustive for anyone who never matched
// Darwin at all. A non-zero result here is worth a manual look.
//
// Usage:
//   node get_needs_review_full.cjs <base-url> [output.json]
// Example:
//   node get_needs_review_full.cjs https://instructor-department-crm-instructorcentr.replit.app needs_review_full.json

const baseUrl = process.argv[2];
const outFile = process.argv[3];
if (!baseUrl) {
  console.error("Usage: node get_needs_review_full.cjs <base-url> [output.json]");
  process.exit(1);
}

const normalize = (s) => (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

(async () => {
  const root = baseUrl.replace(/\/$/, "");

  const [instructorsRes, rawRes] = await Promise.all([
    fetch(`${root}/api/instructors?status=needs_review`),
    fetch(`${root}/api/sync/teachos/data`),
  ]);
  if (!instructorsRes.ok) { console.error(`GET /api/instructors?status=needs_review -> HTTP ${instructorsRes.status}`); process.exit(1); }
  if (!rawRes.ok) { console.error(`GET /api/sync/teachos/data -> HTTP ${rawRes.status}`); process.exit(1); }

  const needsReview = await instructorsRes.json();
  const rawPayload = await rawRes.json();
  const rawRows = rawPayload.rows ?? [];

  const rawByUserId = new Map();
  const rawByName = new Map();
  for (const r of rawRows) {
    if (r.instructorUserId) rawByUserId.set(r.instructorUserId, r.rawData);
    if (r.instructorName) rawByName.set(normalize(r.instructorName), r.rawData);
  }

  const combined = needsReview.map((person) => {
    const raw = (person.teachos_user_id && rawByUserId.get(person.teachos_user_id))
      ?? rawByName.get(normalize(person.full_name))
      ?? null;
    return { ...person, teachos_raw_columns: raw };
  });

  console.log(`needs_review count: ${combined.length}\n`);
  for (const p of combined) {
    console.log(`--- ${p.full_name} (id ${p.id}) ---`);
    console.log(`  employee_id: ${p.employee_id ?? "-"}`);
    console.log(`  teachos_user_id: ${p.teachos_user_id ?? "-"}`);
    console.log(`  raw TeachOS columns:`, p.teachos_raw_columns ?? "(no raw row matched -- may have dropped out of the most recent TeachOS sync)");
    console.log("");
  }

  if (outFile) {
    require("fs").writeFileSync(outFile, JSON.stringify(combined, null, 2));
    console.log(`Wrote full combined data to ${outFile}`);
  }
})();
