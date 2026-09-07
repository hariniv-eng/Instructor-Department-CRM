// Cross-references the current "Exit candidates" bucket (from the TeachOS
// Breakdown tab, i.e. GET /api/reports/teachos-breakdown ->
// not_mapped.exit_candidates) against the OLD frozen payroll-reference list
// (the 30 people previously confirmed via uploaded payroll files, before
// PAYROLL_CONVERTED_EMPLOYEES was retired on 2026-09-03 in favor of the new
// exit/IIT-Kharagpur cascade). This is a one-off audit: "of the current exit
// candidates, how many were also flagged as payroll-converted under the old
// mechanism?"
//
// Matching: employeeId first (exact), falling back to normalized full name.
//
// Usage:
//   node check_exit_vs_payroll.cjs <base-url>

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node check_exit_vs_payroll.cjs <base-url>");
  process.exit(1);
}

// The last known-good frozen payroll-reference list (30 entries), pulled
// from git history (commit 08b6af0^, artifacts/api-server/src/data/classificationOverrides.ts)
// before it was removed in favor of the new cascade.
const OLD_PAYROLL_LIST = [
  { employeeId: "NW0004555", fullName: "Ajay Kumar Maharana" },
  { employeeId: "NW0004155", fullName: "Annan sadr" },
  { employeeId: "NW0004563", fullName: "Anusha Poturi" },
  { employeeId: "NW0005555", fullName: "Chinoori Shireesha" },
  { employeeId: "NW0005158", fullName: "Doddigarla Joel Prashanth" },
  { employeeId: "NWXXX0002", fullName: "Dr Dr Gopinath" },
  { employeeId: "NWXXX0001", fullName: "Dr K Naresh" },
  { employeeId: "NW0004164", fullName: "J V Ayyappan" },
  { employeeId: "NW0005556", fullName: "Jaka Prasanth" },
  { employeeId: "NW0005110", fullName: "Kathiravan N" },
  { employeeId: "NW0003871", fullName: "M V S L SATVIK" },
  { employeeId: "NW0005557", fullName: "Mallidi Sai Rahul" },
  { employeeId: "NW0004963", fullName: "Manjot Singh" },
  { employeeId: "NW0004566", fullName: "Mortha Rajesh" },
  { employeeId: "NW0004558", fullName: "Nikitha" },
  { employeeId: "NW0004379", fullName: "Pratheek Pralhdachar" },
  { employeeId: "NW0004821", fullName: "Riddhim" },
  { employeeId: "NW0004701", fullName: "Safwan Molla" },
  { employeeId: "NW0004808", fullName: "Samyukth Maheta B" },
  { employeeId: "NW0004066", fullName: "Satya Aparna" },
  { employeeId: "NW0003994", fullName: "Shylaja M" },
  { employeeId: "NW0003926", fullName: "Suhas Kambham" },
  { employeeId: "NW0004695", fullName: "Surakshit Nautiyal" },
  { employeeId: "NW2000461", fullName: "Sushant Bakshi" },
  { employeeId: "NW0004376", fullName: "varshini" },
  { employeeId: "NW0004548", fullName: "Anusha M" },
  { employeeId: "NW0006431", fullName: "Shrinath Salunke" },
  { employeeId: "NW0004034", fullName: "UPPARA NAVEEN" },
  { employeeId: "NW0004704", fullName: "Uthara S" },
  { employeeId: "NW0005187", fullName: "Yugandhar Gurjalwar" },
];

const normalize = (s) => (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

(async () => {
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/reports/teachos-breakdown`);
  console.log(`GET /api/reports/teachos-breakdown -> HTTP ${res.status}`);
  if (!res.ok) { console.error(await res.text()); process.exit(1); }
  const data = await res.json();

  const bucket = data.not_mapped?.exit_candidates;
  if (!bucket) {
    console.error("not_mapped.exit_candidates is missing from the response — is the deployed app on the latest code?");
    process.exit(1);
  }

  const people = bucket.people ?? [];
  console.log(`\nCurrent exit_candidates count: ${bucket.count ?? people.length}\n`);

  const byEmpId = new Map(OLD_PAYROLL_LIST.map((e) => [e.employeeId, e]));
  const byName = new Map(OLD_PAYROLL_LIST.map((e) => [normalize(e.fullName), e]));

  let overlapCount = 0;
  const overlapping = [];
  const notOverlapping = [];

  for (const p of people) {
    const empMatch = p.employee_id && byEmpId.get(p.employee_id);
    const nameMatch = !empMatch && byName.get(normalize(p.full_name));
    const match = empMatch || nameMatch;
    if (match) {
      overlapCount += 1;
      overlapping.push({ name: p.full_name, employee_id: p.employee_id ?? "—", matched_via: empMatch ? "employee_id" : "name" });
    } else {
      notOverlapping.push({ name: p.full_name, employee_id: p.employee_id ?? "—" });
    }
  }

  console.log(`Out of ${people.length} current exit candidates, ${overlapCount} were also in the old payroll-reference list (30 entries):\n`);
  for (const o of overlapping) {
    console.log(`  MATCH  - ${o.name} (${o.employee_id}) [matched via ${o.matched_via}]`);
  }

  console.log(`\nThe remaining ${notOverlapping.length} exit candidates were NOT in the old payroll list:\n`);
  for (const n of notOverlapping) {
    console.log(`  -      ${n.name} (${n.employee_id})`);
  }
})();
