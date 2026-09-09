// Dependency-free (built-in fetch only) -- run in your own PowerShell
// terminal, from anywhere:
//
//   node check_dr_names.cjs
//
// Checks the two flagged TeachOS-only instructors (Dr K Naresh, Dr Dr
// Gopinath -- confirmed ACTIVE in niat_instructor_details today, with
// employee_id null in that raw BigQuery data, and instructor_user_id
// 7c2f88ca7a8e42b394f8e7701a004439 / 938aa84f051648b8b759b7ab4e4bcaf0
// respectively) against the LIVE deployed app right now, the same way
// verify_15_after_sync.cjs checked the earlier batch of 15. Reports
// whether each one shows up anywhere at all in /api/reports/instructors
// (the flat instructors/mentors lists, the no_employee_id/other_department
// set-aside lists, or any access_breakdown bucket), and if so, what their
// live record looks like -- so we can tell "silently dropped during
// reconcile" apart from "present but classified somewhere unexpected."

const BASE_URL = "https://instructor-department-crm-instructorcentr.replit.app";

const TARGETS = [
  { label: "Dr K Naresh", teachosUserId: "7c2f88ca7a8e42b394f8e7701a004439" },
  { label: "Dr Dr Gopinath", teachosUserId: "938aa84f051648b8b759b7ab4e4bcaf0" },
];

function collectAllPeople(data) {
  // Every place a person object could show up in this endpoint's response.
  const buckets = [];
  const push = (label, list) => { if (Array.isArray(list)) buckets.push([label, list]); };

  push("instructors (flat)", data.instructors);
  push("mentors (flat)", data.mentors);
  push("iit_kharagpur_team (flat)", data.iit_kharagpur_team);
  push("no_employee_id (flat)", data.no_employee_id);
  push("other_department (flat)", data.other_department);

  for (const campus of data.campuses || []) push(`campuses["${campus.campus}"]`, campus.instructors);
  for (const mgr of data.managers || []) push(`managers["${mgr.manager}"]`, mgr.instructors);

  for (const section of ["department", "instructors", "mentors", "ops_team"]) {
    const split = data.access_breakdown?.[section];
    if (!split) continue;
    for (const bucketName of ["darwin_only", "both", "teachos_only"]) {
      push(`access_breakdown.${section}.${bucketName}`, split[bucketName]?.people);
    }
  }
  return buckets;
}

function nameMatches(person, label) {
  const full = (person.full_name || "").toLowerCase();
  return full.includes(label.toLowerCase()) || label.toLowerCase().includes(full);
}

async function main() {
  const res = await fetch(`${BASE_URL}/api/reports/instructors`);
  if (!res.ok) {
    console.error(`Request failed: HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const data = await res.json();
  const allBuckets = collectAllPeople(data);

  console.log(`Fetched live /api/reports/instructors -- total_instructor_count=${data.kpis?.total_instructor_count}, payroll_count=${data.kpis?.payroll_count}\n`);

  for (const target of TARGETS) {
    console.log(`--- ${target.label} (expected teachos_user_id: ${target.teachosUserId}) ---`);
    let found = false;
    for (const [bucketLabel, list] of allBuckets) {
      for (const person of list) {
        const idMatch = person.teachos_user_id && person.teachos_user_id === target.teachosUserId;
        if (idMatch || nameMatches(person, target.label)) {
          found = true;
          console.log(`  FOUND in ${bucketLabel}:`);
          console.log(`    ${JSON.stringify(person)}`);
        }
      }
    }
    if (!found) console.log("  NOT FOUND anywhere in this response -- consistent with the sync silently dropping/never creating this row.");
    console.log("");
  }
}

main().catch((e) => {
  console.error("Script crashed:", e);
  process.exit(1);
});
