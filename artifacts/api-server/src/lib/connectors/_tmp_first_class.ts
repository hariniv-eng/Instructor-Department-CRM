// One-off, READ-ONLY (2026-11-18, per request: "for this list of instructors I need their deployment date = when their first class was
// taken"). Employee IDs from the request (_tmp_first_class_ids.ts; no names in the repo). From the session schedule table: first COMPLETED
// Lecture / Practice session (date, type, title), first completed session of ANY type, first session ever SCHEDULED (any status -- what FCC
// calls the deployment date), completed Lecture / Practice sessions in all.
// Finding each person's sessions, in this order:
//   1. TeachOS user id stored in FCC (instructors table, Instructor Archive)
//   2. v3: the schedule table's own EMPLOYEE ID column, if it has one (per request: "or employee_id")
//   3. their org email (FCC / archive / Darwin data) against the schedule table's email column, if it has one
//   4. v3: their NAME (per request: "with names you get the data") against the schedule table's instructor name column -- names come from
//      a CSV given on the command line (employee_id,name -- the list shared in the chat), NOT stored in the repo. Words compared in any order,
//      letters only; a name that belongs to several TeachOS users is flagged, not guessed.
// v4 (2026-11-18, per request: "what about getting the data by their name"): people still not found are matched LOOSELY by name against
// every instructor name in the schedule table -- all words of the shorter name inside the longer one, or 2+ shared words (3+ letters each),
// initials ignored. Only a single candidate is used; the TeachOS name it matched is written so it can be checked by hand.
// Writes first_class_dates.csv (employee IDs; v4 adds the matched TeachOS name for loose matches -- delete the file after download). The schedule table starts 2025-07-15: earlier first classes cannot be seen.
//   pnpm exec tsx src/lib/connectors/_tmp_first_class.ts [names.csv]
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable, darwinboxFullRosterTable, darwinboxActiveTable } from "@workspace/db";
import { cell } from "../reconcile";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { IDS as EXIT_IDS } from "./_tmp_first_class_ids";
import { ACTIVE_IDS } from "./_tmp_active_ids";
// --active (2026-11-18): the active-instructors list instead; output first_class_dates_active.csv.
const ACTIVE = process.argv.includes("--active");
const IDS = ACTIVE ? ACTIVE_IDS : EXIT_IDS;
const OUT = ACTIVE ? "first_class_dates_active.csv" : "first_class_dates.csv";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const key = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(" ").filter(Boolean).sort().join(" ");
const sqlNameKey = (col: string) => `ARRAY_TO_STRING(ARRAY(SELECT w FROM UNNEST(SPLIT(REGEXP_REPLACE(LOWER(IFNULL(CAST(${col} AS STRING), '')), r'[^a-z ]', ' '), ' ')) w WHERE w != '' ORDER BY w), ' ')`;

