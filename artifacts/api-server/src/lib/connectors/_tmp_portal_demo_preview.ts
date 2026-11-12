// One-off, READ-ONLY (2026-11-07, per request: "take every learning-portal course, get its total number of lecture sessions from the portal,
// and count how many of those sessions each instructor gave demos / AI assessments on -- for Frontend, Backend, Gen AI, everything").
// Before changing the Demos tab, this shows what the portal can give:
//   1. per Training - LP course (trainingCourseTaxonomy.ts): number of topics, and units per unit_type -- to decide what counts as one
//      "lecture session" in the portal (a topic? a unit of some type?)
//   2. how many completed demos / AI assessments (company-wide) match a portal unit title or topic title of each course, compared with
//      today's matching against the lecture list
//   3. the most common demo topic names that match nothing in the portal
//   4. the first 30 units of one course with their type, to look at (default: Static Web; pass a course key to see another)
// Only course / topic names are printed -- no staff names. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_portal_demo_preview.ts
//   pnpm exec tsx src/lib/connectors/_tmp_portal_demo_preview.ts javascript_essentials
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { QA_RATING_VIEW, demoNameKey, lectureNameIndex, matchDemoTopic } from "./demoTraining";
import { TRAINING_COURSE_TAXONOMY, isResolvedCourse } from "../../data/trainingCourseTaxonomy";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const idKey = (s: string) => s.replace(/-/g, "").toLowerCase();

async function main() {
  const showKey = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "static_web").trim();
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = (t: string) => `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${t}\``;

  // Every distinct portal unit (no instructor columns).
  const [units] = await bq.query({ query: `
    SELECT ${"REPLACE(LOWER(CAST(course_id AS STRING)), '-', '')"} AS cid, ANY_VALUE(course_title) AS ct, ANY_VALUE(topic_title) AS tt,
           unit_id AS uid, ANY_VALUE(unit_title) AS ut, ANY_VALUE(CAST(unit_type AS STRING)) AS ty, MIN(course_unit_order) AS ord
    FROM ${T(UNIT_COMPLETION_TABLE)} GROUP BY cid, uid` });

  // Same rule as the Training - LP tab: topic-restricted columns (DAA, IPS) claim their units first.
  const topicOnly = (c: (typeof TRAINING_COURSE_TAXONOMY)[number]) => Number(!!c.topicTitles?.length && !c.courseIds?.length);
  const defs = TRAINING_COURSE_TAXONOMY.filter(isResolvedCourse).sort((a, b) => topicOnly(b) - topicOnly(a));
  const courseOf = (cid: string, ct: string, tt: string): string | null => {
    for (const d of defs) {
      const byTitle = d.courseTitles.includes(ct) && (!d.topicTitles?.length || d.topicTitles.includes(tt));
      const byId = (d.courseIds ?? []).map(idKey).includes(cid) && (!d.topicTitles?.length || d.courseTitles.length > 0 || d.topicTitles.includes(tt));
      if (byTitle || byId) return d.key;
    }
    return null;
  };
  type C = { topics: Set<string>; types: Map<string, number>; unitKeys: Set<string>; topicKeys: Set<string>; list: { ord: number; tt: string; ut: string; ty: string }[] };
  const per = new Map<string, C>();
  for (const r of units as Record<string, unknown>[]) {
    const k = courseOf(plain(r.cid), plain(r.ct), plain(r.tt));
    if (!k) continue;
    const c: C = per.get(k) ?? { topics: new Set<string>(), types: new Map<string, number>(), unitKeys: new Set<string>(), topicKeys: new Set<string>(), list: [] };
    c.topics.add(plain(r.tt));
    c.types.set(plain(r.ty) || "(blank)", (c.types.get(plain(r.ty) || "(blank)") ?? 0) + 1);
    if (plain(r.ut)) c.unitKeys.add(demoNameKey(plain(r.ut)));
    if (plain(r.tt)) c.topicKeys.add(demoNameKey(plain(r.tt)));
    c.list.push({ ord: Number(plain(r.ord)) || 0, tt: plain(r.tt), ut: plain(r.ut), ty: plain(r.ty) });
    per.set(k, c);
  }

  // Completed demos / AI assessments, grouped by topic name.
  const [titles] = await bq.query({ query: `
    SELECT session_title AS t, IF(evaluation_type LIKE '%AI_ASSESSMENT', 'ai', 'demo') AS kind, COUNT(*) AS n
    FROM ${T(QA_RATING_VIEW)}
    WHERE evaluation_type IN ('DEMO', 'TRAINING_DEMO', 'AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT') AND LOWER(status) = 'completed' AND session_title IS NOT NULL
    GROUP BY 1, 2` });
  const idx = lectureNameIndex();
  const match = new Map<string, { unit: number; topic: number }>();
  let total = 0, portalHit = 0, listHit = 0;
  const unmatched = new Map<string, number>();
  for (const r of titles as Record<string, unknown>[]) {
    const t = plain(r.t), n = Number(plain(r.n)), k = demoNameKey(t);
    total += n;
    if (matchDemoTopic(idx, t)) listHit += n;
    let hit = false;
    for (const [key, c] of per) {
      const byUnit = c.unitKeys.has(k), byTopic = !byUnit && c.topicKeys.has(k);
      if (!byUnit && !byTopic) continue;
      hit = true;
      const m = match.get(key) ?? { unit: 0, topic: 0 };
      if (byUnit) m.unit += n; else m.topic += n;
      match.set(key, m);
    }
    if (hit) portalHit += n; else unmatched.set(t, (unmatched.get(t) ?? 0) + n);
  }

  console.log(`Portal units read: ${(units as unknown[]).length}\n`);
  console.log("course key | label | topics | units by type | demos+AI matching a unit title | ... matching only a topic title");
  for (const d of defs) {
    const c = per.get(d.key), m = match.get(d.key);
    console.log(`  ${d.key} | ${d.label} | ${c?.topics.size ?? 0} | ${c ? [...c.types].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", ") : "not in portal"} | ${m?.unit ?? 0} | ${m?.topic ?? 0}`);
  }
  const pct = (x: number) => (total ? `${Math.round((x / total) * 100)}%` : "-");
  console.log(`\nCompleted demos + AI assessments: ${total}`);
  console.log(`  match the lecture list today: ${listHit} (${pct(listHit)})`);
  console.log(`  match a portal unit / topic name of some course: ${portalHit} (${pct(portalHit)})`);
  console.log(`\nTop 40 topic names matching nothing in the portal (demos + AI):`);
  for (const [t, n] of [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${n} | ${t}`);

  const show = per.get(showKey);
  console.log(`\nFirst 30 portal units of ${showKey} (order | topic | unit | type):`);
  for (const u of (show?.list ?? []).sort((a, b) => a.ord - b.ord).slice(0, 30)) console.log(`  ${u.ord} | ${u.tt} | ${u.ut} | ${u.ty}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
