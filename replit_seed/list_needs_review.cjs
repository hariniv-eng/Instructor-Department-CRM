// Lists every instructor currently classified needs_review, for a manual
// look at what's driving that bucket. Read-only (GET only).
//
// Usage:
//   node list_needs_review.cjs https://instructor-department-crm-instructorcentr.replit.app

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node list_needs_review.cjs <base-url>");
  process.exit(1);
}

(async () => {
  const url = `${baseUrl.replace(/\/$/, "")}/api/instructors?status=needs_review`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const rows = await res.json();
  console.log(`${rows.length} instructor(s) with computed_status/manual_status = needs_review\n`);
  for (const r of rows) {
    console.log(
      `#${r.id} "${r.full_name}" | employee_id=${r.employee_id} | in_darwin=${r.in_darwin} in_teachos=${r.in_teachos} | ` +
      `dept="${r.department}" designation="${r.designation}" | dept_bucket=${r.dept_bucket} area=${r.dept_area} | ` +
      `darwin_status=${r.darwin_employee_status} | notes="${r.notes ?? ""}"`
    );
  }
})();
