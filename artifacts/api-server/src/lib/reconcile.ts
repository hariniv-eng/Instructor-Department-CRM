// Name-matching + reconciliation logic — extracted out of routes/uploads.ts
// (unchanged) so routes/sync.ts (live Darwinbox/BigQuery sync) can reuse the
// exact same matching behavior instead of duplicating it. Manual CSV/XLSX
// uploads and live API syncs now both go through these same functions, so
// behavior stays identical regardless of where the rows came from.

import { and, eq } from "drizzle-orm";
import { db, instructorsTable, darwinboxExitsTable } from "@workspace/db";
import { EXCLUDED_EMPLOYEES, PAYROLL_CONVERTED_EMPLOYEES, type ExcludedOverride, type PayrollConvertedOverride } from "../data/classificationOverrides";
import { classifyDepartment, classifyDeployment } from "./departmentTaxonomy";

export type SheetRow = Record<string, unknown>;

export const cell = (row: SheetRow, ...keys: string[]) => {
  const found = Object.entries(row).find(([key]) => keys.some((candidate) => key.trim().toLowerCase() === candidate.toLowerCase()));
  return found?.[1] === undefined || found[1] === null ? null : String(found[1]).trim() || null;
};

export const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

export const findMatch = (rows: Array<typeof instructorsTable.$inferSelect>, name: string | null, employeeId?: string | null) => {
  if (employeeId) {
    const employee = rows.find((item) => item.employeeId === employeeId);
    if (employee) return employee;
  }
  if (!name) return undefined;
  const normalized = normalize(name);
  return rows.find((item) => normalize(item.fullName) === normalized) ?? rows.find((item) => normalize(item.fullName).replaceAll(" ", "") === normalized.replaceAll(" ", ""));
};

export const similarity = (left: string, right: string) => {
  const source = normalize(left);
  const target = normalize(right);
  const matrix = Array.from({ length: source.length + 1 }, (_, row) => Array.from({ length: target.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : 0));
  for (let row = 1; row <= source.length; row += 1) for (let column = 1; column <= target.length; column += 1) matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (source[row - 1] === target[column - 1] ? 0 : 1));
  return source && target ? 1 - matrix[source.length][target.length] / Math.max(source.length, target.length) : 0;
};

export const possibleMatchNote = (rows: Array<typeof instructorsTable.$inferSelect>, name: string) => {
  const candidate = rows.map((row) => ({ name: row.fullName, score: similarity(name, row.fullName) })).sort((left, right) => right.score - left.score)[0];
  return candidate && candidate.score >= 0.62 && candidate.score < 1 ? `Possible match: ${candidate.name} (${Math.round(candidate.score * 100)}% confidence). Review before merging.` : null;
};

// --- TeachOS instructor-count classification -------------------------------
// Applies the maintained override lists (../data/classificationOverrides.ts)
// plus live Darwinbox exit-record matching on top of whatever
// reconcileDarwin/reconcileTeachos/reconcileExits already wrote. See
// TEACHOS_INSTRUCTOR_COUNT_RULES.md for the narrative rule this encodes.

type InstructorRow = typeof instructorsTable.$inferSelect;

// teachosUserId first (exact match against TeachOS's stable instructor_user_id);
// falls back to normalized full name when either side has no teachosUserId
// recorded. Mirrors findMatch()'s employeeId-then-name fallback above.
function findOverride<T extends { teachosUserId?: string; fullName: string }>(row: InstructorRow, list: T[]): T | undefined {
  if (row.teachosUserId) {
    const byId = list.find((entry) => entry.teachosUserId && entry.teachosUserId === row.teachosUserId);
    if (byId) return byId;
  }
  const normalizedRowName = normalize(row.fullName);
  return list.find((entry) => normalize(entry.fullName) === normalizedRowName);
}

interface ExitInfo {
  status: string | null;
  exitDate: string | null;
}

// Darwinbox exit records don't carry a stable numeric ordering we can trust
// across sources, and "Exit Date" strings come from Darwinbox as-is (same
// caveat as instructorsTable.exitDate elsewhere in this file — no format
// normalization is done, consistent with the rest of this codebase). This
// parses just well enough to pick a "most recent" record per person when
// more than one comes back (e.g. a resignation that was Approved and later
// Rejected, or Revoked and later re-Approved) — falls back to whichever
// record was inserted last (highest id) when dates can't be compared.
function parseLooseDate(value: string | null): number {
  if (!value) return -Infinity;
  const iso = Date.parse(value);
  if (!Number.isNaN(iso)) return iso;
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(value.trim());
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const parsed = new Date(year, Number(m) - 1, Number(d)).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return -Infinity;
}