async function main() {
  const namesFile = process.argv.slice(2).filter((a) => a !== "--" && !a.startsWith("--"))[0];
  const nameOf = new Map<string, string>();
  if (namesFile) for (const line of fs.readFileSync(namesFile, "utf8").split(/\r?\n/)) {
    const [id, ...rest] = line.split(","); const n = rest.join(",").replace(/^"|"$/g, "").trim();
    if (id?.trim() && n) nameOf.set(key(id), nameKey(n));
  }
  const uidOf = new Map<string, string>();
  for (const r of await db.select({ e: instructorArchiveTable.employeeId, u: instructorArchiveTable.teachosUserId }).from(instructorArchiveTable)) if (r.e && r.u) uidOf.set(key(r.e), r.u);
  for (const r of await db.select({ e: instructorsTable.employeeId, u: instructorsTable.teachosUserId }).from(instructorsTable)) if (r.e && r.u) uidOf.set(key(r.e), r.u);
  const mailOf = new Map<string, string>();
  const addMail = (e: string | null | undefined, m: unknown) => { const mm = String(m ?? "").trim().toLowerCase(); if (e && mm.includes("@") && !mailOf.has(key(e))) mailOf.set(key(e), mm); };
  for (const r of await db.select({ e: instructorsTable.employeeId, m: instructorsTable.orgEmail }).from(instructorsTable)) addMail(r.e, r.m);
  for (const r of await db.select({ e: instructorArchiveTable.employeeId, m: instructorArchiveTable.orgEmail }).from(instructorArchiveTable)) addMail(r.e, r.m);
  for (const t of [darwinboxExitsTable, darwinboxFullRosterTable, darwinboxActiveTable])
    for (const r of await db.select().from(t)) { const raw = (r.rawData ?? {}) as Record<string, unknown>; addMail(r.employeeId ?? (cell(raw, "Employee Id", "employee_id") as string | null), cell(raw, "Org Email Id", "org_email")); }

  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\``;
  const [one] = await bq.query({ query: `SELECT * FROM ${T} LIMIT 1` });
  const cols = Object.keys((one as Record<string, unknown>[])[0] ?? {});
  const empCol = cols.find((c) => /^(instructor_)?(employee_?(id|code)|emp_?(id|code))$/i.test(c)) ?? null;
  const mailCol = cols.find((c) => /instructor.*mail/i.test(c)) ?? null;
  const nameCol = cols.find((c) => /^instructor_name$/i.test(c)) ?? cols.find((c) => /instructor.*name/i.test(c)) ?? null;
  const [range] = await bq.query({ query: `SELECT MIN(CAST(session_start_datetime AS STRING)) lo FROM ${T}` });
  console.log(`Schedule table: sessions from ${plain((range as Record<string, unknown>[])[0]?.lo).slice(0, 10)} | employee id column ${empCol ?? "NONE"} | email column ${mailCol ?? "NONE"} | name column ${nameCol ?? "NONE"} | names file ${namesFile ? `${nameOf.size} names` : "not given"}`);

  // One query per way of matching: key -> first dates; `users` = how many TeachOS users share that key (for names).
  const agg = async (keyExpr: string, values: string[]) => {
    const out = new Map<string, Record<string, unknown>>();
    if (!values.length) return out;
    const [rows] = await bq.query({ query: `
      SELECT k, ANY_VALUE(u) u, COUNT(DISTINCT u) users, MIN(first_scheduled) first_scheduled, MIN(first_completed_any) first_completed_any,
        ARRAY_CONCAT_AGG(fc ORDER BY fc[SAFE_OFFSET(0)].d LIMIT 1) fc, SUM(n) n
      FROM (
        SELECT ${keyExpr} k, instructor_user_id u,
          MIN(CAST(session_start_datetime AS STRING)) first_scheduled,
          MIN(IF(session_status = 'COMPLETED', CAST(session_start_datetime AS STRING), NULL)) first_completed_any,
          ARRAY_AGG(IF(session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE'),
            STRUCT(CAST(session_start_datetime AS STRING) AS d, session_type AS ty, CAST(session_title AS STRING) AS t), NULL) IGNORE NULLS ORDER BY session_start_datetime LIMIT 1) fc,
          COUNTIF(session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE')) n
        FROM ${T} WHERE ${keyExpr} IN UNNEST(@v) GROUP BY 1, 2)
      GROUP BY k`, params: { v: values }, types: { v: ["STRING"] } });
    for (const r of rows as Record<string, unknown>[]) out.set(plain(r.k), r);
    return out;
  };
  const noUid = IDS.filter((i) => !uidOf.get(key(i)));
  const byUid = await agg("instructor_user_id", [...new Set(IDS.map((i) => uidOf.get(key(i))).filter((u): u is string => !!u))]);
  const byEmp = empCol ? await agg(`UPPER(TRIM(CAST(${empCol} AS STRING)))`, noUid.map(key)) : new Map();
  const byMail = mailCol ? await agg(`LOWER(TRIM(CAST(${mailCol} AS STRING)))`, [...new Set(noUid.map((i) => mailOf.get(key(i))).filter((m): m is string => !!m))]) : new Map();
  const byName = nameCol ? await agg(sqlNameKey(nameCol), [...new Set(noUid.map((i) => nameOf.get(key(i))).filter((n): n is string => !!n))]) : new Map();

  // v4: loose name match for everyone still not found.
  const tokens = (n: string) => n.split(" ").filter((w) => w.length >= 3);
  const loose = new Map<string, { uid: string; name: string }>();
  const looseAmbiguous = new Map<string, number>();
  if (nameCol) {
    const [all] = await bq.query({ query: `SELECT DISTINCT CAST(${nameCol} AS STRING) n, instructor_user_id u FROM ${T} WHERE ${nameCol} IS NOT NULL` });
    const pool = (all as Record<string, unknown>[]).map((r) => ({ raw: plain(r.n), k: nameKey(plain(r.n)), u: plain(r.u) }));
    for (const id of IDS) {
      const k = key(id);
      if (uidOf.get(k) || byEmp.get(k) || (mailOf.get(k) && byMail.get(mailOf.get(k)!)) || (nameOf.get(k) && byName.get(nameOf.get(k)!))) continue;
      const mine = tokens(nameOf.get(k) ?? "");
      if (!mine.length) continue;
      const hits = pool.filter((c) => {
        const theirs = tokens(c.k);
        if (!theirs.length) return false;
        const shared = mine.filter((w) => theirs.includes(w)).length;
        const [small, big] = mine.length <= theirs.length ? [mine, theirs] : [theirs, mine];
        return (small.length >= 2 && small.every((w) => big.includes(w))) || shared >= 2;
      });
      const users = [...new Set(hits.map((h) => h.u))];
      if (users.length === 1) loose.set(k, { uid: users[0], name: hits[0].raw });
      else if (users.length > 1) looseAmbiguous.set(k, users.length);
    }
  }
  const byLoose = await agg("instructor_user_id", [...new Set([...loose.values()].map((x) => x.uid))]);

  const head = ["employee_id", "matched_by", "first_class_taken", "first_class_type", "first_class_title", "first_completed_session_any_type", "first_session_scheduled_fcc_deployment_date", "completed_lecture_practice_sessions", "note", "teachos_name_matched_loosely"];
  const out: string[] = [head.join(",")];
  const tally = new Map<string, number>();
  for (const id of IDS) {
    const k = key(id);
    let how = "", r: Record<string, unknown> | undefined, note = "";
    if (uidOf.get(k)) { how = "TeachOS id"; r = byUid.get(uidOf.get(k)!); }
    else if (byEmp.get(k)) { how = "employee id"; r = byEmp.get(k); }
    else if (mailOf.get(k) && byMail.get(mailOf.get(k)!)) { how = "email"; r = byMail.get(mailOf.get(k)!); }
    else if (nameOf.get(k) && byName.get(nameOf.get(k)!)) {
      r = byName.get(nameOf.get(k)!);
      if (Number(plain(r?.users)) > 1) { how = "name (AMBIGUOUS)"; note = `${plain(r?.users)} TeachOS users have this name -- check by hand`; r = undefined; }
      else how = "name";
    }
    else if (loose.get(k)) { how = "name (loose)"; r = byLoose.get(loose.get(k)!.uid); }
    else if (looseAmbiguous.get(k)) { how = "name (loose, AMBIGUOUS)"; note = `${looseAmbiguous.get(k)} TeachOS users have a similar name -- check by hand`; }
    const fc = (r?.fc as Record<string, unknown>[] | undefined)?.[0];
    if (!note) note = !how ? "Not found (no TeachOS id, employee id, email or name match)" : !r ? "No sessions in the schedule table" : !fc ? "No class taken yet (no completed Lecture / Practice)" : "";
    const bucket = !how ? "not found" : how.includes("AMBIGUOUS") ? "name ambiguous" : !r ? `${how}: no sessions` : !fc ? `${how}: no class yet` : `${how}: first class found`;
    tally.set(bucket, (tally.get(bucket) ?? 0) + 1);
    out.push([id, how || "none", plain(fc?.d).slice(0, 10), plain(fc?.ty), plain(fc?.t), plain(r?.first_completed_any).slice(0, 10), plain(r?.first_scheduled).slice(0, 10), r ? plain(r.n) : "", note, how === "name (loose)" ? loose.get(k)!.name : ""].map(csvCell).join(","));
  }
  fs.writeFileSync(OUT, out.join("\n"));
  console.log(`${IDS.length} employee IDs:`);
  for (const [b, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${b}: ${n}`);
  console.log(`Wrote ${OUT} (employee IDs + the TeachOS name of loose matches). Download it, attach it in the chat, then: rm ${OUT}`);
  if (namesFile) console.log(`Delete the names file now: rm ${namesFile}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
