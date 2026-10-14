// One-off (2026-10-14): runs the Darwin exit sync RIGHT NOW from the Replit shell (same code and same lock as the Sync Now button on
// the exits source), so the new exit logic can be used without waiting for a republish. WRITES to darwinbox_exits (full replace,
// keeping earlier rows Darwin no longer returns) and recomputes classifications. Run from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_run_exit_sync_now.ts
import { runDarwinboxExitsSync } from "../../routes/sync";
import { withSyncLock } from "../syncContext";

async function main() {
  const out = await withSyncLock(runDarwinboxExitsSync);
  if (!out.ran) { console.log("Another sync is already running. Wait a few minutes and try again."); process.exit(1); }
  console.log(JSON.stringify(out.value, null, 2));
  process.exit(out.value.ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
