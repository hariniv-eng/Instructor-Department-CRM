// One-off, READ-ONLY (2026-11-18, per request: "for this list of instructors I need their deployment date = when their first class was
// taken"). Employee IDs from the request (no names in this file). For each: TeachOS user id (instructors table, else the Instructor Archive),
// then from the session schedule table: first COMPLETED Lecture / Practice session (date, type, title, course), first completed session of
// ANY type, first session ever SCHEDULED (any status -- what FCC calls the deployment date), and completed Lecture / Practice sessions in all.
// Writes first_class_dates.csv (employee IDs only, no names) and prints a summary.
//   pnpm exec tsx src/lib/connectors/_tmp_first_class.ts
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const IDS = [
  "NW0003442", "NW0003571", "NW0003867", "NW0003878", "NW0003887", "NW0003888", "NW0003927", "NW0003932", "NW0003933", "NW0003934",
  "NW0003935", "NW0003936", "NW0003937", "NW0003941", "NW0003951", "NW0003957", "NW0003963", "NW0003964", "NW0003971", "NW2000073",
  "NW0004000", "NW0004016", "NW0004018", "NW0004021", "NW0004029", "NW0004063", "NW0004065", "NW0004074", "NW0004080", "NW0004081",
  "NW0004103", "NW0004105", "NW0004108", "NW0004109", "NW0004115", "NW0004157", "NW0004163", "NW0004209", "NW0004210", "NW0004212",
  "NW0004214", "NW0004223", "NW0004224", "NW0004225", "NW0004226", "NW0004232", "NW0004233", "NW0004253", "NW0004260", "NW0004303",
  "NW0004308", "NW0003926", "NW0004013", "NW0004077", "NW0004087", "NW0004096", "NW0004319", "NW0004322", "NW0004329", "NW0004331",
  "NW0004333", "NW0004336", "NW0004369", "NW0004370", "NW0004371", "NW0004377", "NW0004378", "NW0004367", "NW0004450", "NW0004454",
  "NW0004458", "NW0004467", "NW0004477", "NW0004481", "NW0004484", "NW0004519", "NW0004524", "NW0004537", "NW0004545", "NW0004547",
  "NW0004559", "NW0004647", "NW0004374", "NW0004468", "NW0004486", "NW0004657", "NW0003238", "NW0004652", "NW0004678", "NW0004686",
  "NW0004688", "NW0004696", "NW0004702", "NW0004713", "NW0004715", "NW0004721", "NW0004725", "NW0004727", "NW0004728", "NW0004729",
  "NW0004730", "NW0004740", "NW0004836", "NW0004877", "NW0004883", "NW0004884", "NW0004939", "NW0004984", "NW0004985", "NW0004986",
  "NW0004649", "NW0004889", "NW0004947", "NW0005107", "NW0003918", "NW0003879", "NW0005084", "NW0002240", "NW0005275", "NW0004066",
  "NW0004341", "NW0004015", "NW0004073", "NW0004153", "NW0004159", "NW0004100", "NW0005061", "NW0004256", "NW0004117", "NW0004165",
  "NW0004057", "NW0004042", "NW0005227", "NW0003443", "NW0002417", "NW0005294", "NW0005320", "NW0005322", "NW0005330", "NW0005344",
  "NW0005448", "NW0005459", "NW0005483", "NW0005482", "NW0004560", "NW0004561", "NW0004566", "NW0004690", "NW0004709", "NW0004840",
  "NW0004893", "NW0004902", "NW0004901", "NW0004972", "NW0004976", "NW0005059", "NW0005235", "NW0005514", "NW0005513", "NW0005533",
  "NW0005579", "NW0005638", "NW0005639", "NW0005640", "NW0005691", "NW0005733", "NW0005219", "NW2000243", "NW0003537", "NW0005043",
  "NW0005892", "NW0003533", "NW0006123", "NW0006430", "NW2000288", "NW2000290", "NW2000292", "NW2000293", "NW2000294", "NW2000298",
  "NW2000299", "NW2000300", "NW2000301", "NW2000303", "NW2000304", "NW2000305", "NW2000306", "NW2000307", "NW2000309", "NW2000310",
  "NW2000311", "NW2000313", "NW2000314", "NW2000319", "NW2000320", "NW2000321", "NW2000322", "NW2000323", "NW2000325", "NW2000329",
  "NW2000330", "NW2000335", "NW2000336", "NW2000289", "NW2000318", "NW2000334", "NW0005332", "NW2000339", "NW2000341", "NW2000344",
  "NW2000345", "NW2000349", "NW2000350", "NW2000356", "NW2000362", "NW2000363", "NW2000366", "NW2000369", "NW2000371", "NW2000373",
  "NW2000374", "NW2000375", "NW2000377", "NW2000381", "NW2000382", "NW2000384", "NW2000387", "NW2000390", "NW2000367", "NW2000368",
  "NW2000385", "NW2000389", "NW2000393", "NW2000395", "NW2000397", "NW2000399", "NW2000400", "NW2000401", "NW2000402", "NW2000408",
  "NW2000410", "NW2000416", "NW2000417", "NW2000418", "NW2000421", "NW2000423", "NW2000424", "NW2000425", "NW2000426", "NW2000427",
  "NW2000429", "NW2000430", "NW2000431", "NW2000432", "NW2000434", "NW2000435", "NW2000437", "NW2000438", "NW2000442", "NW2000443",
  "NW2000445", "NW2000448", "NW2000449", "NW2000450", "NW2000451", "NW2000453", "NW2000455", "NW2000457", "NW2000433", "NW2000458",
  "NW2000459", "NW2000461", "NW2000462", "NW2000463", "NW2000466", "NW2000468", "NW2000471", "NW2000472", "NW2000473", "NW2000478",
  "NW2000479", "NW2000480", "NW2000481", "NW2000485", "NW1005907", "NW1006004", "NW2000486", "NW2000487", "NW2000488", "NW2000489",
  "NW2000492", "NW2000494", "NW2000497", "NW2000498", "NW2000499", "NW2000500", "NW2000501", "NW2000506", "NW2000508", "NW2000509",
  "NW2000510", "NW2000512", "NW2000514", "NW2000516", "NW2000518", "NW2000519", "NW0006761", "NW2000526", "NW2000528", "NW0006883",
  "NW2000532", "NW2000536", "NW2000538", "NW2000540", "NW2000541", "NW2000542", "NW2000543", "NW2000545", "NW2000546", "NW2000547",
  "NW2000548", "NW2000549", "NW2000550", "NW2000553", "NW2000555", "NW2000556", "NW2000558", "NW2000559", "NW2000560", "NW2000562",
  "NW2000566", "NW2000567", "NW2000568", "NW2000569", "NW2000570", "NW2000571", "NW2000572", "NW2000574", "NW2000575", "NW2000577",
  "NW2000578", "NW2000580", "NW2000583", "NW2000585", "NW2000573", "NW2000587", "NW2000504", "NW2000505", "NW2000507", "NW2000520",
  "NW2000531", "NW0006880", "NW0005549", "NW2000591", "NW2000596", "NW0006988", "NW0006989", "NW0006990", "NW0006993", "NW0006994",
  "NW2000600", "NW2000604", "NW2000607", "NW2000608", "NW2000609", "NW0007018", "NW0007020", "NW0007135", "NW2000614", "NW2000615",
  "NW2000617", "NW2000619", "NW2000620", "NW2000623", "NW0005105", "NW2000625", "NW2000632", "NW2000635", "NW2000638", "NW2000668",
  "NW2000673", "NW2000678", "NW2000680", "NW2000681", "NW2000683", "NW2000690", "NW2000696", "NW2000697", "NW0007464", "NW2000721",
  "NW2000729", "NW0007637", "NW2000739", "NW0007870", "NW2000736", "NW2000747", "NW2000757", "NW2000763", "NW2000764",
];
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const key = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function main() {
  const uidOf = new Map<string, string>();
  for (const r of await db.select({ e: instructorArchiveTable.employeeId, u: instructorArchiveTable.teachosUserId }).from(instructorArchiveTable)) if (r.e && r.u) uidOf.set(key(r.e), r.u);
  for (const r of await db.select({ e: instructorsTable.employeeId, u: instructorsTable.teachosUserId }).from(instructorsTable)) if (r.e && r.u) uidOf.set(key(r.e), r.u);
  const uids = [...new Set(IDS.map((i) => uidOf.get(key(i))).filter((u): u is string => !!u))];
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\``;
  const [rows] = await bq.query({ query: `
    SELECT instructor_user_id u,
      MIN(CAST(session_start_datetime AS STRING)) first_scheduled,
      MIN(IF(session_status = 'COMPLETED', CAST(session_start_datetime AS STRING), NULL)) first_completed_any,
      ARRAY_AGG(IF(session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE'),
        STRUCT(CAST(session_start_datetime AS STRING) AS d, session_type AS ty, CAST(session_title AS STRING) AS t), NULL) IGNORE NULLS ORDER BY session_start_datetime LIMIT 1) fc,
      COUNTIF(session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE')) n
    FROM ${T} WHERE instructor_user_id IN UNNEST(@uids) GROUP BY 1`, params: { uids }, types: { uids: ["STRING"] } });
  const byUid = new Map((rows as Record<string, unknown>[]).map((r) => [plain(r.u), r]));
  const head = ["employee_id", "found_in_fcc", "first_class_taken", "first_class_type", "first_class_title", "first_completed_session_any_type", "first_session_scheduled_fcc_deployment_date", "completed_lecture_practice_sessions", "note"];
  const out: string[] = [head.join(",")];
  const tally = { taken: 0, none: 0, notFound: 0, noSessions: 0 };
  for (const id of IDS) {
    const u = uidOf.get(key(id));
    const r = u ? byUid.get(u) : undefined;
    const fc = (r?.fc as Record<string, unknown>[] | undefined)?.[0];
    const note = !u ? "Not in FCC / no TeachOS id" : !r ? "No sessions in the schedule table" : !fc ? "No class taken yet (no completed Lecture / Practice)" : "";
    if (!u) tally.notFound++; else if (!r) tally.noSessions++; else if (!fc) tally.none++; else tally.taken++;
    out.push([id, u ? "yes" : "no", plain(fc?.d).slice(0, 10), plain(fc?.ty), plain(fc?.t), plain(r?.first_completed_any).slice(0, 10), plain(r?.first_scheduled).slice(0, 10), r ? plain(r.n) : "", note].map(csvCell).join(","));
  }
  fs.writeFileSync("first_class_dates.csv", out.join("\n"));
  console.log(`${IDS.length} employee IDs | first class found ${tally.taken} | no class taken yet ${tally.none} | no sessions at all ${tally.noSessions} | not in FCC / no TeachOS id ${tally.notFound}`);
  console.log("Wrote first_class_dates.csv (employee IDs only, no names). Download it and attach it in the chat.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
