// Product of an instructor / mentor (2026-10-15, per request: Product column and filter on the Training Stats and Contribution tabs).
// This is the SAME rule as productLabel() in instructor-crm/src/pages/instructors.tsx (which drives the Instructors tab's Product column,
// filter and the dashboard's Product mix) -- keep the two in step if the rule ever changes. Those tabs hold the whole person record on the
// client; these two reports only send a few columns, so the label is worked out here from the same fields instead.
//   Support          Operations team rows (classification excluded_ops_managers / instructor_ops)
//   Academy          any Campus (institutes) entry containing "academy"
//   IIT X DSA        Darwin manager is Jashwanth Dandu (NW0005864) OR (2026-10-24) any Campus is "NxtWave Institute of Advanced Technology - DSA"
//   Intensive        any Campus entry containing "intensive"
//   NIAT (Training)  Campus has "Training Institute", or no Campus at all
//   NIAT (Deployed)  everyone else
type ProductInput = { classification: string | null; institutes: string[] | null; directManager: string | null };

// IIT X DSA campus (2026-10-24): "NxtWave Institute of Advanced Technology - DSA", ignoring case, spaces and punctuation ("Next Wave",
// "-DSA" / " - DSA" all match).
export function isIitxDsaCampus(campus: string): boolean {
  const k = campus.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return /^n(e)?xtwaveinstituteofadvancedtechnology/.test(k) && k.endsWith("dsa");
}

export function productOf(person: ProductInput): string {
  if (person.classification === "excluded_ops_managers" || person.classification === "instructor_ops") return "Support";
  const institutes = person.institutes ?? [];
  if (institutes.some((i) => i.toLowerCase().includes("academy"))) return "Academy";
  const manager = (person.directManager ?? "").toLowerCase();
  // IIT X DSA: the Darwin-manager rule as before, OR (2026-10-24, per request) the DSA campus -- either one is enough.
  if (manager.includes("nw0005864") || manager.includes("jashwanth dandu") || institutes.some(isIitxDsaCampus)) return "IIT X DSA";
  if (institutes.some((i) => i.toLowerCase().includes("intensive"))) return "Intensive";
  if (institutes.includes("Training Institute")) return "NIAT (Training)";
  if (institutes.length === 0) return "NIAT (Training)";
  return "NIAT (Deployed)";
}
