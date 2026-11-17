// One-off, READ-ONLY (2026-11-17, per request: "use the pre-lecture readiness checklist to tell which demos / AI assessments are
// pre-preparedness ones, then show their count, score and hours on the Contribution tab"). Finds the matching rule before we build it.
// For every class in the readiness checklist (last DAYS days, completed): the checklist's demo_evaluations_count / ai_evaluations_count,
// next to how many of that instructor's DEMO / AI_ASSESSMENT recordings (completed, plain types) on the SAME TOPIC were created
// before the class started, under several time windows. The window whose counts match the checklist most often is the rule.
// Topic of a class = session_id of its QA-rated class recording (SCHEDULE row with the same session_section_id), else the session title
// from the schedule table (by session_section_id), compared by name (demoNameKey). Counts and employee-free ids only.
//   pnpm exec tsx src/lib/connectors/_tmp_prep_demo_rule.ts [DAYS=30]
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { QA_RATING_VIEW, demoNameKey } from "./demoTraining";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const days = Number(process.argv.slice(2).filter((a) => a !== "--")[0] ?? 30) || 30;
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const CL = `\`${P}.niat_reverse_etl_bases.niat_pre_lecture_readiness_check_list_details\``;
  const QA = `\`${P}.${DS}.${QA_RATING_VIEW}\``;
  const SC = `\`${P}.${DS}.${SESSION_SCHEDULE_TABLE}\``;

  const [items] = await bq.query({ query: `SELECT checklist_group g, checklist_item i, COUNT(*) n FROM ${CL} GROUP BY 1, 2 ORDER BY 1, 2` });
  console.log("Checklist items: " + (items as Record<string, unknown>[]).map((r) => `${plain(r.g)}/${plain(r.i)}`).join(", "));
  const [scCols] = await bq.query({ query: `SELECT * FROM ${SC} LIMIT 1` });
  const sc = Object.keys((scCols as Record<string, unknown>[])[0] ?? {});
  const scTitle = sc.find((c) => /^session_title$/i.test(c)) ?? sc.find((c) => /title/i.test(c));
  console.log(`Schedule table: section id column ${sc.includes("session_section_id") ? "yes" : "NO"}, title column ${scTitle ?? "NONE"}`);

  const [classes] = await bq.query({ query: `
    WITH c AS (
      SELECT instructor_user_id u, session_section_id s, ANY_VALUE(CAST(session_start_datetime AS STRING)) st, ANY_VALUE(session_type) ty,
        MAX(IF(checklist_item = 'demo_evaluations_count', SAFE_CAST(value AS INT64), NULL)) dn,
        MAX(IF(checklist_item = 'ai_evaluations_count', SAFE_CAST(value AS INT64), NULL)) an
      FROM ${CL} WHERE UPPER(session_status) = 'COMPLETED' AND DATE(session_start_datetime) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
      GROUP BY 1, 2)
    SELECT c.*, q.sid, q.qt${sc.includes("session_section_id") && scTitle ? ", sch.t st_title" : ""}
    FROM c
    LEFT JOIN (SELECT session_section_id, ANY_VALUE(session_id) sid, ANY_VALUE(session_title) qt FROM ${QA} WHERE evaluation_type = 'SCHEDULE' GROUP BY 1) q ON q.session_section_id = c.s
    ${sc.includes("session_section_id") && scTitle ? `LEFT JOIN (SELECT session_section_id, ANY_VALUE(${scTitle}) t FROM ${SC} GROUP BY 1) sch ON sch.session_section_id = c.s` : ""}` });
  const [evs] = await bq.query({ query: `SELECT instructor_user_id u, session_id sid, session_title t, evaluation_type ty, CAST(evaluation_creation_datetime AS STRING) c
    FROM ${QA} WHERE evaluation_type IN ('DEMO', 'AI_ASSESSMENT') AND UPPER(status) = 'COMPLETED'
      AND DATE(evaluation_creation_datetime) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days + 30} DAY)` });

  type E = { sid: string; key: string; ty: string; c: string };
  const byU = new Map<string, E[]>();
  for (const r of evs as Record<string, unknown>[]) {
    const u = plain(r.u); const l = byU.get(u) ?? [];
    l.push({ sid: plain(r.sid), key: demoNameKey(plain(r.t)), ty: plain(r.ty), c: plain(r.c).replace("T", " ").slice(0, 19) }); byU.set(u, l);
  }
  const hours = (a: string, b: string) => (Date.parse(b.replace(" ", "T") + "Z") - Date.parse(a.replace(" ", "T") + "Z")) / 3600000;
  const WINDOWS: [string, (cr: string, st: string) => boolean][] = [
    ["same day, before start", (cr, st) => cr.slice(0, 10) === st.slice(0, 10) && cr < st],
    ["within 24h before", (cr, st) => cr < st && hours(cr, st) <= 24],
    ["within 3 days before", (cr, st) => cr < st && hours(cr, st) <= 72],
    ["within 7 days before", (cr, st) => cr < st && hours(cr, st) <= 168],
    ["any time before", (cr, st) => cr < st],
    ["same day, any time", (cr, st) => cr.slice(0, 10) === st.slice(0, 10)],
  ];
  const all = classes as Record<string, unknown>[];
  let bySid = 0, byTitle = 0, noTopic = 0;
  const score = WINDOWS.map(() => ({ d: 0, a: 0, both: 0, n: 0, dPos: 0, dPosHit: 0 }));
  const misses: string[] = [];
  for (const c of all) {
    const st = plain(c.st).replace("T", " ").slice(0, 19);
    const sid = plain(c.sid);
    const titleKey = demoNameKey(plain(c.qt) || plain(c.st_title));
    if (sid) bySid++; else if (titleKey) byTitle++; else { noTopic++; continue; }
    const mine = (byU.get(plain(c.u)) ?? []).filter((e) => (sid ? e.sid === sid : e.key === titleKey));
    const dn = Number(plain(c.dn)) || 0, an = Number(plain(c.an)) || 0;
    WINDOWS.forEach(([, f], i) => {
      const d = mine.filter((e) => e.ty === "DEMO" && f(e.c, st)).length, a = mine.filter((e) => e.ty === "AI_ASSESSMENT" && f(e.c, st)).length;
      const s = score[i]; s.n++; if (d === dn) s.d++; if (a === an) s.a++; if (d === dn && a === an) s.both++;
      if (dn > 0) { s.dPos++; if (d === dn) s.dPosHit++; }
      if (i === 0 && (d !== dn || a !== an) && misses.length < 12) misses.push(`  class ${st} | topic by ${sid ? "session_id" : "title"} | checklist demo ${dn} ai ${an} | found same-day demo ${d} ai ${a} | her recordings on this topic: ${mine.map((e) => `${e.ty === "DEMO" ? "D" : "AI"} ${e.c}`).join(", ") || "none"}`);
    });
  }
  console.log(`\nClasses (completed, last ${days} days): ${all.length} | topic from class recording ${bySid} | from title ${byTitle} | no topic ${noTopic}`);
  console.log("Window -> classes where our count equals the checklist (demo / AI / both) | of classes the checklist says had 1+ demo, how many we match");
  WINDOWS.forEach(([name], i) => { const s = score[i]; const pc = (x: number, n: number) => (n ? `${Math.round((x / n) * 100)}%` : "-");
    console.log(`  ${name.padEnd(24)} demo ${pc(s.d, s.n)}  AI ${pc(s.a, s.n)}  both ${pc(s.both, s.n)} | 1+ demo classes ${pc(s.dPosHit, s.dPos)} of ${s.dPos}`); });
  console.log("\nSome classes that do NOT match under 'same day, before start':"); misses.forEach((m) => console.log(m));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