// Converts a "DD-MM-YYYY" (or "DD/MM/YYYY") string from Darwinbox into the
// ISO "YYYY-MM-DD" format Postgres date columns require. Darwinbox's exit
// report emits dates day-first (e.g. "31-08-2025"), which Postgres's
// default month-first date parser rejects once the day exceeds 12 — exactly
// the failure the live exits sync hit. Returns null for anything that isn't
// a recognizable calendar date, so a bad value is dropped, not crashed on.
function toISODate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(trimmed);
  if (!dmy) return null;
  const [, d, m, y] = dmy;
  const day = Number(d);
  const month = Number(m);
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

// Builds a lookup of the single most-recent exit record per person (by
// employeeId, falling back to normalized name), from whatever's currently
// in darwinboxExitsTable (fully replaced on every live exits sync — see
// storeRaw.ts). Any hit here means "flag, don't subtract" per the standing
// rule — this person still counts as an instructor, they're just annotated.
async function loadLatestExitsByPerson(): Promise<{ byEmployeeId: Map<string, ExitInfo>; byName: Map<string, ExitInfo> }> {
  const exits = await db.select().from(darwinboxExitsTable);
  const byEmployeeId = new Map<string, { info: ExitInfo; rank: number; id: number }>();
  const byName = new Map<string, { info: ExitInfo; rank: number; id: number }>();
  for (const exit of exits) {
    const status = cell(exit.rawData, "Status", "status");
    const exitDate = cell(exit.rawData, "Exit Date", "exit_date");
    const info: ExitInfo = { status, exitDate };
    const rank = parseLooseDate(exitDate);
    const candidate = { info, rank, id: exit.id };
    const isNewer = (existing?: { rank: number; id: number }) => !existing || rank > existing.rank || (rank === existing.rank && exit.id > existing.id);
    if (exit.employeeId) {
      if (isNewer(byEmployeeId.get(exit.employeeId))) byEmployeeId.set(exit.employeeId, candidate);
    }
    if (exit.fullName) {
      const key = normalize(exit.fullName);
      if (isNewer(byName.get(key))) byName.set(key, candidate);
    }
  }
  return {
    byEmployeeId: new Map([...byEmployeeId].map(([key, value]) => [key, value.info])),
    byName: new Map([...byName].map(([key, value]) => [key, value.info])),
  };
}

function findExit(row: InstructorRow, exits: { byEmployeeId: Map<string, ExitInfo>; byName: Map<string, ExitInfo> }): ExitInfo | undefined {
  if (row.employeeId && exits.byEmployeeId.has(row.employeeId)) return exits.byEmployeeId.get(row.employeeId);
  return exits.byName.get(normalize(row.fullName));
}

export const recomputeStatuses = async () => {
  const rows = await db.select().from(instructorsTable);
  const exits = await loadLatestExitsByPerson();
  await Promise.all(rows.map((row) => {
    // Priority: an individual, human-reviewed override (classificationOverrides.ts)
    // always wins first; then the two department-level exclusion rules
    // (Delivery Support -> ops/managers, Mentors -> mentor); then the
    // payroll-converted override; only then the ordinary Darwin/TeachOS
    // presence rules. See departmentTaxonomy.ts for the department matching.
    const excludedOverride = findOverride<ExcludedOverride>(row, EXCLUDED_EMPLOYEES);
    const deptInfo = classifyDepartment(row.department, row.teachosCategory);
    const isDeptExclusion = deptInfo.bucket === "excluded_ops_managers" || deptInfo.bucket === "mentor";
    // Payroll-converted status comes from either source: the hand-maintained
    // override list (a human decision, always wins if present) or a name
    // match against the most recently uploaded "Payroll Candidates" file
    // (reconcilePayrollCandidates() below sets payrollCandidateMatched).
    const payrollConverted = !excludedOverride && !isDeptExclusion
      ? findOverride<PayrollConvertedOverride>(row, PAYROLL_CONVERTED_EMPLOYEES)
        ?? (row.payrollCandidateMatched ? { fullName: row.fullName, reason: "Matched the uploaded Payroll Candidates reference file", decidedDate: new Date().toISOString().slice(0, 10) } satisfies PayrollConvertedOverride : undefined)
      : undefined;
    const exit = findExit(row, exits);
    const deploymentStatus = classifyDeployment(row.institutes);

    let classification: string | null = null;
    let classificationReason: string | null = null;
    let computedStatus: string;

    if (excludedOverride) {
      classification = excludedOverride.classification;
      classificationReason = excludedOverride.reason;
      computedStatus = "excluded";
    } else if (deptInfo.bucket === "excluded_ops_managers") {
      classification = "excluded_ops_managers";
      classificationReason = "Delivery Support (Ops and Central Managers) department — not an instructor role";
      computedStatus = "excluded";
    } else if (deptInfo.bucket === "mentor") {
      classification = "mentor";
      classificationReason = "Mentors department — tracked as its own section, not counted as an instructor";
      computedStatus = "mentor";
    } else if (payrollConverted) {
      classification = "payroll_converted";
      classificationReason = payrollConverted.reason;
      computedStatus = "payroll_converted";
    } else {
      computedStatus = row.inDarwin && row.darwinEmployeeStatus === "Active"
        ? "active"
        : row.inDarwin && !row.inTeachos
          ? "pending_deployment"
          : "needs_review";
    }

    return db.update(instructorsTable).set({
      computedStatus,
      classification,
      classificationReason,
      exitFlag: !!exit,
      exitFlagStatus: exit?.status ?? null,
      exitFlagDate: toISODate(exit?.exitDate ?? null),
      deptBucket: isDeptExclusion ? null : deptInfo.bucket,
      deptArea: isDeptExclusion ? null : deptInfo.area,
      deploymentStatus,
    }).where(eq(instructorsTable.id, row.id));
  }));
};

