// One-off, READ-ONLY (2026-10-14): compares the Faculty-ops course_id mapping with OUR course_title mapping. For each
// Faculty-ops training column it prints the course_id, then the course_title(s), topic count, instructors and unit rows found
// in our unit-completion table. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_course_id_check.ts
import { inspectCourseIds } from "./instructorLearningStatus";

const FACULTY_OPS_IDS: Record<string, string> = {
  "AI for Finance": "85dac56985f54205b71ae86327f39b92", "Advanced Aptitude": "8024ea95e38e40f89664aaada968168f",
  "Communicative English Foundation": "968bccdcf5e04348af889db506d49c9a", "Communicative English Advanced": "bfd0a2efeb934e4bbc1c9acac895d6a4",
  "Communicative English Applied": "e27acac864114f34abdeec3948e91e96", "DSA": "bb04e38a723e4bbfbf99ec43992bb31c",
  "Data Foundation": "58aeb728b2524b0897c478cb22e8acdc", "Deep Learning": "8347d32f770a49579696335a4eec5828",
  "Developer Foundation": "33a457452b2a4d60bc1683ca731081f3", "Gen AI": "b9811b34585b47e0a0be65f1081a74f2",
  "JavaScript Essentials": "7e0446da981d4faab02df4dc605dba66", "LLM": "8874b64282db42748d71b9940316db8d",
  "Language Analytics": "7288e9d8992549758490a8a87b8b3dd9", "Logical Reasoning": "ef795b8b487e44b38acc3b8a28353043",
  "ML": "919bb576966a48dfa1e0b8b071fc7f69", "ML Projects": "611beb92cdf746fd8f4a8b794dbc7b71",
  "Mathematics for Computer Science": "70850c6b459c4134a16c3e42d46eb794", "Modern Responsive UI": "1d571a66be1e49cda17f5b3b22d6d751",
  "MongoDB": "a5777f9b1a9c42a5aab70182e80efca2", "NLP": "74536befa3df4e8aa2958b727fa2f2b6", "Node JS": "d82d6905669442c48c0cbd2c887c1b53",
  "Numerical Ability": "0bbea1fb25bc402db0d472112198d5da", "Probability and Statistics": "39ddb075b7e8448abac2b89baa4fb3f4",
  "Python": "b76ff0b83180494fa9a80e89c56421b1", "Quantitative Aptitude": "97671af2f44f4eed978cd65d5c0c55c9",
  "React JS": "f7b58b9d1a424a6681020bad28f37483", "Responsive Design": "62e43c70ee744afe8d1c26ca9c22947a",
  "SQL": "d3cb79d46f31424cb0f8cddbdf68659f", "Static Web": "6d41f35076d543379be03fe0b26b1b26",
};

async function main() {
  const { idColumn, columns, rows } = await inspectCourseIds(Object.values(FACULTY_OPS_IDS));
  console.log(`Columns in our unit-completion table: ${columns.join(", ")}`);
  console.log(`Course id column used: ${idColumn ?? "NONE FOUND"}\n`);
  if (!idColumn) { console.log("Our table has no course id column, so the course_id mapping cannot be used directly."); process.exit(0); }
  const labelById = new Map(Object.entries(FACULTY_OPS_IDS).map(([label, id]) => [id.toLowerCase(), label]));
  for (const [label, id] of Object.entries(FACULTY_OPS_IDS)) {
    const mine = rows.filter((r) => String(r.course_id) === id.toLowerCase());
    console.log(`${label}  [${id}]`);
    if (mine.length === 0) console.log("   not found in our table");
    for (const r of mine) console.log(`   course_title: "${r.course_title}" | topics ${r.topics} | instructors ${r.instructors} | unit rows ${r.unit_rows} | completed rows ${r.completed_rows}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
