// One-off (2026-10-23): rebuilds the "Taught in class" data RIGHT NOW from this Replit workspace's code (the latest pulled version), the
// same way the Training Status sync does, and prints any error in full -- so we don't depend on the published app or its logs.
// WRITES the instructor_taught_course table (replaces it, exactly like Sync Now). Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_rebuild_taught.ts
import { db, uploadsTable } from "@workspace/db";
import { fetchTaughtCourseRows } from "./taughtTraining";
import { storeTaughtCourses } from "../storeRaw";

async function main() {
  const t0 = Date.now();
  const rows = await fetchTaughtCourseRows();
  console.log(`Fetched ${rows.length} instructor x course rows in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const byCourse = new Map<string, Set<number>>();
  for (const r of rows) { if (!byCourse.has(r.course_title)) byCourse.set(r.course_title, new Set()); byCourse.get(r.course_title)!.add(r.curriculum_sessions); }
  for (const [c, totals] of [...byCourse].sort()) console.log(`  ${c}: total ${[...totals].join(" / ")}${totals.size > 1 ? "   <-- DIFFERENT" : ""}`);
  const stored = await storeTaughtCourses(rows);
  await db.insert(uploadsTable).values({ source: "Instructor Taught Training", filename: "Manual rebuild (_tmp_rebuild_taught.ts): topics covered out of the course's learning-portal topics", rowCount: stored });
  console.log(`Stored ${stored} rows. Refresh Training -> Taught in class.`);
  process.exit(0);
}
main().catch((e) => { console.error("REBUILD FAILED:", e); process.exit(1); });
