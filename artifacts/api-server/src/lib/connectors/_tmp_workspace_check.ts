// One-off (2026-10-09): what does Darwin's Workspace ("work location") hold, and how does it line up with the TeachOS
// campus (institutes)? Decides whether the India map can use exact campus locations from Darwin. Read-only.
import { db, instructorsTable } from "@workspace/db";

async function main() {
  const rows = await db.select().from(instructorsTable);
  const withDarwin = rows.filter((r) => r.inDarwin);
  console.log(`rows: ${rows.length}, in Darwin: ${withDarwin.length}, with workspace: ${withDarwin.filter((r) => r.workspace?.trim()).length}\n`);
  const counts = new Map<string, number>();
  for (const r of withDarwin) { const k = r.workspace?.trim() || "(blank)"; counts.set(k, (counts.get(k) ?? 0) + 1); }
  console.log("Distinct Darwin workspace values:");
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${k}`);
  console.log("\nTeachOS institute -> Darwin workspace (people with both):");
  const cross = new Map<string, Map<string, number>>();
  for (const r of withDarwin) {
    for (const inst of r.institutes ?? []) {
      const ws = r.workspace?.trim() || "(blank)";
      const m = cross.get(inst) ?? new Map<string, number>();
      m.set(ws, (m.get(ws) ?? 0) + 1);
      cross.set(inst, m);
    }
  }
  for (const [inst, m] of [...cross].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${inst}: ${[...m].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} (${n})`).join(" | ")}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
