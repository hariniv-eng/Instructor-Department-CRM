// One-off cleanup: clears the fuzzy-match "Possible match" note on two
// records confirmed to be false positives (different real people, not
// duplicates): "Nikitha" (employee_id NW0004558, wrongly flagged against
// "Ninitha H") and "Manjot Singh" (employee_id NW0004963, wrongly flagged
// against "Manish Singh"). Does not touch classification, employee_id, or
// any other field — only clears the `notes` column via PATCH /instructors/:id.
//
// Usage:
//   node clear_false_positive_notes.cjs https://instructor-department-crm-instructorcentr.replit.app

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node clear_false_positive_notes.cjs <base-url>");
  process.exit(1);
}

const TARGETS = [
  { employeeId: "NW0004558", expectedName: "Nikitha" },
  { employeeId: "NW0004963", expectedName: "Manjot Singh" },
];

async function clearOne({ employeeId, expectedName }) {
  const searchUrl = `${baseUrl.replace(/\/$/, "")}/api/instructors?search=${encodeURIComponent(expectedName)}`;
  const res = await fetch(searchUrl);
  const rows = await res.json();
  const row = rows.find((r) => r.employee_id === employeeId);
  if (!row) {
    console.log(`${expectedName.padEnd(16)} NOT FOUND (employee_id ${employeeId}) — skipping`);
    return;
  }
  console.log(`${expectedName.padEnd(16)} found id=${row.id} current notes="${row.notes ?? ""}"`);
  const patchRes = await fetch(`${baseUrl.replace(/\/$/, "")}/api/instructors/${row.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: null }),
  });
  const text = await patchRes.text();
  console.log(`    PATCH HTTP ${patchRes.status}: ${text.slice(0, 300)}`);
}

(async () => {
  for (const t of TARGETS) {
    await clearOne(t);
  }
})();
