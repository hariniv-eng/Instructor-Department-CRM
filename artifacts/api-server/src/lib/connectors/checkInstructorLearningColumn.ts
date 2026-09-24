// One-off CLI to see what a column in one of the two "instructor learning
// status" BigQuery tables actually contains — distinct values and how many
// rows carry each. Purpose-built to map this data's real course_title /
// completion_status / examattempt_evaluation_result values against the
// fixed course-taxonomy reference sheet (Static Web, Responsive Design,
// React JS, ... grouped under Frontend Development / Backend Development /
// DSA / Gen AI / DSML) before building any per-course status aggregation.
//
// Run:
//   pnpm --filter @workspace/api-server run check:instructor-learning-column -- unit-completion course_title
//   pnpm --filter @workspace/api-server run check:instructor-learning-column -- unit-completion completion_status
//   pnpm --filter @workspace/api-server run check:instructor-learning-column -- practice-exam examattempt_evaluation_result

import path from "node:path";
import { fileURLToPath } from "node:url";

// Same reasoning as inspect.ts/export.ts/checkColumnValues.ts: load .env by
// an explicit path, and only import the connector module (dynamically)
// afterward — config.ts builds its config object at module-evaluation time.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
}

// Filters out a literal "--" separator: some pnpm/shell combinations (seen
// on Replit via PowerShell-invoked pnpm --filter ... run ... -- <args>)
// don't strip it before forwarding, leaving process.argv[2] as "--" itself
// rather than the intended first real argument. Safe either way this is
// invoked.
const args = process.argv.slice(2).filter((a) => a !== "--");
const tableArg = args[0];
const column = args[1];

if (!tableArg || !column) {
  console.error(
    "Usage: pnpm --filter @workspace/api-server run check:instructor-learning-column -- <unit-completion|practice-exam> <column_name>"
  );
  process.exit(1);
}

import("./instructorLearningStatus")
  .then(async (m) => {
    const tableName =
      tableArg === "unit-completion"
        ? m.UNIT_COMPLETION_TABLE
        : tableArg === "practice-exam"
          ? m.PRACTICE_EXAM_TABLE
          : null;
    if (!tableName) {
      console.error(`Unknown table "${tableArg}". Use "unit-completion" or "practice-exam".`);
      process.exit(1);
    }
    await m.checkDistinctValues(tableName, column);
  })
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
