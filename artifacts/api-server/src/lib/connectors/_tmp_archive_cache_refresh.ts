// Copies the Instructor Archive into the separate cache database NOW (lib/archiveCache.ts) and shows what the cache holds. Needs the
// ARCHIVE_CACHE_DATABASE_URL secret. Writes only to the cache database. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_archive_cache_refresh.ts
import { refreshArchiveCache, archiveCacheStatus } from "../archiveCache";

async function main() {
  const r = await refreshArchiveCache();
  console.log("Refresh:", JSON.stringify(r));
  const s = await archiveCacheStatus();
  console.log("Cache database now:", s ? JSON.stringify(s) : "not configured (set the ARCHIVE_CACHE_DATABASE_URL secret)");
  process.exit(r.ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
