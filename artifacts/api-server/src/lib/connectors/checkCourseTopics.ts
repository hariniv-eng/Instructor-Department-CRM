// One-off CLI (2026-09-24, per request) to dump every distinct topic_title
// under one specific course_title, in curriculum order, with row counts —
// see listTopicsForCourse() in instructorLearningStatus.ts. Built after
// check:dsa-track-topics turned up only partial/generic matches for
// Ankush's real DSA/DIA/IPS session names: this shows the actual wording
// recorded in BigQuery for a candidate course so it can be compared by eye.
//
// Run (quote the course title if it has spaces/colons):
//   pnpm --filter @workspace/api-server run check:course-topics -- "DSA Foundation"
//   pnpm --filter @workspace/api-server run check:course-topics -- "Phase 1 : Data Structures and Algorithms"

import path from "node:path";
import { fileURLToPath } from "node:url";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
}

// Same "--" quirk as checkDsaTrackTopics.ts / checkInstructorLearningColumn.ts
// -- this pnpm/shell combination forwards a literal "--" into argv.
const args = process.argv.slice(2).filter((a) => a !== "--");
const courseTitle = args.join(" "); // in case an unquoted title got split into multiple argv entries

if (!courseTitle) {
  console.error('Usage: pnpm --filter @workspace/api-server run check:course-topics -- "<course_title>"');
  process.exit(1);
}

import("./instructorLearningStatus")
  .then(async (m) => {
    await m.listTopicsForCourse(courseTitle);
  })
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
