// Pulls the full Darwin exit dataset from /api/sync/darwinbox-exits/data --
// the raw, fully-replaced snapshot of the most recently uploaded/synced
// Darwinbox exit file (every column exactly as uploaded, inside rawData).
// This is the same table the new payroll cascade checks (via findExit())
// to classify someone as an "exit_candidate".
//
// Usage:
//   node get_darwin_exits.cjs <base-url> [output.json]
// Example:
//   node get_darwin_exits.cjs https://instructor-department-crm-instructorcentr.replit.app darwin_exits.json

const baseUrl = process.argv[2];
const outFile = process.argv[3] || "darwin_exits.json";
if (!baseUrl) {
  console.error("Usage: node get_darwin_exits.cjs <base-url> [output.json]");
  process.exit(1);
}

(async () => {
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/sync/darwinbox-exits/data`);
  console.log(`GET /api/sync/darwinbox-exits/data -> HTTP ${res.status}`);
  if (!res.ok) {
    console.error(await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const rows = data.rows ?? [];

  console.log(`\nTotal Darwin exit records: ${data.count ?? rows.length}\n`);

  // Show the raw column names present (from the first row) so it's clear
  // what fields are available inside each record's rawData.
  if (rows.length) {
    const sampleRaw = rows[0].rawData ?? {};
    console.log(`Raw columns present (from first record): ${Object.keys(sampleRaw).join(", ")}\n`);
  }

  for (const r of rows) {
    console.log(`- ${r.fullName ?? "(no name)"} | employee_id: ${r.employeeId ?? "—"} | synced_at: ${r.syncedAt ?? "—"}`);
  }

  require("fs").writeFileSync(outFile, JSON.stringify(data, null, 2));
  console.log(`\nWrote full data (${rows.length} records) to ${outFile}`);
})();