export async function reconcileDarwin(rows: SheetRow[]) {
  let newCount = 0;
  let matchedCount = 0;
  await db.update(instructorsTable).set({ inDarwin: false, darwinEmployeeStatus: null });
  const people = await db.select().from(instructorsTable);
  for (const item of rows) {
    const fullName = cell(item, "Full Name", "full_name");
    const employeeId = cell(item, "Employee Id", "employee_id");
    if (!fullName) continue;
    const match = findMatch(people, fullName, employeeId);
    const values = {
      employeeId,
      fullName,
      orgEmail: cell(item, "Org Email Id", "org_email"),
      mobile: cell(item, "Primary Mobile Number", "mobile"),
      dateOfJoining: cell(item, "Date Of Joining", "date_of_joining"),
      department: cell(item, "Department", "department"),
      subDepartment: cell(item, "Sub Department", "sub_department"),
      designation: cell(item, "Designation", "designation"),
      directManager: cell(item, "Direct Manager", "direct_manager"),
      workLocation: cell(item, "Work Location", "work_location"),
      workspace: cell(item, "Workspace", "workspace"),
      gender: cell(item, "Gender", "gender"),
      currentState: cell(item, "Current State", "current_state"),
      currentCity: cell(item, "Current City", "current_city"),
      darwinEmployeeStatus: cell(item, "Employee Status", "darwin_employee_status") ?? "Active",
      inDarwin: true,
    };
    if (match) {
      await db.update(instructorsTable).set(values).where(eq(instructorsTable.id, match.id));
      matchedCount += 1;
    } else {
      const [created] = await db.insert(instructorsTable).values({ ...values, inTeachos: false, institutes: [], computedStatus: "pending_deployment", notes: possibleMatchNote(people, fullName) }).returning();
      people.push(created);
      newCount += 1;
    }
  }
  return { new: newCount, matched: matchedCount, total_rows: rows.length };
}

export async function reconcileTeachos(rows: SheetRow[]) {
  let newCount = 0;
  let matchedCount = 0;
  await db.update(instructorsTable).set({ inTeachos: false, teachosRole: null, teachosCategory: null, teachosManager: null, institutes: [] });
  const people = await db.select().from(instructorsTable);
  for (const item of rows) {
    const fullName = cell(item, "instructor_name", "Instructor Name");
    if (!fullName) continue;
    const match = findMatch(people, fullName);
    const institute = cell(item, "institute_name", "Institute Name");
    const values = {
      teachosUserId: cell(item, "instructor_user_id", "TeachOS User Id"),
      fullName,
      teachosRole: cell(item, "instructor_role", "Instructor Role"),
      teachosCategory: cell(item, "instructor_category", "Instructor Category"),
      teachosManager: cell(item, "instructor_manager", "Instructor Manager"),
      inTeachos: true,
      institutes: institute ? [institute] : [],
    };
    if (match) {
      const institutes = institute ? Array.from(new Set([...match.institutes, institute])) : match.institutes;
      await db.update(instructorsTable).set({ ...values, institutes }).where(eq(instructorsTable.id, match.id));
      match.institutes = institutes;
      matchedCount += 1;
    } else {
      const [created] = await db.insert(instructorsTable).values({ ...values, inDarwin: false, computedStatus: "needs_review", notes: possibleMatchNote(people, fullName) }).returning();
      people.push(created);
      newCount += 1;
    }
  }
  return { new: newCount, matched: matchedCount, total_rows: rows.length };
}

