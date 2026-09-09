// Dependency-free (built-in fetch only) -- run in your own PowerShell
// terminal, from anywhere:
//
//   node verify_15_after_sync.cjs
//
// Checks all 15 previously-flagged employee IDs against the LIVE deployed
// app right now: which access_breakdown bucket each falls into
// (darwin_only / both / teachos_only), their live teachos_user_id (where
// exposed), and their capability_manager / darwin_manager fields. Compares
// the live teachos_user_id against the value we already confirmed from
// niat_instructor_details, so a mismatch (rather than just "missing")
// stands out clearly too.
//
// Note: one of the 15 (NW0007610) is a Mentor, not an Instructor -- the
// API's flat "mentors" list carries only id/full_name/employee_id/
// designation (no teachos_user_id/capability_manager/darwin_manager), so
// for that one person we can only confirm via which access_breakdown
// bucket they fall into, not the live teachos_user_id itself.

const BASE_URL = "https://instructor-department-crm-instructorcentr.replit.app";

// employee_id -> the instructor_user_id we confirmed via niat_instructor_details today
const EXPECTED = {
  "NW0007639": "38d165130aa7478c82d81ee88b469a6d", // Ayaan Khan
  "NW0007638": "058132a7447a4cad8ab90b0f42a09b5c", // Sreeram Reddy Gongal
  "NW0007537": "23f533660d0c477f92cd955a1223f406", // Vinoth K
  "NW0007577": "d55a07f3a10141229bf31a28879ed342", // Vijay Kumar Mokka
  "NW0007509": "1551d4d0218c44f28d7de31cb4c3b66a", // Malla Venkatesh Malla
  "NW0007534": "0ca00b0118dc40eb8009d74a31b52fe2", // Akash Kumar Karn
  "NW0007535": "951d1f34f9f74c3895a4f349076f91bc", // Ashutosh Rana
  "NW0007613": "8bcc3557bfab49769e98ac7cec74dbd0", // Gaurav Kumar
  "NW0007464": "7db2d10db4bd41f093b8121e4a71feab", // Akarsh Jain
  "NW0007637": "b263ac6a92894363bcac215729607778", // Shubham Sharma
  "NW0007404": "f691bba1f0d24fcc89c14fb0a57c05c4", // Mohammad Kaif Nazir
  "NW0007533": "d89971b1842b434aad11984f0b747807", // Jasvinder Chaudhary
  "NW0007636": "2ac61e8fe15243beaff8989aae6a8706", // Nitesh Kumar Kumawat
  "NW0007611": "236933573fc14647ae5ed56643074a04", // Mettu Sai Sanuth Reddy
  "NW0007610": "f793c0884888440d80cf9183ec4db8a6", // Ailla.Rohith Goud (Mentor)
};

async function main() {
  const res = await fetch(`${BASE_URL}/api/reports/instructors`);
  if (!res.ok) {
    console.error(`Request failed: HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const data = await res.json();

  // Merge the flat "instructors" list (full detail) with the flat
  // "mentors" list (id/full_name/employee_id/designation only) so NW0007610
  // (a Mentor) is still found -- just with fewer fields available.
  const people = [...(data.instructors || []), ...(data.mentors || [])];
  const byEmployeeId = new Map(people.map((p) => [p.employee_id, p]));

  const buckets = { ...(data.access_breakdown?.instructors || {}), ...(data.access_breakdown?.mentors || {}) };
  const bucketOf = new Map();
  for (const section of ["instructors", "mentors"]) {
    const secBuckets = data.access_breakdown?.[section] || {};
    for (const bucketName of ["darwin_only", "both", "teachos_only"]) {
      const list = secBuckets[bucketName]?.people || [];
      for (const p of list) bucketOf.set(p.employee_id, bucketName);
    }
  }

  let resolvedCount = 0;
  let staleCount = 0;

  console.log("employee_id | full_name | bucket | live_teachos_user_id | matches_expected | capability_manager | darwin_manager");
  console.log("-".repeat(120));

  for (const [id, expectedTeachosId] of Object.entries(EXPECTED)) {
    const p = byEmployeeId.get(id);
    const bucket = bucketOf.get(id) ?? "not in any bucket";
    if (!p) {
      console.log(`${id} | NOT FOUND in flat instructors/mentors list | ${bucket} | - | - | - | -`);
      staleCount++;
      continue;
    }
    const hasTeachosField = Object.prototype.hasOwnProperty.call(p, "teachos_user_id");
    if (!hasTeachosField) {
      // Mentor row (NW0007610) -- API doesn't expose teachos_user_id here,
      // so go by bucket alone: "both" means the sync matched them.
      const ok = bucket === "both";
      if (ok) resolvedCount++; else staleCount++;
      console.log(`${id} | ${p.full_name} | ${bucket} | (not exposed for mentors) | ${ok ? "YES (via bucket)" : "NO"} | n/a | n/a`);
      continue;
    }
    const liveId = p.teachos_user_id || "(empty)";
    const matches = p.teachos_user_id === expectedTeachosId;
    if (matches) resolvedCount++; else staleCount++;
    console.log(`${id} | ${p.full_name} | ${bucket} | ${liveId} | ${matches ? "YES" : "NO"} | ${p.capability_manager || "(empty)"} | ${p.darwin_manager || "(empty)"}`);
  }

  console.log("");
  console.log(`Resolved (live teachos_user_id matches today's BigQuery data): ${resolvedCount} / ${Object.keys(EXPECTED).length}`);
  console.log(`Still stale (sync hasn't picked it up yet, or something else is off): ${staleCount} / ${Object.keys(EXPECTED).length}`);
}

main().catch((e) => {
  console.error("Script crashed:", e);
  process.exit(1);
});
