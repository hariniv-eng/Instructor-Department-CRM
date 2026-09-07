// Triggers the Darwinbox Reports-API exit sync directly: POST /sync/darwinbox-exits.
// This pulls exit records live from Darwinbox (via the DBX_CHECK_* credentials
// configured as secrets on the deployment), replaces the darwinbox_exits table
// with the fresh data, and re-runs recomputeStatuses() so the exit_candidate
// cascade picks it up immediately.
//
// Usage:
//   node trigger_darwinbox_exits_sync.cjs <base-url>
// Example:
//   node trigger_darwinbox_exits_sync.cjs https://instructor-department-crm-instructorcentr.replit.app

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node trigger_darwinbox_exits_sync.cjs <base-url>");
  process.exit(1);
}

(async () => {
  const root = baseUrl.replace(/\/$/, "");
  console.log("POST /api/sync/darwinbox-exits ...");
  const res = await fetch(`${root}/api/sync/darwinbox-exits`, { method: "POST" });
  console.log(`-> HTTP ${res.status}`);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text);
  }

  if (!res.ok) {
    console.log("\nSync failed — most likely the DBX_CHECK_* Darwinbox Reports API credentials aren't set (or aren't valid) as secrets on the deployment. Check the error message above for specifics.");
    process.exit(1);
  }

  console.log("\nSync succeeded. Now checking how many exit records landed...");
  const dataRes = await fetch(`${root}/api/sync/darwinbox-exits/data`);
  const data = await dataRes.json();
  console.log(`Total Darwin exit records now: ${data.count ?? (data.rows ?? []).length}`);
})();
