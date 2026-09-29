import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch {
  // ignore
}

async function main() {
  const { db, instructorsTable } = await import("@workspace/db");
  const { eq, ilike } = await import("drizzle-orm");

  const target = await db.select().from(instructorsTable).where(ilike(instructorsTable.fullName, "%Mani Teja Jinkala%"));
  console.log("Mani Teja Jinkala's own record:");
  for (const r of target) {
    console.log(`  id=${r.id} | teachosUserId=${r.teachosUserId} | employeeId=${r.employeeId} | notes=${JSON.stringify(r.notes)}`);
  }

  const conflict = await db.select().from(instructorsTable).where(eq(instructorsTable.teachosUserId, "76121fc71353499e9bd57d7af6991bf8"));
  console.log(`\nRows currently holding teachosUserId = 76121fc71353499e9bd57d7af6991bf8: ${conflict.length}`);
  for (const r of conflict) {
    console.log(`  id=${r.id} | fullName=${r.fullName} | employeeId=${r.employeeId} | inDarwin=${r.inDarwin} | inTeachos=${r.inTeachos} | classification=${r.classification}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
