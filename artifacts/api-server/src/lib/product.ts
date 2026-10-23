// Product of an instructor / mentor (2026-10-15, per request: Product column and filter on the Training Stats and Contribution tabs).
// This is the SAME rule as productLabel() in instructor-crm/src/pages/instructors.tsx (which drives the Instructors tab's Product column,
// filter and the dashboard's Product mix) -- keep the two in step if the rule ever changes. Those tabs hold the whole person record on the
// client; these two reports only send a few columns, so the label is worked out here from the same fields instead.
//   Support          Operations team rows (classification excluded_ops_managers / instructor_ops)
//   Academy          any Campus (institutes) entry containing "academy"
//   IIT X DSA        Campus is "NxtWave Institute of Advanced Technology - DSA" (2026-10-23: campus only; the old Darwin-manager rule is gone)
//   Intensive        any Campus entry containing "intensive"
//   NIAT (Training)  Campus has "Training Institute", or no Campus at all
//   NIAT (Deployed)  everyone else
type ProductInput = { classification: string | null; institutes: string[] | null; directManager: string | null };

// IIT X DSA campus (2026-10-23, per request: "only focus on the campus -- if the campus is NxtWave Institute of Advanced Technology -DSA,
// they are IIT X DSA"). Matched ignoring case, spaces and punctuation ("Nxt Wave" / "Next Wave" spellings and "-DSA" / " - DSA" both match).
export function isIitxDsaCampus(campus: string): boolean {
  const k = campus.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return /^n(e)?xtwaveinstituteofadvancedtechnology/.test(k) && k.endsWith("dsa");
}

export function productOf(person: ProductInput): string {
  if (person.classification === "excluded_ops_managers" || person.classification === "instructor_ops") return "Support";
  const institutes = person.institutes ?? [];
  if (institutes.some((i) => i.toLowerCase().includes("academy"))) return "Academy";
  if (institutes.some(isIitxDsaCampus)) return "IIT X DSA";
  if (institutes.some((i) => i.toLowerCase().includes("intensive"))) return "Intensive";
  if (institutes.includes("Training Institute")) return "NIAT (Training)";
  if (institutes.length === 0) return "NIAT (Training)";
  return "NIAT (Deployed)";
}
