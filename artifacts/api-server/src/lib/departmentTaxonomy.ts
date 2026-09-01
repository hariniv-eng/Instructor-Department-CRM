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

// Coarse fallback when there's no usable Darwin `department` string at all
// (e.g. a TeachOS-only instructor who never matched Darwin) — TeachOS's own
// `category` field (teachosCategory) at least gives Tech vs Non-tech, just
// without a specific sub-area.
const CATEGORY_FALLBACK: Record<string, Exclude<DeptBucket, null>> = {
  TECH: "tech",
  ENGLISH: "non_tech",
  APTITUDE: "non_tech",
  MATH: "non_tech",
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
    return { bucket: CATEGORY_FALLBACK[category], area: null };
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
