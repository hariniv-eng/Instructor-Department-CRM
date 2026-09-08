// Dependency-free (built-in fetch only) -- run in your own PowerShell
// terminal, from anywhere:
//
//   node check_bucket_membership.cjs
//
// Checks which Overview drill-down bucket (darwin_only / both /
// teachos_only) each of the 10 employee IDs below currently falls into on
// the LIVE deployed app, and shows their teachos_user_id / employee_id from
// the flat instructors list so we can see whether TeachOS reconciliation
// actually matched them.

const BASE_URL = "https://instructor-department-crm-instructorcentr.replit.app";

const EMPLOYEE_IDS = [
  "NW0007534", "NW0007535", "NW0007613", "NW0007464", "NW0007637",
  "NW0007404", "NW0007533", "NW0007636", "NW0007611", "NW0007610",
];

async function main() {
  const res = await fetch(`${BASE_URL}/api/reports/instructors`);
  if (!res.ok) {
    console.error(`Request failed: HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const data = await res.json();

  const people = data.instructors || [];
  const byEmployeeId = new Map(people.map((p) => [p.employee_id, p]));

  const buckets = data.access_breakdown?.instructors || {};
  const bucketOf = new Map();
  for (const bucketName of ["darwin_only", "both", "teachos_only"]) {
    const list = buckets[bucketName]?.people || [];
    for (const p of list) bucketOf.set(p.employee_id, bucketName);
  }

  console.log(`Total in flat "instructors" list: ${people.length}`);
  console.log(`access_breakdown.instructors counts: darwin_only=${buckets.darwin_only?.count}, both=${buckets.both?.count}, teachos_only=${buckets.teachos_only?.count}`);
  console.log("");

  for (const id of EMPLOYEE_IDS) {
    const p = byEmployeeId.get(id);
    const bucket = bucketOf.get(id) ?? "NOT FOUND in any access_breakdown.instructors bucket";
    if (!p) {
      console.log(`${id}: NOT FOUND in the flat instructors list at all. Bucket: ${bucket}`);
      continue;
    }
    console.log(`${id} (${p.full_name}): bucket=${bucket} | employee_id=${p.employee_id} | teachos_user_id=${p.teachos_user_id} | capability_manager=${p.capability_manager} | darwin_manager=${p.darwin_manager}`);
  }
}

main().catch((e) => {
  console.error("Script crashed:", e);
  process.exit(1);
});