// --- Darwin full-roster fallback match --------------------------------------
// After the primary reconcileDarwin() pass (Instructors-department-filtered
// Darwin data), some TeachOS instructors may still show inDarwin=false —
// their Darwinbox record exists, it's just filed under a department other
// than "Instructors" (Mentors is the confirmed real case; there may be
// others). This pass takes Darwin's FULL/unfiltered company roster
// (darwinbox_full_roster — see fetchDarwinRowsBoth() in
// lib/connectors/darwinbox.ts and storeDarwinboxFullRoster() in
// lib/storeRaw.ts) and re-checks exactly those remaining people against it.
// A match here sets inDarwin=true (this person genuinely is in Darwinbox,
// the primary sync just couldn't see them) plus inDarwinFullRoster=true as
// an audit flag, and backfills department/status/manager fields so
// recomputeStatuses()'s classifyDepartment() call picks the right bucket
// (e.g. Mentors, or Delivery Support/Ops) exactly as it would have if the
// primary sync had found them directly.
//
// Must run AFTER reconcileDarwin() (which needs a clean, freshly-matched
// inDarwin state to know who's still unmatched) and does not depend on
// reconcileTeachos() having *just* run — it reads whatever inTeachos state
// is currently in instructorsTable, which reflects the most recent TeachOS
// sync regardless of when that was.
export async function reconcileDarwinFullRosterFallback(fullRosterRows: SheetRow[]) {
  // Reset first so a person who dropped out of the full roster (or is now
  // matched by the primary sync instead) doesn't keep a stale flag.
  await db.update(instructorsTable).set({ inDarwinFullRoster: false });

  const byEmployeeId = new Map<string, SheetRow>();
  const byName = new Map<string, SheetRow>();
  for (const row of fullRosterRows) {
    const employeeId = cell(row, "Employee Id", "employee_id");
    const fullName = cell(row, "Full Name", "full_name");
    if (employeeId && !byEmployeeId.has(employeeId)) byEmployeeId.set(employeeId, row);
    if (fullName) {
      const key = normalize(fullName);
      if (!byName.has(key)) byName.set(key, row);
    }
  }

  const candidates = await db
    .select()
    .from(instructorsTable)
    .where(and(eq(instructorsTable.inTeachos, true), eq(instructorsTable.inDarwin, false)));

  let matchedCount = 0;
  for (const person of candidates) {
    const match = (person.employeeId && byEmployeeId.get(person.employeeId)) || byName.get(normalize(person.fullName));
    if (!match) continue;

    const employeeId = cell(match, "Employee Id", "employee_id");
    const department = cell(match, "Department", "department");
    const darwinEmployeeStatus = cell(match, "Employee Status", "darwin_employee_status") ?? "Active";

    await db.update(instructorsTable).set({
      inDarwin: true,
      inDarwinFullRoster: true,
      employeeId: employeeId ?? person.employeeId,
      orgEmail: cell(match, "Org Email Id", "org_email") ?? person.orgEmail,
      mobile: cell(match, "Primary Mobile Number", "mobile") ?? person.mobile,
      dateOfJoining: cell(match, "Date Of Joining", "date_of_joining") ?? person.dateOfJoining,
      department: department ?? person.department,
      designation: cell(match, "Designation", "designation") ?? person.designation,
      directManager: cell(match, "Direct Manager", "direct_manager") ?? person.directManager,
      workLocation: cell(match, "Work Location", "work_location") ?? person.workLocation,
      workspace: cell(match, "Workspace", "workspace") ?? person.workspace,
      gender: cell(match, "Gender", "gender") ?? person.gender,
      currentState: cell(match, "Current State", "current_state") ?? person.currentState,
      currentCity: cell(match, "Current City", "current_city") ?? person.currentCity,
      darwinEmployeeStatus,
    }).where(eq(instructorsTable.id, person.id));
    matchedCount += 1;
  }

  return { candidates: candidates.length, matched: matchedCount };
}

export async function reconcileExits(rows: SheetRow[]) {
  let matchedCount = 0;
  let unmatchedCount = 0;
  const people = await db.select().from(instructorsTable);
  for (const item of rows) {
    const match = findMatch(people, cell(item, "Full Name", "full_name"), cell(item, "Employee Id", "employee_id"));
    if (!match) {
      unmatchedCount += 1;
      continue;
    }
    await db.update(instructorsTable).set({
      manualStatus: "exited",
      exitDate: cell(item, "Exit Date", "exit_date"),
      notes: cell(item, "Reason", "reason") ?? match.notes,
    }).where(eq(instructorsTable.id, match.id));
    matchedCount += 1;
  }
  return { matched: matchedCount, unmatched: unmatchedCount, total_rows: rows.length };
}

