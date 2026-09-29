import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch {}

async function main() {
  const { db, instructorsTable, teachosIdReferenceTable } = await import("@workspace/db");
  const { eq, ilike, or } = await import("drizzle-orm");

  console.log("=== TeachOS ID Reference table entry ===");
  const refRows = await db
    .select()
    .from(teachosIdReferenceTable)
    .where(eq(teachosIdReferenceTable.instructorUserId, "76121fc71353499e9bd57d7af6991bf8"));
  console.log(JSON.stringify(refRows, null, 2));

  console.log("\n=== Record 1301 (J Maniteja) ===");
  const rec1301 = await db
    .select()
    .from(instructorsTable)
    .where(eq(instructorsTable.id, 1301));
  for (const r of rec1301) {
    console.log({
      id: r.id,
      fullName: r.fullName,
      employeeId: r.employeeId,
      teachosUserId: r.teachosUserId,
      inDarwin: r.inDarwin,
      inTeachos: r.inTeachos,
      teachosCategory: r.teachosCategory,
      teachosRole: r.teachosRole,
      teachosStatus: r.teachosStatus,
      institutes: r.institutes,
      enrolledPlans: r.enrolledPlans,
      classification: r.classification,
      notes: r.notes,
    });
  }

  console.log("\n=== Record 1598 (Mani Teja Jinkala stub) ===");
  const rec1598 = await db
    .select()
    .from(instructorsTable)
    .where(eq(instructorsTable.id, 1598));
  for (const r of rec1598) {
    console.log({
      id: r.id,
      fullName: r.fullName,
      employeeId: r.employeeId,
      teachosUserId: r.teachosUserId,
      inDarwin: r.inDarwin,
      inTeachos: r.inTeachos,
      teachosCategory: r.teachosCategory,
      classification: r.classification,
      notes: r.notes,
    });
  }

  console.log("\n=== Any other rows still named like Mani Teja (dupe check) ===");
  const dupes = await db
    .select({ id: instructorsTable.id, fullName: instructorsTable.fullName, employeeId: instructorsTable.employeeId, teachosUserId: instructorsTable.teachosUserId })
    .from(instructorsTable)
    .where(or(ilike(instructorsTable.fullName, "%mani teja%"), ilike(instructorsTable.fullName, "%maniteja%")));
  console.log(JSON.stringify(dupes, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
