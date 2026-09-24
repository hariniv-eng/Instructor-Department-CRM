// The course taxonomy for the "Training Stats" tab (2026-09-23, per request,
// matching a reference sheet Ankush shared: Employee ID / Name / Department /
// Capability Manager / Primary Track / Secondary Track, then 5 track groups
// -- Frontend Development, Backend Development, DSA, Gen AI, DSML -- each
// with several named course columns). Originally 25 columns; "Frontend
// Projects" and "Backend Projects" were removed on 2026-09-23 per request
// (both were still unmapped pending columns, never resolved), leaving 23.
//
// Each entry's `courseTitles` is the set of REAL course_title values (from
// niat_instructor_unit_wise_completion_and_best_attempt_details, confirmed
// live via check:instructor-learning-column) that roll up into that one
// column. Several are near-duplicate titles in the source data (e.g. "React
// JS" + "Introduction to React JS", "MongoDB" + "Mongo DB") that combine
// into a single tracked status per instructor.
//
// courseTitles: [] means NO confident mapping exists yet -- these render as
// "Mapping pending" on the Training Stats page for every instructor,
// regardless of any real data, until confirmed. Do NOT guess a mapping here
// without confirming first; see Instructor_Learning_Status_Course_Mapping_
// Review.xlsx (sent 2026-09-23) for the full candidate list per column and
// why each pending one is unresolved. Per request (2026-09-23): "Build now,
// mark pending" -- ship with what's confirmed, fill in the rest once
// answered.
export type TrainingTrackGroup = "Frontend Development" | "Backend Development" | "DSA" | "Gen AI" | "DSML";

export type TrainingCourseDef = {
  key: string;
  label: string;
  trackGroup: TrainingTrackGroup;
  courseTitles: string[];
  // Optional further restriction (2026-09-24, added for DSA/DIA/IPS): when
  // set, a row only counts toward this column if its topic_title is ALSO in
  // this list, in addition to matching courseTitles. Needed when a single
  // course_title's content actually splits across more than one of our
  // columns -- e.g. "Phase 2: Algorithmic Foundations" contains both DSA
  // topics (Sorting, Binary Search, Mathematics - I) and DIA topics (Prefix
  // Sums & Two Pointers), so courseTitles alone can't separate them.
  topicTitles?: string[];
};

