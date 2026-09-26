// Maps Darwin's raw `department` string (and, as a coarser fallback, the
// TeachOS `category` field) onto the reporting taxonomy requested for the
// instructor breakdowns: Tech vs Non-tech, and — within Tech — Backend /
// Frontend / DSA / GenAI, plus two small departments (Artificial
// Intelligence & Emerging Technologies, Interdisciplinary & Applied
// Sciences) that are deliberately kept as their OWN separate areas for now
// rather than folded into GenAI or anything else — that merge decision is
// still open (2026-08-29), so don't collapse them without an explicit call.
//
// Two department values are NOT instructors at all and are handled as
// department-level exclusions here (distinct from the individual, human-
// reviewed entries in classificationOverrides.ts):
//   - "Instructors – Delivery Support (Ops and Central Managers)" — ops/
//     central management staff, excluded from every instructor count.
//   - "Mentors" — also excluded from the instructor count, but kept as its
//     own reported bucket (not lumped into "excluded_other_department")
//     since the standing ask is to see mentors as a distinct section.
//
// Matching is done by substring, case-insensitively, and tolerates both the
// em-dash Darwin uses live ("Instructors – Frontend Technologies (NWD_ID_FT)")
// and the plain hyphen some exported sheets use ("Instructors - Frontend
// Technologies") — real department strings seen in this org as of 2026-08-29.

export type DeptBucket =
  | "tech"
  | "non_tech"
  | "excluded_ops_managers"
  | "mentor"
  | "instructor_ops"
  | null;

export interface DeptClassification {
  bucket: DeptBucket;
  area: string | null;
}

interface Rule {
  match: RegExp;
  bucket: Exclude<DeptBucket, null>;
  area: string | null;
}

const RULES: Rule[] = [
  { match: /delivery support/i, bucket: "excluded_ops_managers", area: null },
  { match: /^mentors?$/i, bucket: "mentor", area: null },
  { match: /frontend technologies/i, bucket: "tech", area: "Frontend" },
  { match: /backend systems/i, bucket: "tech", area: "Backend" },
  { match: /data structures/i, bucket: "tech", area: "DSA" },
  { match: /gen\s*ai\b/i, bucket: "tech", area: "GenAI" },
  {
    match: /artificial intelligence.*emerging technologies/i,
    bucket: "tech",
    area: "Artificial Intelligence & Emerging Technologies",
  },
  {
    match: /interdisciplinary.*applied sciences/i,
    bucket: "tech",
    area: "Interdisciplinary & Applied Sciences",
  },
  { match: /english.*communication/i, bucket: "non_tech", area: "English" },
  {
    match: /quantitative aptitude|logical reasoning/i,
    bucket: "non_tech",
    area: "Aptitude",
  },
  { match: /mathematical sciences/i, bucket: "non_tech", area: "Math" },
];

// Every distinct area name RULES above can produce (2026-09-15, per
// request) -- the closed set PATCH /instructors/:id/subject validates a
// manual Subject override against (see routes/instructors.ts), so that
// list can never drift out of sync with what this taxonomy actually
// recognizes. Derived rather than hand-duplicated on purpose.
export const SUBJECT_AREAS: string[] = [...new Set(RULES.map((rule) => rule.area).filter((area): area is string => !!area))];

// Same idea, narrowed to just the "tech" bucket's areas (2026-09-24, added
// for the Training Stats page's per-subject tabs -- "if I'm trying to open
// only tech, to only see the tech-related instructors"). Exported so
// GET /reports/training-stats can hand this list to the frontend instead of
// it hardcoding which areas count as "Tech", which would drift out of sync
// with RULES above the same way SUBJECT_AREAS avoids drifting.
export const TECH_AREAS: string[] = [
  ...new Set(RULES.filter((rule) => rule.bucket === "tech").map((rule) => rule.area).filter((area): area is string => !!area)),
];

// Coarse fallback when there's no usable Darwin `department` string at all
// (e.g. a TeachOS-only instructor who never matched Darwin) — TeachOS's own
// `category` field (teachosCategory) gives Tech vs Non-tech, and for three
// of the four values it's actually specific enough to resolve a real
// Subject/area, not just the coarse bucket: TeachOS's ENGLISH/APTITUDE/MATH
// categories map 1:1 onto three of the non-tech SUBJECT_AREAS above
// (2026-09-26, per request: "for instructors who's subject is missing check
// the instructor_category is english, aptitude or math take it from there").
// This only ever runs when there's no Darwin-matched area to begin with (see
// classifyDepartment below — this fallback is reached only after the RULES
// loop over an actual `department` string found nothing), so it can only
// fill in a genuinely missing Subject, never override one Darwin already
// resolved. TECH deliberately keeps area: null — it covers four sub-areas
// (Frontend/Backend/DSA/GenAI) that TeachOS's category alone can't tell
// apart, so that case is deliberately left for the Manual Subject control
// instead of guessing ("if it is tech just keep the manual entry").
const CATEGORY_FALLBACK: Record<string, { bucket: Exclude<DeptBucket, null>; area: string | null }> = {
  TECH: { bucket: "tech", area: null },
  ENGLISH: { bucket: "non_tech", area: "English" },
  APTITUDE: { bucket: "non_tech", area: "Aptitude" },
  MATH: { bucket: "non_tech", area: "Math" },
};

export function classifyDepartment(
  department: string | null,
  teachosCategory: string | null,
  designation: string | null = null,
): DeptClassification {
  const dept = (department ?? "").trim();
  if (dept) {
    for (const rule of RULES) {
      if (rule.match.test(dept)) {
        // Within an actual Instructors sub-department (tech/non_tech), the
        // Darwin designation decides who's really an Instructor vs a Mentor
        // embedded in that department vs Instructor Team Operations staff
        // filed under an instructor sub-department. Department-level rules
        // (Delivery Support -> excluded_ops_managers, Mentors -> mentor)
        // are untouched by this — it only refines tech/non_tech.
        if (rule.bucket === "tech" || rule.bucket === "non_tech") {
          const title = (designation ?? "").trim();
          if (title && !/instructor|trainer|trainee/i.test(title)) {
            if (/mentor/i.test(title))
              return { bucket: "mentor", area: rule.area };
            return { bucket: "excluded_ops_managers", area: null };
          }
        }
        return { bucket: rule.bucket, area: rule.area };
      }
    }
  }
  const category = (teachosCategory ?? "").trim().toUpperCase();
  if (category && CATEGORY_FALLBACK[category])
    return CATEGORY_FALLBACK[category];
  return { bucket: null, area: null };
}

// "Training Institute" is TeachOS's placeholder institute name for
// instructors currently in training rather than deployed to a real campus.
// Anyone whose `institutes` list has at least one non-training entry counts
// as deployed (someone can show up in both while transitioning).
const TRAINING_INSTITUTE = "training institute";

export type DeploymentStatus = "deployed" | "in_training" | null;

export function classifyDeployment(institutes: string[]): DeploymentStatus {
  const normalized = institutes
    .map((i) => i.trim().toLowerCase())
    .filter(Boolean);
  if (!normalized.length) return null;
  const hasRealCampus = normalized.some((i) => i !== TRAINING_INSTITUTE);
  if (hasRealCampus) return "deployed";
  return "in_training";
}