// TeachOS's own API/BigQuery data has no employee ID at all (see bigquery.ts
// header comment) — this is the standing workaround: a periodically-uploaded
// reference file that DOES carry employee_id per TeachOS instructor (from a
// separate bulk-load/onboarding export), matched here by teachos_user_id
// first, normalized name as fallback, same precedence classificationOverrides.ts
// uses. Only ever fills in employeeId on an EXISTING inTeachos=true row —
// never creates new instructors and never touches anyone not already in
// TeachOS's own roster. People with no match here simply keep employeeId
// null and are set aside per the standing pipeline (see
// TEACHOS_INSTRUCTOR_COUNT_RULES.md) until a future reference file resolves
// them.
export async function reconcileTeachosEmployeeIdReference(rows: SheetRow[]) {
  let matchedCount = 0;
  let unmatchedCount = 0;
  let conflictCount = 0;
  const people = await db.select().from(instructorsTable).where(eq(instructorsTable.inTeachos, true));
  const byTeachosId = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId as string, p]));
  const byName = new Map(people.map((p) => [normalize(p.fullName), p]));
  for (const item of rows) {
    const teachosUserId = cell(item, "Instructor User Id", "instructor_user_id");
    const employeeId = cell(item, "Employee Id", "employee_id");
    const fullName = cell(item, "Employee Name", "Instructor Name", "instructor_name", "full_name");
    if (!employeeId) continue;
    const match = (teachosUserId && byTeachosId.get(teachosUserId)) || (fullName ? byName.get(normalize(fullName)) : undefined);
    if (!match) {
      unmatchedCount += 1;
      continue;
    }
    try {
      await db.update(instructorsTable).set({ employeeId }).where(eq(instructorsTable.id, match.id));
      match.employeeId = employeeId;
      matchedCount += 1;
    } catch {
      // Unique constraint on employeeId — this employee_id is already on a
      // DIFFERENT row (a genuine data conflict between sources). Leave that
      // other row's employeeId as-is rather than crashing the whole upload;
      // flag it for manual review the same way classificationOverrides.ts
      // conflicts are flagged.
      await db.update(instructorsTable).set({
        notes: `TeachOS ID reference file lists employee_id ${employeeId} for this person, but that id is already assigned to a different record. Needs manual review.`,
      }).where(eq(instructorsTable.id, match.id));
      conflictCount += 1;
    }
  }
  return { matched: matchedCount, unmatched: unmatchedCount, conflicts: conflictCount, total_rows: rows.length };
}

// The payroll-candidates reference file (Employee Name, Employee ID — no
// TeachOS id) — matched by normalized name only, since that's the only key
// it shares with the instructor register. A match sets payrollCandidateMatched,
// which recomputeStatuses() treats as equivalent to a hand-maintained
// PAYROLL_CONVERTED_EMPLOYEES override entry. "Raw snapshot, fully
// replaced": every row's flag is reset before processing this upload, same
// pattern as the other sources.
export async function reconcilePayrollCandidates(rows: SheetRow[]) {
  let matchedCount = 0;
  let unmatchedCount = 0;
  await db.update(instructorsTable).set({ payrollCandidateMatched: false, payrollCandidateNote: null });
  const people = await db.select().from(instructorsTable).where(eq(instructorsTable.inTeachos, true));
  const byName = new Map(people.map((p) => [normalize(p.fullName), p]));
  for (const item of rows) {
    const fullName = cell(item, "Employee Name", "Full Name", "full_name");
    const employeeId = cell(item, "Employee Id", "employee_id");
    if (!fullName) continue;
    const match = byName.get(normalize(fullName));
    if (!match) {
      unmatchedCount += 1;
      continue;
    }
    const conflict = employeeId && match.employeeId && employeeId !== match.employeeId
      ? `Payroll candidates file lists employee_id ${employeeId} for this name — conflicts with ${match.employeeId} already on file. Needs manual review.`
      : null;
    await db.update(instructorsTable).set({ payrollCandidateMatched: true, payrollCandidateNote: conflict }).where(eq(instructorsTable.id, match.id));
    matchedCount += 1;
  }
  return { matched: matchedCount, unmatched: unmatchedCount, total_rows: rows.length };
}
