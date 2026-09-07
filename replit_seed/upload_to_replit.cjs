// Seeds the new Replit deployment's database from the already-extracted
// data files, via POST /api/uploads. Run this from a terminal that has
// normal internet access (e.g. your local PowerShell) — Claude's own
// sandbox is blocked from reaching *.replit.app by the org network policy.
//
// Usage:
//   node upload_to_replit.cjs https://instructor-department-crm-instructorcentr.replit.app
//
// Only 3 uploads now (down from 4). After switching the "TeachOS" source
// from niat_instructor_managers_and_instructors_details to
// niat_instructor_details (commit "Switch live TeachOS sync to
// niat_instructor_details..."), 2_teachos.json already carries employee_id
// on every row — reconcileTeachos() reads it directly, so the separate
// "TeachOS ID Reference" upload (3_teachos_id_reference.json, same
// underlying table) is now redundant and has been dropped from this
// sequence. Payroll Candidates still runs last (it only annotates existing
// records, so Darwin + TeachOS must land first).

const fs = require("fs");
const path = require("path");

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node upload_to_replit.cjs <base-url>");
  console.error("Example: node upload_to_replit.cjs https://instructor-department-crm-instructorcentr.replit.app");
  process.exit(1);
}

const files = [
  "1_darwin.json",
  "2_teachos.json",
  "4_payroll.json",
];

async function uploadOne(filename) {
  const filePath = path.join(__dirname, filename);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log(`\n--> Uploading ${filename}  (source="${payload.source}", ${payload.row_count} rows)...`);
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`    FAILED (HTTP ${res.status}): ${text.slice(0, 500)}`);
    return false;
  }
  console.log(`    OK (HTTP ${res.status}): ${text.slice(0, 300)}`);
  return true;
}

async function checkDashboard() {
  console.log(`\n--> Checking ${baseUrl}/api/dashboard ...`);
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/dashboard`);
  const text = await res.text();
  console.log(`    HTTP ${res.status}`);
  console.log(text.slice(0, 1000));
}

async function resetInstructors() {
  console.log(`\n--> Resetting instructor data via ${baseUrl}/api/admin/reset-instructors ...`);
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/admin/reset-instructors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "RESET" }),
  });
  const text = await res.text();
  console.log(`    HTTP ${res.status}: ${text}`);
  if (!res.ok) {
    console.error("Reset failed — stopping before uploading onto unknown existing state.");
    process.exit(1);
  }
}

(async () => {
  await checkDashboard();
  await resetInstructors();
  for (const f of files) {
    const ok = await uploadOne(f);
    if (!ok) {
      console.error(`\nStopping — ${f} failed. Fix the issue above before continuing (re-running is safe, each upload replaces its source's data).`);
      process.exit(1);
    }
  }
  console.log("\nAll 3 uploads complete. Re-checking dashboard totals:");
  await checkDashboard();
})();
