// One-off lookup (2026-10-05): every distinct individual plan code that
// appears anywhere in the live instructorsTable's enrolled_plans field,
// with a count of how many instructors carry each one. enrolled_plans
// holds a numbered, newline-separated list per person (e.g.
// "1. CBA_ONBOARDING\n2. NIAT"), not a single flat value -- see
// productLabel()'s comment in instructors.tsx -- so this splits each
// person's field on newlines, strips the leading "N. " numbering, and
// counts each individual code rather than treating the whole multi-line
// string as one value.
import { db, instructorsTable } from "@workspace/db";

function parsePlans(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean);
}

async function main() {
  const rows = await db.select({ enrolledPlans: instructorsTable.enrolledPlans }).from(instructorsTable);

  const counts = new Map<string, number>();
  let peopleWithNoPlans = 0;
  for (const row of rows) {
    const plans = parsePlans(row.enrolledPlans);
    if (plans.length === 0) {
      peopleWithNoPlans += 1;
      continue;
    }
    for (const plan of plans) {
      counts.set(plan, (counts.get(plan) ?? 0) + 1);
    }
  }

  console.log(`=== Distinct enrolled_plans values across ${rows.length} live instructors ===`);
  for (const [plan, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${plan} -> ${count} instructor(s)`);
  }
  console.log(`\nInstructors with no enrolled_plans on file at all: ${peopleWithNoPlans}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
