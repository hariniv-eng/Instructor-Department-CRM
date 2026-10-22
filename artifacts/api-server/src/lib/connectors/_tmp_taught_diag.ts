// One-off, READ-ONLY (2026-10-22): why "Taught in class" says "No taught-in-class data yet". Checks, in order: does the table exist
// and have rows (DB push + sync), did the sync step run (uploads log), how many rows have curriculum sessions, how many instructors
// pass the page's NIAT filter (Product NIAT (Deployed) + enrolled plan NIAT), and the enrolled-plan values in use. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_taught_diag.ts
import { desc, eq, sql } from "drizzle-orm";
import { db, instructorsTable, instructorTaughtCourseTable, uploadsTable } from "@workspace/db";
import { productOf } from "../product";

async function main() {
  try {
    const [c] = await db.select({ n: sql<number>`count(*)`, withCurriculum: sql<number>`count(*) filter (where curriculum_sessions > 0)`, portal: sql<number>`count(*) filter (where portal_course_key is not null)` }).from(instructorTaughtCourseTable);
    console.log(`instructor_taught_course: ${c.n} rows | ${c.withCurriculum} with curriculum sessions | ${c.portal} matched to a portal course`);
  } catch (e) {
    console.log(`instructor_taught_course NOT readable -> the database push has not been run (or failed): ${(e as Error).message.slice(0, 200)}`);
  }
  const logs = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Instructor Taught Training")).orderBy(desc(uploadsTable.uploadedAt)).limit(5);
  console.log(`\nTaught-training sync runs logged: ${logs.length}`);
  for (const l of logs) console.log(`  ${l.uploadedAt.toISOString()} | ${l.rowCount} rows | ${l.filename}`);
  const [ts] = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Instructor Training Status")).orderBy(desc(uploadsTable.uploadedAt)).limit(1);
  console.log(`Last Training Status sync: ${ts?.uploadedAt.toISOString() ?? "never"} (the taught step runs right after it; if it failed, the server log says "[taught-training] sync failed")`);

  const people = await db.select().from(instructorsTable);
  const inT = people.filter((p) => p.inTeachos && p.teachosUserId);
  const deployed = inT.filter((p) => productOf(p) === "NIAT (Deployed)");
  const niat = deployed.filter((p) => !p.enrolledPlans || /niat/i.test(p.enrolledPlans));
  console.log(`\nIn TeachOS: ${inT.length} | Product NIAT (Deployed): ${deployed.length} | + enrolled plan NIAT (or none): ${niat.length}`);
  const plans = new Map<string, number>();
  for (const p of deployed) plans.set(p.enrolledPlans ?? "(none)", (plans.get(p.enrolledPlans ?? "(none)") ?? 0) + 1);
  console.log("Enrolled plans of NIAT (Deployed) people:");
  for (const [k, n] of [...plans].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n} | ${k}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
