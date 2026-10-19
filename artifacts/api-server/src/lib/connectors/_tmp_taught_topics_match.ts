// One-off, READ-ONLY (2026-10-19, per request): planning a SECOND Training Stats table built from what instructors have TAUGHT
// (completed teaching sessions) instead of what they finished in the learning portal. Before building it we need to know whether
// a training course's topics can be matched to teaching sessions at all. Teaching sessions carry a session_title (e.g.
// "Significance of Communication Skills"); training courses are made of topics (topic_title in the unit-completion table).
// For every tracked training course (trainingCourseTaxonomy.ts) this prints how many of its topics match a completed
// Lecture/Practice session title (all time, any instructor), which teaching courses those sessions came from, and examples of
// topics that matched nothing. Matching: lower case, letters/digits only; "exact" = same text, "partial" = one contains the other.
// Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_taught_topics_match.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const show = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const defs = TRAINING_COURSE_TAXONOMY.filter((d) => d.courseTitles.length || d.courseIds?.length);
  const ids = [...new Set(defs.flatMap((d) => d.courseIds ?? []).map((i) => i.replace(/-/g, "").toLowerCase()))];
  const titles = [...new Set(defs.flatMap((d) => d.courseTitles))];

  const [topicRows] = await bq.query({
    query: `SELECT REPLACE(LOWER(course_id), '-', '') AS cid, course_title, topic_title, MIN(course_unit_order) AS ord
            FROM \`${ds}.${UNIT_COMPLETION_TABLE}\`
            WHERE (REPLACE(LOWER(course_id), '-', '') IN UNNEST(@ids) OR course_title IN UNNEST(@titles)) AND topic_title IS NOT NULL
            GROUP BY 1, 2, 3`,
    params: { ids, titles },
  });
  const [sessionRows] = await bq.query({
    query: `SELECT session_title, ANY_VALUE(learning_portal_course_title) AS course, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS ins
            FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
            WHERE session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE') AND session_title IS NOT NULL
            GROUP BY 1`,
  });
  const sessions = (sessionRows as Record<string, unknown>[]).map((r) => ({ title: show(r.session_title), key: norm(show(r.session_title)), course: show(r.course), n: Number(show(r.n)), ins: Number(show(r.ins)) })).filter((s) => s.key.length >= 4);
  const byKey = new Map(sessions.map((s) => [s.key, s]));
  console.log(`Distinct completed Lecture/Practice session titles (all time): ${sessions.length}\n`);

  let allTopics = 0, allExact = 0, allPartial = 0;
  for (const def of defs) {
    const defIds = new Set((def.courseIds ?? []).map((i) => i.replace(/-/g, "").toLowerCase()));
    const topics = new Map<string, { title: string; ord: number }>();
    for (const r of topicRows as Record<string, unknown>[]) {
      if (!(defIds.has(show(r.cid)) || def.courseTitles.includes(show(r.course_title)))) continue;
      const t = show(r.topic_title);
      if (def.topicTitles && !def.topicTitles.includes(t)) continue;
      const k = norm(t);
      if (k && !topics.has(k)) topics.set(k, { title: t, ord: Number(show(r.ord)) });
    }
    let exact = 0, partial = 0;
    const fromCourses = new Map<string, number>();
    const missing: string[] = [];
    for (const [k, t] of [...topics].sort((a, b) => a[1].ord - b[1].ord)) {
      let hit = byKey.get(k);
      if (hit) exact++;
      else {
        hit = sessions.find((s) => (k.length >= 6 && s.key.includes(k)) || (s.key.length >= 6 && k.includes(s.key)));
        if (hit) partial++;
        else missing.push(t.title);
      }
      if (hit) fromCourses.set(hit.course || "(no course)", (fromCourses.get(hit.course || "(no course)") ?? 0) + 1);
    }
    allTopics += topics.size; allExact += exact; allPartial += partial;
    const pct = topics.size ? Math.round(((exact + partial) / topics.size) * 100) : 0;
    console.log(`[${def.trackGroup}] ${def.label}: ${topics.size} topics | exact ${exact} | partial ${partial} | none ${missing.length} | matched ${pct}%`);
    if (fromCourses.size) console.log(`    taught under: ${[...fromCourses].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${c} (${n})`).join("; ")}`);
    if (missing.length) console.log(`    no session match, e.g.: ${missing.slice(0, 6).join(" | ")}`);
  }
  console.log(`\nALL tracked courses: ${allTopics} topics | exact ${allExact} | partial ${allPartial} | none ${allTopics - allExact - allPartial}`);
  // Most-taught session titles, to see what session titles look like.
  console.log(`\nTop 25 session titles by sessions (title | teaching course | sessions | instructors):`);
  for (const s of [...sessions].sort((a, b) => b.n - a.n).slice(0, 25)) console.log(`  ${s.title} | ${s.course} | ${s.n} | ${s.ins}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
