// Forces recomputeStatuses() to re-run against everyone already in the
// database WITHOUT touching or re-uploading any real Darwin/TeachOS/
// Payroll data. Needed because classification/computed_status are stored
// columns, only recalculated when an upload comes through -- deploying new
// server code alone does not retroactively re-run the classification logic
// against rows that already exist.
//
// How: POST /api/uploads calls recomputeStatuses() whenever the request has
// at least one row, regardless of the `source` value -- if `source` isn't
// one of the recognized ones ("Darwin", "TeachOS", etc.) none of the actual
// reconcile functions run, so this is a pure no-op except for the recompute
// itself. It does leave one harmless entry in your Uploads history labeled
// "Recompute Trigger" so it's clear what it was.
//
// Usage:
//   node force_recompute.cjs <base-url>
// Example:
//   node force_recompute.cjs https://instructor-department-crm-instructorcentr.replit.app

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node force_recompute.cjs <base-url>");
  process.exit(1);
}

(async () => {
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "Recompute Trigger",
      filename: "recompute-trigger (no real data)",
      row_count: 1,
      rows: [{ note: "forces recomputeStatuses() only -- not a real data source" }],
    }),
  });
  const text = await res.text();
  console.log(`POST /api/uploads -> HTTP ${res.status}`);
  console.log(text);
  if (!res.ok) process.exit(1);
  console.log("\nDone -- recomputeStatuses() has re-run against the current code's classification logic. Re-run get_needs_review_full.cjs to confirm the needs_review count.");
})();
