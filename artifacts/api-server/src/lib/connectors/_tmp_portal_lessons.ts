// One-off, READ-ONLY (2026-10-23, per request: "confirm the number of sessions per course"). Prints the CLASS SESSIONS (lessons) the
// "Taught in class" view now counts for each learning-portal course -- the total every instructor is measured against -- with the
// course version used. Give course keys to limit it (default: Static Web, Responsive Design, Modern Responsive UI); "all" = every course.
// Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_portal_lessons.ts
//   pnpm exec tsx src/lib/connectors/_tmp_portal_lessons.ts all        (every course; also writes ~/workspace/portal_course_sessions.csv)
import { writeFileSync } from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { buildSessionTitleMap } from "./taughtTraining";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const cid = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
  const { lectures } = await buildSessionTitleMap(bq, ds, cid);
  const keys = args[0] === "all" ? TRAINING_COURSE_TAXONOMY.map((d) => d.key) : args.length ? args : ["static_web", "responsive_design", "modern_responsive_ui"];
  const csv: string[] = ["Track,Course,Course key,Course version,No.,Class session"];
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  for (const key of keys) {
    const def = TRAINING_COURSE_TAXONOMY.find((d) => d.key === key);
    const l = lectures.get(key);
    console.log(`\n=== ${def?.label ?? key} [${key}]: ${l?.units.length ?? 0} class sessions${l ? ` (course version ${l.version}; ${l.dropped ?? 0} self-study lessons never taught as a lecture left out)` : " -- no lessons found"}`);
    l?.units.forEach((u, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${u.title}`);
      csv.push([def?.trackGroup ?? "", def?.label ?? key, key, l.version, String(i + 1), u.title].map(q).join(","));
    });
  }
  // Also saved as a spreadsheet (2026-10-23, per request: the same list for every course): download it from Replit's Files panel.
  const out = `${process.env.HOME ?? "."}/workspace/portal_course_sessions.csv`;
  writeFileSync(out, "\ufeff" + csv.join("\r\n"));
  console.log(`\nSaved ${csv.length - 1} rows to ${out}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
