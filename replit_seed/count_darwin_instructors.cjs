// Counts how many currently-stored instructor records came from Darwinbox's
// "Instructors" department (in_darwin=true — every such record was created
// by reconcileDarwin(), which only ever processes rows whose Darwin
// `department` string starts with "Instructors"). Breaks it down by
// in_teachos too, since "Darwin Instructors dept" and "also deployed in
// TeachOS" are different questions. Read-only.
//
// Usage:
//   node count_darwin_instructors.cjs https://instructor-department-crm-instructorcentr.replit.app

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node count_darwin_instructors.cjs <base-url>");
  process.exit(1);
}

(async () => {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/instructors?source=darwin`);
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const rows = await res.json();
  const both = rows.filter((r) => r.in_teachos).length;
  const darwinOnly = rows.filter((r) => !r.in_teachos).length;
  console.log(`Total records with in_darwin=true (Darwinbox "Instructors" dept): ${rows.length}`);
  console.log(`  also in TeachOS (deployed):        ${both}`);
  console.log(`  Darwin-only (not yet in TeachOS):  ${darwinOnly}`);

  const byBucket = {};
  for (const r of rows) {
    const key = r.dept_bucket ?? "(none)";
    byBucket[key] = (byBucket[key] ?? 0) + 1;
  }
  console.log("\nBy dept_bucket:");
  for (const [k, v] of Object.entries(byBucket).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
})();
