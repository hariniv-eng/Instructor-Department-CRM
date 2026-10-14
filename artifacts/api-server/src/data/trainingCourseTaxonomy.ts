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
export type TrainingTrackGroup = "Frontend Development" | "Backend Development" | "DSA" | "Gen AI" | "DSML" | "Aptitude" | "Maths" | "English";

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
  // Course ids (2026-10-14, per request: match the Faculty-ops app, which finds every course by its course_id). When set, a unit
  // row also counts toward this column if its course id column holds one of these ids (hyphens/case ignored). Used together with
  // courseTitles: either way of matching is enough. Ignored (titles only) when the table has no course id column.
  courseIds?: string[];
};

// A column is "resolved" (queried, shows real data) when it has course titles OR course ids.
export const isResolvedCourse = (c: TrainingCourseDef): boolean => c.courseTitles.length > 0 || (c.courseIds?.length ?? 0) > 0;

export const TRAINING_COURSE_TAXONOMY: TrainingCourseDef[] = [
  // --- Frontend Development ---
  { key: "static_web", courseIds: ["6d41f35076d543379be03fe0b26b1b26"], label: "Static Web", trackGroup: "Frontend Development", courseTitles: ["Build Your Own Static Website"] },
  { key: "responsive_design", courseIds: ["62e43c70ee744afe8d1c26ca9c22947a"], label: "Responsive Design", trackGroup: "Frontend Development", courseTitles: ["Build Your Own Responsive Website"] },
  { key: "modern_responsive_ui", courseIds: ["1d571a66be1e49cda17f5b3b22d6d751"], label: "Modern Responsive UI", trackGroup: "Frontend Development", courseTitles: ["Modern Responsive Web Design"] },
  { key: "javascript_sprint", label: "JavaScript Sprint", trackGroup: "Frontend Development", courseTitles: ["JavaScript Quick Revision"] },
  { key: "javascript_essentials", courseIds: ["7e0446da981d4faab02df4dc605dba66"], label: "JavaScript Essentials", trackGroup: "Frontend Development", courseTitles: ["JS Essentials", "JavaScript Essentials"] },
  { key: "react_js", courseIds: ["f7b58b9d1a424a6681020bad28f37483"], label: "React JS", trackGroup: "Frontend Development", courseTitles: ["React JS", "Introduction to React JS"] },
  // --- Backend Development ---
  { key: "python", courseIds: ["b76ff0b83180494fa9a80e89c56421b1"], label: "Python", trackGroup: "Backend Development", courseTitles: ["Python Programming"] },
  { key: "sql", courseIds: ["d3cb79d46f31424cb0f8cddbdf68659f"], label: "SQL", trackGroup: "Backend Development", courseTitles: ["SQL"] },
  { key: "node_js", courseIds: ["d82d6905669442c48c0cbd2c887c1b53"], label: "Node JS", trackGroup: "Backend Development", courseTitles: ["Node JS"] },
  { key: "mongodb", courseIds: ["a5777f9b1a9c42a5aab70182e80efca2"], label: "MongoDB", trackGroup: "Backend Development", courseTitles: ["MongoDB", "Mongo DB"] },
  { key: "developer_foundation", courseIds: ["33a457452b2a4d60bc1683ca731081f3"], label: "Developer Foundation", trackGroup: "Backend Development", courseTitles: ["Developer Foundations"] },
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
    // Found by course_id (the title below is a backup if the id column is ever missing).
    courseIds: ["bb04e38a723e4bbfbf99ec43992bb31c"],
    // 2026-10-14, per request ("do the same" as the Faculty-ops app): DSA is the "DSA Foundation" course -- the course whose id
    // bb04e38a... Faculty-ops uses, confirmed live (15 topics, 671 instructors, ~199k unit rows). The earlier mapping
    // (Phase 1-3 courses, filtered to a topic list, ~290 rows company-wide) was the wrong source, so DSA instructors showed
    // "no data". DIA and IPS below keep their Phase topic lists; Faculty-ops has no course id for them.
    courseTitles: ["DSA Foundation"],
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
  { key: "gen_ai", courseIds: ["b9811b34585b47e0a0be65f1081a74f2"], label: "Gen AI", trackGroup: "Gen AI", courseTitles: ["Generative AI", "Intro to Generative AI"] },
  { key: "llm", courseIds: ["8874b64282db42748d71b9940316db8d"], label: "LLM", trackGroup: "Gen AI", courseTitles: ["Building LLM Applications", "Building LLM Applications Part - 2", "Building  LLM  Applications"] },
  { key: "ai_for_finance", courseIds: ["85dac56985f54205b71ae86327f39b92"], label: "AI for Finance", trackGroup: "Gen AI", courseTitles: ["AI for Finance"] },
  // --- DSML ---
  { key: "ml", courseIds: ["919bb576966a48dfa1e0b8b071fc7f69"], label: "ML", trackGroup: "DSML", courseTitles: [] },
  { key: "supervised_learning", label: "Supervised Learning", trackGroup: "DSML", courseTitles: ["Supervised Learning: Regression", "Supervised Learning: Classification"] },
  { key: "deep_learning", courseIds: ["8347d32f770a49579696335a4eec5828"], label: "Deep Learning", trackGroup: "DSML", courseTitles: ["Introduction to Deep Learning and ANN", "Introduction to Deep Learning"] },
  { key: "ml_projects", courseIds: ["611beb92cdf746fd8f4a8b794dbc7b71"], label: "ML Projects", trackGroup: "DSML", courseTitles: ["Machine Learning & AI Projects"] },
  { key: "nlp", courseIds: ["74536befa3df4e8aa2958b727fa2f2b6"], label: "NLP", trackGroup: "DSML", courseTitles: ["Introduction to Natural Language Processing"] },
  { key: "data_foundation", courseIds: ["58aeb728b2524b0897c478cb22e8acdc"], label: "Data Foundation", trackGroup: "DSML", courseTitles: [] },
  // --- Aptitude ---
  // Added 2026-09-24 per request ("we only have tech instructors related
  // data, now we need to also get the aptitude, math and also english") --
  // Ankush shared the exact 7-column reference (4 Aptitude + 3 Math), same
  // population as Tech (Instructors + Mentors, confirmed 2026-09-24 -- no
  // separate classification/department filter needed). Rendered as its own
  // "Aptitude" tab on the Training Stats page, not mixed into the Tech
  // table. Advanced Aptitude combines two spelling variants found in the
  // data ("Advanced Aptitude" / "Advance Aptitude") -- same near-duplicate
  // pattern as MongoDB/Mongo DB or JS Essentials/JavaScript Essentials.
  { key: "quantitative_aptitude", courseIds: ["97671af2f44f4eed978cd65d5c0c55c9"], label: "Quantitative Aptitude", trackGroup: "Aptitude", courseTitles: ["Quantitative Aptitude"] },
  { key: "numerical_ability", courseIds: ["0bbea1fb25bc402db0d472112198d5da"], label: "Numerical Ability", trackGroup: "Aptitude", courseTitles: ["Numerical Ability"] },
  { key: "logical_reasoning", courseIds: ["ef795b8b487e44b38acc3b8a28353043"], label: "Logical Reasoning", trackGroup: "Aptitude", courseTitles: ["Logical Reasoning"] },
  { key: "advanced_aptitude", courseIds: ["8024ea95e38e40f89664aaada968168f"], label: "Advanced Aptitude", trackGroup: "Aptitude", courseTitles: ["Advanced Aptitude", "Advance Aptitude"] },
  // --- Math ---
  // Added 2026-09-24, same request/population as Aptitude above. "Math for
  // Computer Science" combines 4 near-duplicate course_title variants found
  // in the data, including one with a "- AU" suffix that may be a
  // campus/program-specific variant rather than a true duplicate -- flagged
  // to Ankush, included for now, easy to split out if it turns out wrong.
  // "Probability and Statistics" similarly combines 3 spelling/punctuation
  // variants ("(P&S)" suffix, "&" vs "and").
  { key: "math_for_cs", courseIds: ["70850c6b459c4134a16c3e42d46eb794"], label: "Mathematics for Computer Science", trackGroup: "Maths", courseTitles: ["Math For Computer Science", "Mathematics For Computer Science - AU", "Math for CSE", "Mathematics for Computer Science"] },
  { key: "probability_statistics", courseIds: ["39ddb075b7e8448abac2b89baa4fb3f4"], label: "Probability and Statistics", trackGroup: "Maths", courseTitles: ["Probability and Statistics(P&S)", "Probability and Statistics", "Probability & Statistics"] },
  { key: "linear_algebra_calculus", label: "Linear Algebra and Calculus", trackGroup: "Maths", courseTitles: ["Linear Algebra and Calculus"] },
  // --- English (2026-10-14, per request: track English learning ONLY for English instructors) ---
  // Same four courses the Faculty-ops app uses for its English tab, found by course id (titles are the BigQuery
  // spellings confirmed with _tmp_course_id_check.ts). The Training Stats English tab lists only instructors whose
  // subject area is English, so these columns never show for Tech or Maths instructors.
  { key: "english_foundation", courseIds: ["968bccdcf5e04348af889db506d49c9a"], label: "Communicative English Foundation", trackGroup: "English", courseTitles: ["Communicative English Foundation- I", "Communicative English Foundation"] },
  { key: "english_advanced", courseIds: ["bfd0a2efeb934e4bbc1c9acac895d6a4"], label: "Communicative English Advanced", trackGroup: "English", courseTitles: ["Communicative English Advanced"] },
  { key: "english_applied", courseIds: ["e27acac864114f34abdeec3948e91e96"], label: "Communicative English Applied", trackGroup: "English", courseTitles: ["Applied Communicative English", "Communicative English Applied"] },
  { key: "language_analytics", courseIds: ["7288e9d8992549758490a8a87b8b3dd9"], label: "Language Analytics", trackGroup: "English", courseTitles: ["Language Analytics"] },
];

export function resolvedCourseDefs(): TrainingCourseDef[] {
  return TRAINING_COURSE_TAXONOMY.filter(isResolvedCourse);
}

export function pendingCourseKeys(): string[] {
  return TRAINING_COURSE_TAXONOMY.filter((c) => !isResolvedCourse(c)).map((c) => c.key);
}
