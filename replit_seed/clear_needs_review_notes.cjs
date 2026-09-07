// Clears the stale fuzzy-match "Possible match" notes on the 6 needs_review
// records confirmed to be different people (not duplicates, don't merge —
// each stays its own separate record, which it already is; this just
// removes the now-incorrect advisory text left over from before the
// fuzzy-matching note generator was removed):
//   Gorre Pavan Kumar   (NW2000591) <- was flagged against Yadala Pavan Kumar
//   Meetali Sharma      (NW2000344) <- was flagged against Devnath Sharma
//   Puli Yash Vardhan   (NW2000478) <- was flagged against Chitti Harsh Vardhan
//   Sandeep Patro       (NW2000471) <- was flagged against Sandeep Darla
//   Vinay Dua           (NW0006994) <- was flagged against Vinay R A
//   Y Jaswanth Kumar    (no employee_id, matched by exact name) <- was flagged against Yedla Santosh Kumar
//
// Usage:
//   node clear_needs_review_notes.cjs https://instructor-department-crm-instructorcentr.replit.app

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node clear_needs_review_notes.cjs <base-url>");
  process.exit(1);
}

const TARGETS = [
  { employeeId: "NW2000591", expectedName: "Gorre Pavan Kumar" },
  { employeeId: "NW2000344", expectedName: "Meetali Sharma" },
  { employeeId: "NW2000478", expectedName: "Puli Yash Vardhan" },
  { employeeId: "NW2000471", expectedName: "Sandeep Patro" },
  { employeeId: "NW0006994", expectedName: "Vinay Dua" },
  { employeeId: null, expectedName: "Y Jaswanth Kumar" },
];

async function clearOne({ employeeId, expectedName }) {
  const searchUrl = `${baseUrl.replace(/\/$/, "")}/api/instructors?search=${encodeURIComponent(expectedName)}`;
  const res = await fetch(searchUrl);
  const rows = await res.json();
  const row = employeeId
    ? rows.find((r) => r.employee_id === employeeId)
    : rows.find((r) => r.full_name === expectedName && !r.employee_id);
  if (!row) {
    console.log(`${expectedName.padEnd(20)} NOT FOUND (employee_id ${employeeId ?? "null"}) — skipping`);
    return;
  }
  console.log(`${expectedName.padEnd(20)} found id=${row.id} current notes="${row.notes ?? ""}"`);
  const patchRes = await fetch(`${baseUrl.replace(/\/$/, "")}/api/instructors/${row.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: null }),
  });
  const text = await patchRes.text();
  console.log(`    PATCH HTTP ${patchRes.status}: ${text.slice(0, 200)}`);
}

(async () => {
  for (const t of TARGETS) {
    await clearOne(t);
  }
})();
