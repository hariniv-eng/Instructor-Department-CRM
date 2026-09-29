import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch {
  // ignore
}

async function main() {
  const { db, instructorsTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, "NW2000656"));

  if (rows.length === 0) {
    console.log("No row found for employeeId NW2000656");
    return;
  }

  for (const r of rows) {
    console.log("fullName:", r.fullName);
    console.log("inDarwin:", r.inDarwin, "| inTeachos:", r.inTeachos);
    console.log("department (Darwin):", r.department);
    console.log("designation:", r.designation);
    console.log("teachosCategory:", r.teachosCategory);
    console.log("teachosRole:", r.teachosRole);
    console.log("deptBucket:", r.deptBucket, "| deptArea:", r.deptArea);
    console.log("classification:", r.classification);
    console.log("classificationReason:", r.classificationReason);
    console.log("computedStatus:", r.computedStatus);
    console.log("institutes:", r.institutes);
    console.log("exitFlag:", r.exitFlag, "| exitFlagStatus:", r.exitFlagStatus, "| exitVerification:", r.exitVerification);
    console.log("---");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
