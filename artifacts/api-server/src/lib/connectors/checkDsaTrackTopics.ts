// One-off CLI (2026-09-24, per request) to resolve the three still-pending
// DSA-track taxonomy columns (dsa, dia, ips — see trainingCourseTaxonomy.ts)
// by looking up which real course_title(s) actually contain the Session
// Name values Ankush provided for each (see dsaTrackSessionNames.ts). See
// findCoursesForTopics() in instructorLearningStatus.ts for the query.
//
// Run:
//   pnpm --filter @workspace/api-server run check:dsa-track-topics -- dsa
//   pnpm --filter @workspace/api-server run check:dsa-track-topics -- dia
//   pnpm --filter @workspace/api-server run check:dsa-track-topics -- ips

import path from "node:path";
import { fileURLToPath } from "node:url";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
}

const key = process.argv[2];

if (!key || !["dsa", "dia", "ips"].includes(key)) {
  console.error("Usage: pnpm --filter @workspace/api-server run check:dsa-track-topics -- <dsa|dia|ips>");
  process.exit(1);
}

Promise.all([import("./instructorLearningStatus"), import("../../data/dsaTrackSessionNames")])
  .then(async ([status, data]) => {
    const topics = data.DSA_TRACK_SESSION_NAMES[key as "dsa" | "dia" | "ips"];
    await status.findCoursesForTopics(topics);
  })
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
