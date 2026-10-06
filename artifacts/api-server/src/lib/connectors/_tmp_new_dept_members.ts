// One-off (2026-10-06): who is newly in the Instructor Department since the
// Instructor Archive showed 687 yesterday (now 695)? Lists every current
// department member whose archive row was first created in the last ~2 days
// (archive firstSeenAt), plus anyone on the confirmed-instructor override
// list (e.g. NW0005068), since they joined the department count by a rule
// change rather than by being a new person. Read-only.
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { normalize } from "../reconcile";
import { CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER } from "../../data/classificationOverrides";

type LiveRow = typeof instructorsTable.$inferSelect;
type ArchiveRow = typeof instructorArchiveTable.$inferSelect;

const CUTOFF = new Date("2026-10-05T00:00:00Z");

const confirmed = (r: LiveRow) => CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER.some((e) => (e.teachosUserId ? e.teachosUserId === r.teachosUserId : e.employeeId ? e.employeeId === r.employeeId : normalize(e.fullName) === normalize(r.fullName)));

function bucket(r: LiveRow): string | null {
  if (r.inDarwin && (!r.inDarwinFullRoster || confirmed(r)) && !r.classification && (r.deptBucket === "tech" || r.deptBucket === "non_tech")) return confirmed(r) && r.inDarwinFullRoster ? "Instructor (confirmed override)" : "Instructor";
  const teachosOnly = r.inTeachos && !r.inDarwin;
  if (teachosOnly && r.classification === "payroll_converted") return "Instructor (payroll)";
  if (teachosOnly && !["excluded_other_department", "excluded_non_department_team", "iit_kharagpur_team"].includes(r.classification ?? "")) return "Needs review (TeachOS only)";
  if (r.inDarwin && !r.inDarwinFullRoster && r.classification === "mentor") return "Mentor";
  if (r.classification === "excluded_ops_managers") return "Operations team";
  return null;
}

function findArchive(archived: ArchiveRow[], r: LiveRow): ArchiveRow | undefined {
  if (r.employeeId) { const m = archived.find((a) => a.employeeId === r.employeeId); if (m) return m; }
  if (r.teachosUserId) { const m = archived.find((a) => a.teachosUserId === r.teachosUserId); if (m) return m; }
  return archived.find((a) => normalize(a.fullName) === normalize(r.fullName));
}

async function main() {
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const dept = live.map((r) => ({ r, b: bucket(r) })).filter((x) => x.b !== null);
  console.log(`Current department members: ${dept.length}`);

  const rows = dept.map(({ r, b }) => ({ r, b, a: findArchive(archive, r) })).filter((x) => x.a && (x.a.firstSeenAt >= CUTOFF || confirmed(x.r)));
  rows.sort((x, y) => (x.a!.firstSeenAt.getTime() - y.a!.firstSeenAt.getTime()));
  console.log(`\nNewly added since ${CUTOFF.toISOString()} (archive row first created) or override-added: ${rows.length}\n`);
  for (const { r, b, a } of rows) {
    console.log(`- ${r.fullName} | emp=${r.employeeId ?? "(none)"} | ${b} | joined=${r.dateOfJoining ?? "?"} | designation=${r.designation ?? "?"} | dept=${r.department ?? "?"} | firstSeen=${a!.firstSeenAt.toISOString()}${confirmed(r) ? " | OVERRIDE LIST" : ""}`);
  }

  // Rows created recently that are NOT department members (for context).
  const deptIds = new Set(rows.map((x) => x.a!.id));
  const recentOther = archive.filter((a) => a.firstSeenAt >= CUTOFF && !deptIds.has(a.id));
  console.log(`\nArchive rows created since the cutoff that are NOT in the department: ${recentOther.length}`);
  for (const a of recentOther) console.log(`  ${a.fullName} | emp=${a.employeeId ?? "(none)"} | classification=${a.classification} | inDarwin=${a.inDarwin} inTeachos=${a.inTeachos}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
