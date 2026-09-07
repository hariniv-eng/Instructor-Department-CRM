// Diagnoses the "only 2 payroll converted" mystery by querying the live
// /api/instructors search endpoint (read-only, GET) for each of the 26
// people who should have matched via the Payroll Candidates file, per a
// local simulation of reconcilePayrollCandidates()'s name-matching logic.
//
// Usage:
//   node diagnose_payroll.cjs https://instructor-department-crm-instructorcentr.replit.app

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node diagnose_payroll.cjs <base-url>");
  process.exit(1);
}

// The 26 full names from the local simulation, taken from the Payroll
// Candidates sheet, that should normalized-name-match a live TeachOS row.
const NAMES = [
  "J V Ayyappan",
  "Surakshit Nautiyal",
  "varshini",
  "Kathiravan N",
  "Samyukth Maheta B",
  "Anusha M",
  "Shylaja M",
  "Pratheek Pralhdachar",
  "Nikitha",
  "Annan sadr",
  "Sushant Bakshi",
  "M V S L SATVIK",
  "UPPARA NAVEEN",
  "Manjot Singh",
  "Safwan Molla",
  "Doddigarla Joel Prashanth",
  "Yugandhar Gurjalwar",
  "Jaka Prasanth",
  "Mallidi Sai Rahul",
  "Chinoori Shireesha",
  "Anusha Poturi",
  "Riddhim",
  "Satya Aparna",
  "Mortha Rajesh",
  "Ajay Kumar Maharana",
  "Shrinath Salunke",
];

async function checkOne(name) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/instructors?search=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`${name.padEnd(26)} HTTP ${res.status}`);
    return;
  }
  const rows = await res.json();
  if (!rows.length) {
    console.log(`${name.padEnd(26)} NOT FOUND in /api/instructors at all`);
    return;
  }
  for (const r of rows) {
    console.log(
      `${name.padEnd(26)} full_name="${r.full_name}" in_teachos=${r.in_teachos} employee_id=${r.employee_id} ` +
      `teachos_user_id=${r.teachos_user_id} classification=${r.classification} status=${r.computed_status} ` +
      `notes="${r.notes ?? ""}"`
    );
  }
}

(async () => {
  console.log(`Checking ${NAMES.length} names against ${baseUrl} ...\n`);
  for (const name of NAMES) {
    await checkOne(name);
  }
})();
