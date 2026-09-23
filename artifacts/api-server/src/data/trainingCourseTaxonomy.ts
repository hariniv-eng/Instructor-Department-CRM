// The fixed 25-column course taxonomy for the "Training Stats" tab (2026-09-
// 23, per request, matching a reference sheet Ankush shared: Employee ID /
// Name / Department / Capability Manager / Primary Track / Secondary Track,
// then 5 track groups -- Frontend Development, Backend Development, DSA,
// Gen AI, DSML -- each with several named course columns).
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
};

export const TRAINING_COURSE_TAXONOMY: TrainingCourseDef[] = [
  // --- Frontend Development ---
  { key: "static_web", label: "Static Web", trackGroup: "Frontend Development", courseTitles: ["Build Your Own Static Website"] },
  { key: "responsive_design", label: "Responsive Design", trackGroup: "Frontend Development", courseTitles: ["Build Your Own Responsive Website"] },
  { key: "modern_responsive_ui", label: "Modern Responsive UI", trackGroup: "Frontend Development", courseTitles: ["Modern Responsive Web Design"] },
  { key: "javascript_sprint", label: "JavaScript Sprint", trackGroup: "Frontend Development", courseTitles: [] },
  { key: "javascript_essentials", label: "JavaScript Essentials", trackGroup: "Frontend Development", courseTitles: ["JS Essentials", "JavaScript Essentials"] },
  { key: "react_js", label: "React JS", trackGroup: "Frontend Development", courseTitles: ["React JS", "Introduction to React JS"] },
  { key: "frontend_projects", label: "Frontend Projects", trackGroup: "Frontend Development", courseTitles: [] },
  // --- Backend Development ---
  { key: "python", label: "Python", trackGroup: "Backend Development", courseTitles: ["Python Programming"] },
  { key: "sql", label: "SQL", trackGroup: "Backend Development", courseTitles: ["SQL"] },
  { key: "node_js", label: "Node JS", trackGroup: "Backend Development", courseTitles: ["Node JS"] },
  { key: "mongodb", label: "MongoDB", trackGroup: "Backend Development", courseTitles: ["MongoDB", "Mongo DB"] },
  { key: "developer_foundation", label: "Developer Foundation", trackGroup: "Backend Development", courseTitles: ["Developer Foundations"] },
  { key: "backend_projects", label: "Backend Projects", trackGroup: "Backend Development", courseTitles: [] },
  // --- DSA ---
  { key: "dsa", label: "DSA", trackGroup: "DSA", courseTitles: [] },
  { key: "dia", label: "DIA", trackGroup: "DSA", courseTitles: [] },
  { key: "ips", label: "IPS", trackGroup: "DSA", courseTitles: [] },
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
