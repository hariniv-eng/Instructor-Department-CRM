// One-off, READ-ONLY (2026-10-23, per request: "still the same issue" -- different totals for the same course in Taught in class).
// Shows what is ACTUALLY stored now: when the taught data was last rebuilt, and per course the smallest and largest total stored for
// any instructor (they must be equal with the topic-based count). If they differ, the stored rows are from an older version of the sync
// (the new code is not live yet, or the taught step failed -- the server log says "[taught-training] sync failed"). Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_taught_totals.ts
import { desc, eq, sql } from "drizzle-orm";
import { db, instructorTaughtCourseTable, uploadsTable } from "@workspace/db";

async function main() {
  const logs = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Instructor Taught Training")).orderBy(desc(uploadsTable.uploadedAt)).limit(3);
  console.log("Last taught-data rebuilds:");
  for (const l of logs) console.log(`  ${l.uploadedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST | ${l.rowCount} rows | ${l.filename}`);
  const [fail] = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Instructor Taught Training FAILED")).orderBy(desc(uploadsTable.uploadedAt)).limit(1);
  if (fail) console.log(`Last FAILED rebuild: ${fail.uploadedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST | ${fail.filename}`);
  const [ts] = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Instructor Training Status")).orderBy(desc(uploadsTable.uploadedAt)).limit(1);
  console.log(`Last Training Status sync: ${ts ? ts.uploadedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "never"} (if this is LATER than the last rebuild above, the taught step failed on that sync)\n`);
  const rows = await db.select({
    key: instructorTaughtCourseTable.portalCourseKey, title: instructorTaughtCourseTable.courseTitle,
    n: sql<number>`count(*)`, minT: sql<number>`min(curriculum_sessions)`, maxT: sql<number>`max(curriculum_sessions)`,
    synced: sql<string>`max(synced_at)::text`,
  }).from(instructorTaughtCourseTable).groupBy(instructorTaughtCourseTable.portalCourseKey, instructorTaughtCourseTable.courseTitle).orderBy(instructorTaughtCourseTable.courseTitle);
  console.log("course | instructors | smallest total | largest total | stored at");
  for (const r of rows) console.log(`  ${r.title} [${r.key ?? "-"}] | ${r.n} | ${r.minT} | ${r.maxT}${Number(r.minT) !== Number(r.maxT) ? "   <-- DIFFERENT" : ""} | ${r.synced}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
