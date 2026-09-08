// Dependency-free diagnostic (built-in fetch + no npm packages needed) --
// run this in your own PowerShell terminal (not through the device bridge,
// which has no network access) to see exactly where Manager (Darwin) /
// Capability Manager data is missing on the LIVE deployed app.
//
// Usage:
//   node check_manager_fields.cjs
//
// It hits the public /api/reports/instructors endpoint (no login needed --
// this is the same endpoint the Overview tab itself calls) and reports,
// across the whole live instructor population:
//   - how many people have a non-empty darwin_manager
//   - how many people have a non-empty capability_manager
//   - a few concrete examples of each so we can see the real values

const BASE_URL = "https://instructor-department-crm-instructorcentr.replit.app";

async function main() {
  const res = await fetch(`${BASE_URL}/api/reports/instructors`);
  if (!res.ok) {
    console.error(`Request failed: HTTP ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const people = data.instructors || [];
  console.log(`Total people in "instructors" list: ${people.length}`);

  const nonEmpty = (v) => v !== null && v !== undefined && String(v).trim() !== "";

  const withDarwinManager = people.filter((p) => nonEmpty(p.darwin_manager));
  const withCapabilityManager = people.filter((p) => nonEmpty(p.capability_manager));
  const withEitherFieldMissingFromResponse = people.filter((p) => !("darwin_manager" in p) || !("capability_manager" in p));

  console.log(`People with non-empty darwin_manager: ${withDarwinManager.length} / ${people.length}`);
  console.log(`People with non-empty capability_manager: ${withCapabilityManager.length} / ${people.length}`);
  console.log(`People whose response object is missing the darwin_manager/capability_manager keys entirely: ${withEitherFieldMissingFromResponse.length}`);

  console.log("\n--- Sample of 5 people (whatever the API returns first) ---");
  for (const p of people.slice(0, 5)) {
    console.log(JSON.stringify({
      full_name: p.full_name,
      employee_id: p.employee_id,
      manager: p.manager,
      capability_manager: p.capability_manager,
      darwin_manager: p.darwin_manager,
    }));
  }

  if (withDarwinManager.length > 0) {
    console.log("\n--- Example person WITH a darwin_manager value ---");
    const ex = withDarwinManager[0];
    console.log(JSON.stringify({ full_name: ex.full_name, employee_id: ex.employee_id, darwin_manager: ex.darwin_manager }));
  }
  if (withCapabilityManager.length > 0) {
    console.log("\n--- Example person WITH a capability_manager value ---");
    const ex = withCapabilityManager[0];
    console.log(JSON.stringify({ full_name: ex.full_name, employee_id: ex.employee_id, capability_manager: ex.capability_manager }));
  }
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
