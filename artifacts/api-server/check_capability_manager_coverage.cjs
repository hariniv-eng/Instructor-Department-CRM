// Dependency-free (built-in fetch only) -- run in your own PowerShell
// terminal (local or Replit's Shell, doesn't matter -- this only needs
// internet access to the live app, no database/BigQuery credentials):
//
//   node check_capability_manager_coverage.cjs
//
// Checks Capability Manager coverage across EVERY instructor and mentor in
// the live app (not just the 15 we've been tracking), using the public
// /api/reports/instructors endpoint.

const BASE_URL = "https://instructor-department-crm-instructorcentr.replit.app";

// The known-valid roster of Capability Manager names, as given directly.
// Anyone whose capability_manager value doesn't (case-insensitively) match
// one of these is either a genuine typo/variant in the BigQuery source data,
// or points at someone missing from this roster -- worth a manual look
// either way, not necessarily a bug in the app's matching logic itself.
const VALID_MANAGER_NAMES = [
  "Akhilendar Reddy",
  "Boddikurapati Yaswanth",
  "Dharavath Jayanth",
  "Garlapati Prudhvi Raj",
  "Hari Krishna Daggubati",
  "Karthik Katuri",
  "Katuri Karthik",
  "Meka Sri Satya Prudhvi Charan",
  "Nunna Naga Venkata Dasaradhi",
  "Penumarthi Satya Syamala",
  "Pradeep Jat",
  "Preethi Vangaveti",
  "Riya Rai",
  "Shaik Mohammed Pasha",
  "Sigatapu Sai Sankar",
  "solasa vinay",
  "Voppangi Sai Prasanna",
];
const VALID_MANAGER_SET = new Set(VALID_MANAGER_NAMES.map((n) => n.toLowerCase().trim()));

async function main() {
  const res = await fetch(`${BASE_URL}/api/reports/instructors`);
  if (!res.ok) {
    console.error(`Request failed: HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const data = await res.json();

  // "instructors" (the flat list) carries capability_manager; "mentors"
  // (id/full_name/employee_id/designation only) does not, so we only score
  // coverage over the flat instructors list -- the same population the
  // Overview drill-down's Instructors card and its Capability Manager
  // column are built from.
  const people = data.instructors || [];
  const inTeachos = people.filter((p) => p.teachos_user_id);
  const withCapabilityManager = inTeachos.filter((p) => p.capability_manager);
  const withoutCapabilityManager = inTeachos.filter((p) => !p.capability_manager);

  console.log(`Total in flat "instructors" list: ${people.length}`);
  console.log(`Of those, have a teachos_user_id (in_teachos=true): ${inTeachos.length}`);
  console.log(`  -> WITH a capability_manager value: ${withCapabilityManager.length}`);
  console.log(`  -> WITHOUT a capability_manager value (still blank): ${withoutCapabilityManager.length}`);
  console.log("");

  if (withoutCapabilityManager.length) {
    console.log("Sample of people still missing capability_manager (up to 20):");
    for (const p of withoutCapabilityManager.slice(0, 20)) {
      console.log(`  ${p.employee_id} | ${p.full_name} | teachos_user_id=${p.teachos_user_id}`);
    }
    if (withoutCapabilityManager.length > 20) console.log(`  ... and ${withoutCapabilityManager.length - 20} more`);
  } else {
    console.log("Everyone with in_teachos=true has a capability_manager value. Fully covered.");
  }

  // Cross-check against the known-valid roster of manager names.
  console.log("");
  console.log("=== Cross-check against the given list of valid Capability Manager names ===");
  const invalid = withCapabilityManager.filter((p) => !VALID_MANAGER_SET.has(String(p.capability_manager).toLowerCase().trim()));
  const valid = withCapabilityManager.filter((p) => VALID_MANAGER_SET.has(String(p.capability_manager).toLowerCase().trim()));
  console.log(`Of the ${withCapabilityManager.length} people with a capability_manager value:`);
  console.log(`  -> ${valid.length} match a name on the given list`);
  console.log(`  -> ${invalid.length} do NOT match any name on the given list`);
  if (invalid.length) {
    const byValue = {};
    for (const p of invalid) {
      const key = p.capability_manager;
      (byValue[key] ||= []).push(p);
    }
    console.log("\nUnrecognized capability_manager values (and how many people have each):");
    for (const [value, list] of Object.entries(byValue).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  "${value}" -- ${list.length} people, e.g. ${list.slice(0, 3).map((p) => `${p.full_name} (${p.employee_id})`).join(", ")}`);
    }
  }
}

main().catch((e) => {
  console.error("Script crashed:", e);
  process.exit(1);
});
