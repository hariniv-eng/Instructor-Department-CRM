import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch {
  // ignore
}

async function main() {
  const { db, instructorsTable } = await import("@workspace/db");
  const { ilike } = await import("drizzle-orm");

  const rows = await db.select().from(instructorsTable).where(ilike(instructorsTable.fullName, "%Mani Teja Jinkala%"));

  if (rows.length === 0) {
    console.log("No row found matching that name");
    return;
  }

  for (const r of rows) {
    console.log("id:", r.id);
    console.log("fullName:", r.fullName);
    console.log("employeeId:", r.employeeId);
    console.log("teachosUserId:", r.teachosUserId);
    console.log("inDarwin:", r.inDarwin, "| inTeachos:", r.inTeachos);
    console.log("teachosCategory:", r.teachosCategory, "| teachosRole:", r.teachosRole);
    console.log("institutes:", r.institutes);
    console.log("classification:", r.classification, "| computedStatus:", r.computedStatus);
    console.log("lastSyncedAt (archive only, ignore if undefined):", (r as any).lastSyncedAt);
    console.log("---");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
