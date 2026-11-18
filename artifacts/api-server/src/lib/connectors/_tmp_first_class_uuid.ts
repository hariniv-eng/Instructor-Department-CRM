// One-off, READ-ONLY (2026-11-18, per request: "I need the date of deployment using their UUID"). Employee ID + TeachOS user id (UUID) pairs
// shared in the chat (no names). For each UUID, from the session schedule table: first COMPLETED Lecture / Practice session (= date of
// deployment), first completed session of any type, first session ever scheduled, completed Lecture / Practice sessions. UUIDs compared
// lower case without dashes. Also checks the QA rating view (class recordings, SCHEDULE type) in case a person has rated classes but no
// schedule rows. Writes first_class_uuid.csv (employee IDs only).
//   pnpm exec tsx src/lib/connectors/_tmp_first_class_uuid.ts
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { QA_RATING_VIEW } from "./demoTraining";

const PAIRS: [string, string][] = [
  ["NW0003537", "fbe12ed2-591a-4741-8a9d-06c0b813f36e"], ["NW0005483", "17f68a76-d6ac-44ea-97b2-8f078a9e1724"], ["NW2000445", "b2c2272f-0f6b-4fe7-b260-6b6d3460f042"], ["NW2000492", "e3508ad7-e4ed-4054-ad6d-9cee4928a148"],
  ["NW2000558", "0d01c9b8-3b70-460d-8ba1-263466a0e429"], ["NW2000572", "ab9a7e61-ef65-4c5a-9ae3-52b0f47cd179"], ["NW0003442", "b4252a88-cf34-4421-a142-b0249197c088"], ["NW0003443", "fd1bd4ba-65ec-47d0-9a75-32aeef59c7fb"],
  ["NW0003927", "7f8d1d20-7d37-43ab-8006-ef96f2f69ff8"], ["NW0007135", "7a2e42bd-51ae-45b5-8bb5-b38f885f8c4b"], ["NW0007464", "7db2d10d-b4bd-41f0-93b8-121e4a71feab"], ["NW2000339", "6a514429-958a-4c8f-8362-a585fc7a45a1"],
  ["NW2000377", "2bd4887d-cd09-493d-89c9-085f5736bda0"], ["NW2000393", "bcf1c152-7814-4c69-b493-deafb973c473"], ["NW2000431", "84590052-89fd-4db8-bf65-51571e620f90"], ["NW2000591", "2f3e3e9c-cfa3-4bf0-bb85-17fbdec3cbaa"],
  ["NW2000604", "a0995ba7-315d-4b77-96d7-22216d85d67f"], ["NW2000614", "72b40fee-0367-47e7-8d69-970f162c13c7"], ["NW2000632", "c456cddf-7125-4fbb-8b38-81bce07e749f"], ["NW2000668", "12cf5c69-c108-418a-af5d-816ca61f4f8c"],
  ["NW2000673", "ed155807-d3fd-4a68-a8ae-a5c2e0ded76c"], ["NW2000680", "ea3cd38b-8f31-493f-bc03-27822bc51256"], ["NW2000683", "184e2a4e-63a6-456d-8640-d7d5051dacb1"], ["NW2000690", "aa3c15f1-7f6a-4cea-b329-fd976678d3c0"],
  ["NW2000697", "d11989ac-c31d-44e4-b7b1-5ff982c8435e"], ["NW2000729", "f292e62d-6560-4be1-b5ff-a4d2c899783a"], ["NW2000739", "f2588168-b38e-4e3e-8f88-61a8651774bb"], ["NW2000747", "cfe37bdf-6a3f-4d02-89cd-c2508f5ec6ba"],
  ["NW2000757", "8b1b100b-4d54-4303-9235-0ea4595641fd"], ["NW0003238", "fdca62f5-18ca-4ec5-acb6-5de744a60066"], ["NW0003878", "79ee0889-4e8d-475c-9e0e-c4df01771101"], ["NW0003888", "f7fb3135-850a-4ef7-8cf1-f85cc75803a0"],
  ["NW0003918", "059644ad-41e8-4865-a2a7-fe14fe38361a"], ["NW0003933", "0129913b-124a-42d3-83d0-c728351b049f"], ["NW0003934", "2fc6bee3-01c4-49a8-b577-ed0b62cf48da"], ["NW0003936", "d9697b6b-ba23-489d-a079-49b8ff0e020d"],
  ["NW0003937", "b987f68c-2954-4c50-acb1-8423cf0a54bc"], ["NW0003951", "5444139e-7f5f-4675-995f-4db3c89561e7"], ["NW0003963", "55c72e2c-1523-492f-8978-81210112a106"], ["NW0004018", "a7f271a9-f72b-4333-a5e8-b852d2163435"],
  ["NW0004073", "c55ed2a1-eaba-4037-af17-5100542e3f5d"], ["NW0004100", "10024daf-38bf-4409-9de6-a6880a553823"], ["NW0004103", "ac59f77e-64e9-4978-b195-d95e67bd976e"], ["NW0004163", "2ea555a2-bb2a-40d7-b88f-2f113fa679b2"],
  ["NW0004209", "64ecdfce-f476-4359-b670-7d945b3eb7e5"], ["NW0004260", "5928456e-fb09-4962-b6fe-65bf5c1eda9b"], ["NW0004377", "f71c971a-ecb9-4895-81d0-36a8a3e1b372"], ["NW0004481", "196c899d-c05b-40b8-8484-b73eebf7e1fe"],
  ["NW0004484", "d8e6632f-059c-4f13-948d-36ae81d76c8b"], ["NW0004537", "560dfe6e-1db5-4e11-8a5a-7b7a5221d244"], ["NW0004559", "b04e4a99-7e3c-4646-aadd-118979b1628c"], ["NW0004652", "d1b45ade-ba1e-4782-947b-5b8b2a6c921e"],
  ["NW0004690", "880e40f2-2fe0-4bee-a548-7f6486ce96c5"], ["NW0004702", "5e704687-2064-44f8-bcc4-6253e8939e02"], ["NW0004740", "a3caae7a-b39e-4e84-bcba-f6a92fc85a3a"], ["NW0004884", "ba389fb7-3365-4305-ae81-2893a44e53bb"],
  ["NW0004984", "458f63ad-5097-4f9b-841b-8abe01eb17b6"], ["NW0005059", "4800438f-9fad-44f7-9547-7961f33fce73"], ["NW0005084", "ddda69c3-89c2-43a2-a54f-7124b716d8aa"], ["NW0005107", "63436dce-f2cb-4679-941c-3a1e0b60b889"],
  ["NW0005235", "cb27001f-6a25-4c18-8369-90802e76491c"], ["NW0005320", "dcaa8857-8e51-436d-8ce5-88c559b8a7df"], ["NW0005330", "411b0627-0461-4bea-bdae-b2a201c5558d"], ["NW0005332", "ba773e71-559a-4ddd-93d5-e56120734e37"],
  ["NW0005344", "14fa683c-6169-46d1-af66-6ff842e70355"], ["NW0005482", "95781359-1610-4505-9890-51ee098d7355"], ["NW0005514", "27495d9c-5c2f-4367-b11b-48a85ba8c209"], ["NW0006430", "56217ae2-c6de-4c54-af3b-b53e09c5aa56"],
  ["NW0006880", "ca968851-5eb2-469b-b462-4b54e953768f"], ["NW2000289", "4f0c247d-5cf7-4ead-9829-c5078a6be375"], ["NW2000292", "1994697e-e2a8-46bb-8f35-1273a423219a"], ["NW2000293", "1dde13dd-c1ad-452f-9b9f-7f91a8b0b0a3"],
  ["NW2000300", "9602d7dc-b82b-4113-b23d-9fd62475ea76"], ["NW2000303", "71e16c2c-cc57-4d43-b0fa-0a8c9ee0fc4b"], ["NW2000305", "b1c57c81-f059-4e15-ade5-e5b2d9538b6e"], ["NW2000306", "73d16cae-f283-4d58-9c8e-5a93448e8ac7"],
  ["NW2000307", "b180aa27-c599-4c23-8d3f-0706eb314e31"], ["NW2000309", "8a6231d4-18b0-4157-9c82-7a70bf5f4300"], ["NW2000310", "ac3d0e3e-cb9c-44eb-a459-b8e8791795d0"], ["NW2000313", "c3dfb991-e3e8-4b88-9d93-e7354007d49f"],
  ["NW2000318", "d7164ef7-ad65-45ba-9a2a-81726a071074"], ["NW2000322", "3bbc885e-8248-4822-8057-4759f5a9a3ff"], ["NW2000329", "9f966306-dd70-4c9c-bbe2-3eea42ba8029"], ["NW2000330", "29f8a1da-1266-43e6-8d11-d4c70d182b7c"],
  ["NW2000336", "f47beae2-8a9f-4650-8045-5c083ae4174c"], ["NW2000341", "78f4a420-faf3-4bfd-b557-bbfe1d622348"], ["NW2000349", "b2cf5e81-eb54-402b-b636-eb3d636a6512"], ["NW2000356", "0dbc57a1-3dc7-4d7b-b2fe-0a8e1eb06027"],
  ["NW2000363", "1b205651-5f6d-4439-a23e-fc2f63bdf613"], ["NW2000367", "2370cd05-3694-4e8f-bc21-a446a93fd382"], ["NW2000368", "04c5c3d5-e913-40bc-a111-edcb7f275ce8"], ["NW2000371", "139c070e-e4ef-47e2-986e-99819e8b09b0"],
  ["NW2000373", "cbcf14d4-36c5-431e-81cc-491d904956ea"], ["NW2000381", "d6da2075-db2e-4443-84d1-66b0f48c0aaa"], ["NW2000382", "0c7f8226-b46e-45a7-a3f4-5d853a3cca85"], ["NW2000384", "0fd4bb49-5e6d-4e77-ab3f-411dde0602e3"],
  ["NW2000389", "fad0b36d-dda5-4074-80fb-b7083acb097a"], ["NW2000395", "aa18a610-1464-45c9-b7b6-6d0539144497"], ["NW2000397", "75f0d379-652b-46ec-8ac6-ff74c4c2c4b6"], ["NW2000399", "280d4e41-d12f-4cf6-af30-dec4baf21566"],
  ["NW2000400", "b8417afd-7225-4380-b80e-0293197f9337"], ["NW2000401", "5dfa6b10-1bfa-47ed-9929-e8c34b7f4753"], ["NW2000408", "b8bf5033-27ae-4229-8824-6ed60b6a62a2"], ["NW2000410", "66e8efe5-370e-4548-986c-6786fa756e8d"],
  ["NW2000416", "064f0b4c-9b78-4a52-b469-cfaa33db3957"], ["NW2000418", "9a681b0d-cff5-44cf-b84e-7e9fe160f118"], ["NW2000423", "b267ada2-f176-4c49-874b-eded8903de4e"], ["NW2000424", "0d06a249-d43d-4bf3-93e2-66bd8eeeb100"],
  ["NW2000425", "af66ba69-13b6-46fd-b5ca-608ef82dc70c"], ["NW2000426", "d8314704-a342-43d6-9d46-6bb8839d6505"], ["NW2000427", "0dc482b9-5306-4fa0-a296-fe028d4918f5"], ["NW2000429", "386d1055-7dc7-4972-b08f-31d9dbc7c379"],
  ["NW2000430", "0f74810f-6b0c-474e-ad75-0942437e9789"], ["NW2000432", "5c4e39c1-ce5d-4539-8c5f-f2a7a2841bd6"], ["NW2000434", "87f8b513-b2bf-46b1-86ce-2ed1830f7e1f"], ["NW2000435", "8c36240f-2a62-4ace-99dc-6dc0aea0a545"],
  ["NW2000448", "5367fc6d-1aff-4099-88ed-dc8fe5d02622"], ["NW2000449", "80eccb06-66a8-427a-a559-1b5f6f2ee9b7"], ["NW2000450", "0472793f-63b3-4aa6-a278-7ef158cc2e4a"], ["NW2000451", "f0682ff0-048b-4125-bd46-7f1e1ade5e9b"],
  ["NW2000457", "e4f59400-eeff-4e60-a5ac-2a7b54647630"], ["NW2000458", "4346b48c-2358-4551-a353-8a7336507d7d"], ["NW2000461", "9a9b7ecf-c00c-472c-95bd-46ca4032fd4f"], ["NW2000462", "105b19eb-cd51-4d88-a3d0-aec172adbabb"],
  ["NW2000463", "a396d2ed-901b-4f6a-99d9-560b5a758b3b"], ["NW2000468", "29613ff2-5f0c-4135-8d6d-42e190dcf78b"], ["NW2000472", "78e75bf2-4369-4e15-860c-4c56c2c091e2"], ["NW2000473", "91af9df5-aa59-477a-91d1-be587298cb15"],
  ["NW2000479", "1c22a9a7-e31f-469a-a71d-33ad8e7c5fdf"], ["NW2000480", "faa52569-e515-4547-9e0a-e26f60a20860"], ["NW2000489", "3192b0a9-3839-4331-8584-9a19f26024de"], ["NW2000494", "b3ba3221-356c-440f-aaca-f247a383d8e7"],
  ["NW2000498", "ca2a49f4-544e-4bb1-a055-38866da2d80c"], ["NW2000500", "ca38ccac-68db-4072-bc7a-c7fc2200c5b6"], ["NW2000501", "9a6bf66b-72a0-4c7d-9cd8-933f0a09c88c"], ["NW2000509", "bd3c0ac8-879e-47b5-a929-c09c30e93611"],
  ["NW2000510", "575ebf8c-e593-43a8-b81d-e461423e7e6c"], ["NW2000512", "cc89f629-31d7-4f2d-952c-e8201bb252d6"], ["NW2000514", "b12f041f-d785-43d6-9edb-7e204f095624"], ["NW2000519", "99b128b1-7e75-47b5-b514-7d8373647684"],
  ["NW2000520", "294a63c5-1b41-4be3-9307-b3e361c63e81"], ["NW2000526", "3dcda6b9-9f2a-4b07-a3ba-cce637a2f86e"], ["NW2000536", "a18ce454-fd0f-489f-8d4b-9ed026e98da2"], ["NW2000553", "6c490a8f-85a7-4ca8-aae9-b057caadff92"],
  ["NW2000556", "4a09d3cf-3573-4e1c-bb54-9c6a3336e2e5"], ["NW2000562", "6be7f353-0323-47de-8455-a4e41bd76e17"], ["NW2000566", "cb689660-9bfd-4f4a-a701-4946963e39fd"], ["NW2000567", "69e35ca7-c140-4433-96e9-5abe15e000a9"],
  ["NW2000569", "c6ed38be-3784-431b-b9f2-3d2dcfd4404e"], ["NW2000570", "b0c21b40-4040-40b4-8a9f-da6b12b21101"], ["NW2000571", "a63dfbbd-c65d-4e1c-b317-19b611010a7b"], ["NW2000577", "9c8cbb3d-26ce-4dea-bc33-ebda3e5b6cc4"],
  ["NW2000578", "d878e5f2-fc31-4770-a3c4-69fd24d2d05c"], ["NW2000580", "95cce430-03b7-4e65-87d1-a21e817dee5c"], ["NW2000585", "f7dfb930-05d9-4db2-8cfb-8db77140f89d"], ["NW2000600", "929e8ae4-d574-418f-b72d-365327e019f6"],
  ["NW2000607", "38b9dc0a-f592-4875-b788-06d1eb6a5975"], ["NW2000608", "f1613cbd-ccc2-4b8f-abe1-82f1e447e0a4"], ["NW2000609", "987f1ec0-5541-4ea0-9b23-77299f835b1a"], ["NW2000615", "ccb403ed-5b8e-456b-84bc-b1cb569e6b3a"],
  ["NW2000619", "b9bb63b2-7029-4cc0-8526-0d6e165d0407"], ["NW2000620", "2eb98784-d3df-4789-896b-e37bc6cacafd"], ["NW2000623", "7703a7d3-54c5-4e08-9542-cb18b258c2ac"], ["NW2000635", "ae563400-1b67-4abb-b66b-9bb5ea38f0b5"],
  ["NW2000763", "55de3cfd-5f5a-4cca-8940-a68895e7001f"], ["NW2000764", "732ff6a8-68c9-49a2-b9ed-40191221d4f5"],
];
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const norm = (u: string) => u.toLowerCase().replace(/-/g, "").trim();
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\``;
  const Q = `\`${P}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\``;
  const uids = [...new Set(PAIRS.map(([, u]) => norm(u)))];
  const U = "REPLACE(LOWER(CAST(instructor_user_id AS STRING)), '-', '')";
  const [rows] = await bq.query({ query: `
    SELECT ${U} u,
      MIN(CAST(session_start_datetime AS STRING)) first_scheduled,
      MIN(IF(session_status = 'COMPLETED', CAST(session_start_datetime AS STRING), NULL)) first_completed_any,
      ARRAY_AGG(IF(session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE'),
        STRUCT(CAST(session_start_datetime AS STRING) AS d, session_type AS ty, CAST(session_title AS STRING) AS t), NULL) IGNORE NULLS ORDER BY session_start_datetime LIMIT 1) fc,
      COUNTIF(session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE')) n
    FROM ${T} WHERE ${U} IN UNNEST(@uids) GROUP BY 1`, params: { uids }, types: { uids: ["STRING"] } });
  const byUid = new Map((rows as Record<string, unknown>[]).map((r) => [plain(r.u), r]));
  // Class recordings (QA-rated SCHEDULE sessions) -- a second source, in case the schedule table has nothing for someone.
  const [qa] = await bq.query({ query: `SELECT ${U} u, MIN(CAST(session_date AS STRING)) d, COUNT(*) n FROM ${Q}
    WHERE evaluation_type = 'SCHEDULE' AND ${U} IN UNNEST(@uids) GROUP BY 1`, params: { uids }, types: { uids: ["STRING"] } });
  const byQa = new Map((qa as Record<string, unknown>[]).map((r) => [plain(r.u), r]));
  const out = [["employee_id", "uuid", "first_class_taken", "first_class_type", "first_class_title", "first_completed_session_any_type", "first_session_scheduled", "completed_lecture_practice_sessions", "first_rated_class_recording", "rated_class_recordings", "note"].join(",")];
  const tally = { found: 0, noClass: 0, none: 0, qaOnly: 0 };
  for (const [e, u] of PAIRS) {
    const r = byUid.get(norm(u)), q = byQa.get(norm(u));
    const fc = (r?.fc as Record<string, unknown>[] | undefined)?.[0];
    const note = fc ? "" : r ? "Scheduled, but no completed Lecture / Practice" : q ? "No schedule rows, but has rated class recordings" : "No sessions for this UUID";
    if (fc) tally.found++; else if (r) tally.noClass++; else if (q) tally.qaOnly++; else tally.none++;
    out.push([e, u, plain(fc?.d).slice(0, 10), plain(fc?.ty), plain(fc?.t), plain(r?.first_completed_any).slice(0, 10), plain(r?.first_scheduled).slice(0, 10), r ? plain(r.n) : "",
      plain(q?.d).slice(0, 10), q ? plain(q.n) : "", note].map(csvCell).join(","));
  }
  fs.writeFileSync("first_class_uuid.csv", out.join("\n"));
  console.log(`${PAIRS.length} UUIDs | first class found ${tally.found} | scheduled but no class ${tally.noClass} | only rated class recordings ${tally.qaOnly} | nothing ${tally.none}`);
  console.log("Wrote first_class_uuid.csv (employee IDs + UUIDs, no names). Attach it in the chat.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