export const TRAINING_COURSE_TAXONOMY: TrainingCourseDef[] = [
  // --- Frontend Development ---
  { key: "static_web", label: "Static Web", trackGroup: "Frontend Development", courseTitles: ["Build Your Own Static Website"] },
  { key: "responsive_design", label: "Responsive Design", trackGroup: "Frontend Development", courseTitles: ["Build Your Own Responsive Website"] },
  { key: "modern_responsive_ui", label: "Modern Responsive UI", trackGroup: "Frontend Development", courseTitles: ["Modern Responsive Web Design"] },
  { key: "javascript_sprint", label: "JavaScript Sprint", trackGroup: "Frontend Development", courseTitles: ["JavaScript Quick Revision"] },
  { key: "javascript_essentials", label: "JavaScript Essentials", trackGroup: "Frontend Development", courseTitles: ["JS Essentials", "JavaScript Essentials"] },
  { key: "react_js", label: "React JS", trackGroup: "Frontend Development", courseTitles: ["React JS", "Introduction to React JS"] },
  // --- Backend Development ---
  { key: "python", label: "Python", trackGroup: "Backend Development", courseTitles: ["Python Programming"] },
  { key: "sql", label: "SQL", trackGroup: "Backend Development", courseTitles: ["SQL"] },
  { key: "node_js", label: "Node JS", trackGroup: "Backend Development", courseTitles: ["Node JS"] },
  { key: "mongodb", label: "MongoDB", trackGroup: "Backend Development", courseTitles: ["MongoDB", "Mongo DB"] },
  { key: "developer_foundation", label: "Developer Foundation", trackGroup: "Backend Development", courseTitles: ["Developer Foundations"] },
  // --- DSA ---
  // DSA / DIA / IPS (2026-09-24, reverted back to these 3 names per request
  // after briefly trying 4 columns matching the raw phase structure). The
  // real curriculum's 4 phases don't align 1:1 with these 3 names -- their
  // content is interleaved (e.g. "Phase 2: Algorithmic Foundations" has both
  // DSA topics like Sorting/Binary Search/Math AND a DIA topic, Prefix Sums
  // & Two Pointers; "Phase 3: Data Structures & Discrete Math" mixes a DSA
  // topic, Recursion and Backtracking/Bit Manipulation, with a DIA one,
  // Stack & Queue). So each of these 3 columns is scoped to specific
  // topic_title values WITHIN one or more phase course_titles (via the new
  // optional topicTitles field above), based on Ankush's own module
  // breakdown for each (2026-09-24):
  //   DSA = Module I (C++/STL), Module II (Math), Module IV (Sorting/
  //     Searching), Module V (Bit Manipulation) -> Phase 1's C++/STL topics
  //     + Phase 2's Sorting/Binary Search/Mathematics-I + Phase 3's
  //     Recursion and Backtracking/Bit Manipulation.
  //   DIA = Module I (Hashing/Sliding Window/Two-Pointer), Module III
  //     (Stacks & Queues) -> Phase 2's Prefix Sums & Two Pointers + Phase
  //     3's Stack & Queue and Advanced Counting & Ordering (closest existing
  //     match to Hashing/counting-style techniques). NOTE: Ankush's DIA also
  //     covered Module II (Linked Lists), Module IV (Trees & BST), and
  //     Module V (Heaps) -- none of that content exists anywhere in this
  //     table yet under any course_title, so DIA will under-represent those
  //     topics entirely until the curriculum adds them.
  //   IPS = Module II/III (Dynamic Programming), Module IV/V (Graphs) ->
  //     Phase 4's Dynamic Programming + Graphs topics. NOTE: Ankush's IPS
  //     also covered Module I (Greedy Algorithms) -- no Greedy-related
  //     topic_title exists anywhere in the table yet, so IPS is missing that
  //     slice of content too.
  // Row counts for all 4 phases are still small company-wide (135/21/23/112
  // total rows at mapping time) -- an early-stage rollout, so expect mostly
  // "No data" until more instructors are assigned this curriculum.
  {
    key: "dsa",
    label: "DSA",
    trackGroup: "DSA",
    courseTitles: ["Phase 1: Programming Foundations in C++", "Phase 2: Algorithmic Foundations", "Phase 3: Data Structures & Discrete Math"],
    topicTitles: ["Introduction to Programming with C++", "The C++ Standard Template Library", "Mathematics - I", "Sorting", "Binary Search", "Recursion and Backtracking", "Bit Manipulation"],
  },
  {
    key: "dia",
    label: "DIA",
    trackGroup: "DSA",
    courseTitles: ["Phase 2: Algorithmic Foundations", "Phase 3: Data Structures & Discrete Math"],
    topicTitles: ["Prefix Sums & Two Pointers", "Stack & Queue", "Advanced Counting & Ordering"],
  },
  {
    key: "ips",
    label: "IPS",
    trackGroup: "DSA",
    courseTitles: ["Phase 4: Dynamic Programming & Graph Theory"],
    topicTitles: ["Dynamic Programming", "Graphs"],
  },
  // --- Gen AI ---
  { key: "gen_ai", label: "Gen AI", trackGroup: "Gen AI", courseTitles: ["Generative AI", "Intro to Generative AI"] },
  { key: "llm", label: "LLM", trackGroup: "Gen AI", courseTitles: ["Building LLM Applications", "Building LLM Applications Part - 2", "Building  LLM  Applications"] },
  { key: "ai_for_finance", label: "AI for Finance", trackGroup: "Gen AI", courseTitles: ["AI for Finance"] },
  // --- DSML ---
  { key: "ml", label: "ML", trackGroup: "DSML", courseTitles: [] },
  { key: "supervised_learning", label: "Supervised Learning", trackGroup: "DSML", courseTitles: ["Supervised Learning: Regression", "Supervised Learning: Classification"] },
  { key: "deep_learning", label: "Deep Learning", trackGroup: "DSML", courseTitles: ["Introduction to Deep Learning and ANN", "Introduction to Deep Learning"] },
  { key: "ml_projects", label: "ML Projects", trackGroup: "DSML", courseTitles: ["Machine Learning & AI Projects"] },
  { key: "nlp", label: "NLP", trackGroup: "DSML", courseTitles: ["Introduction to Natural Language Processing"] },
  { key: "data_foundation", label: "Data Foundation", trackGroup: "DSML", courseTitles: [] },
];

export function resolvedCourseDefs(): TrainingCourseDef[] {
  return TRAINING_COURSE_TAXONOMY.filter((c) => c.courseTitles.length > 0);
}

export function pendingCourseKeys(): string[] {
  return TRAINING_COURSE_TAXONOMY.filter((c) => c.courseTitles.length === 0).map((c) => c.key);
}
