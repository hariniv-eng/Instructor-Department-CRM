// One-off, READ-ONLY (2026-11-19, per request: "these instructors have already exited -- mention their exit date"). The 158 UUIDs of
// the deployment-date request, with the employee ID where it was given earlier (blank otherwise -> looked up from FCC by TeachOS id).
// For each: date of joining (FCC / archive, else the exit record), Darwin exit records (status, raised on, DATE OF EXIT -- never the raised date as exit date), the archive's exit date, and the
// FCC / Darwin status. Writes uuid_exits.csv (UUIDs + employee IDs only).
//   pnpm exec tsx src/lib/connectors/_tmp_uuid_exits.ts
import fs from "node:fs";
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable } from "@workspace/db";
import { cell } from "../reconcile";

const PAIRS: [string, string][] = [
  ["79ee0889-4e8d-475c-9e0e-c4df01771101", "NW0003878"], ["7f8d1d20-7d37-43ab-8006-ef96f2f69ff8", "NW0003927"], ["0129913b-124a-42d3-83d0-c728351b049f", "NW0003933"],
  ["2fc6bee3-01c4-49a8-b577-ed0b62cf48da", "NW0003934"], ["d9697b6b-ba23-489d-a079-49b8ff0e020d", "NW0003936"], ["b987f68c-2954-4c50-acb1-8423cf0a54bc", "NW0003937"],
  ["5444139e-7f5f-4675-995f-4db3c89561e7", "NW0003951"], ["3e104826-081f-499a-aa6c-75e4a34ae699", ""], ["a7f271a9-f72b-4333-a5e8-b852d2163435", "NW0004018"],
  ["9181fc37-5897-4a89-b113-abb42a11bb63", ""], ["47ae71b1-d13f-482c-93c9-9e37bad09401", ""], ["5928456e-fb09-4962-b6fe-65bf5c1eda9b", "NW0004260"],
  ["0933f86e-7108-4da2-802f-24b8c9eedc52", ""], ["6aaa41be-fd98-4ed7-93c7-1f037e1e391e", ""], ["41c8dc65-5c4b-45a9-9e7d-885a370c8dea", ""],
  ["1cf22fd0-a47c-4654-b7ff-95ed9f7116e4", ""], ["e588c4ad-44a1-475a-b581-eb9b546889dd", ""], ["196c899d-c05b-40b8-8484-b73eebf7e1fe", "NW0004481"],
  ["560dfe6e-1db5-4e11-8a5a-7b7a5221d244", "NW0004537"], ["b04e4a99-7e3c-4646-aadd-118979b1628c", "NW0004559"], ["fdca62f5-18ca-4ec5-acb6-5de744a60066", "NW0003238"],
  ["9c72d651-17a5-4ec2-9154-bd4f672dc2d6", ""], ["1c1a414e-fea3-42cc-b996-2f4c117c0661", ""], ["ac12bc0b-9cca-4676-b9fe-c667db425c2f", ""],
  ["63436dce-f2cb-4679-941c-3a1e0b60b889", "NW0005107"], ["b0e934d7-9061-4148-8ecb-a214d997671c", ""], ["411b0627-0461-4bea-bdae-b2a201c5558d", "NW0005330"],
  ["14fa683c-6169-46d1-af66-6ff842e70355", "NW0005344"], ["17f68a76-d6ac-44ea-97b2-8f078a9e1724", "NW0005483"], ["95781359-1610-4505-9890-51ee098d7355", "NW0005482"],
  ["27495d9c-5c2f-4367-b11b-48a85ba8c209", "NW0005514"], ["fbe12ed2-591a-4741-8a9d-06c0b813f36e", "NW0003537"], ["1994697e-e2a8-46bb-8f35-1273a423219a", "NW2000292"],
  ["1dde13dd-c1ad-452f-9b9f-7f91a8b0b0a3", "NW2000293"], ["9602d7dc-b82b-4113-b23d-9fd62475ea76", "NW2000300"], ["71e16c2c-cc57-4d43-b0fa-0a8c9ee0fc4b", "NW2000303"],
  ["b1c57c81-f059-4e15-ade5-e5b2d9538b6e", "NW2000305"], ["73d16cae-f283-4d58-9c8e-5a93448e8ac7", "NW2000306"], ["b180aa27-c599-4c23-8d3f-0706eb314e31", "NW2000307"],
  ["8a6231d4-18b0-4157-9c82-7a70bf5f4300", "NW2000309"], ["ac3d0e3e-cb9c-44eb-a459-b8e8791795d0", "NW2000310"], ["c3dfb991-e3e8-4b88-9d93-e7354007d49f", "NW2000313"],
  ["3bbc885e-8248-4822-8057-4759f5a9a3ff", "NW2000322"], ["9f966306-dd70-4c9c-bbe2-3eea42ba8029", "NW2000329"], ["29f8a1da-1266-43e6-8d11-d4c70d182b7c", "NW2000330"],
  ["f47beae2-8a9f-4650-8045-5c083ae4174c", "NW2000336"], ["4f0c247d-5cf7-4ead-9829-c5078a6be375", "NW2000289"], ["d7164ef7-ad65-45ba-9a2a-81726a071074", "NW2000318"],
  ["78f4a420-faf3-4bfd-b557-bbfe1d622348", "NW2000341"], ["b2cf5e81-eb54-402b-b636-eb3d636a6512", "NW2000349"], ["0dbc57a1-3dc7-4d7b-b2fe-0a8e1eb06027", "NW2000356"],
  ["1b205651-5f6d-4439-a23e-fc2f63bdf613", "NW2000363"], ["cb5e9fbd-e0d0-4cd2-986e-23ca5229643c", ""], ["ae01dc73-6bb8-4eb3-98ee-879e059bcdfc", ""],
  ["139c070e-e4ef-47e2-986e-99819e8b09b0", "NW2000371"], ["cbcf14d4-36c5-431e-81cc-491d904956ea", "NW2000373"], ["2bd4887d-cd09-493d-89c9-085f5736bda0", "NW2000377"],
  ["d6da2075-db2e-4443-84d1-66b0f48c0aaa", "NW2000381"], ["0c7f8226-b46e-45a7-a3f4-5d853a3cca85", "NW2000382"], ["0fd4bb49-5e6d-4e77-ab3f-411dde0602e3", "NW2000384"],
  ["2370cd05-3694-4e8f-bc21-a446a93fd382", "NW2000367"], ["04c5c3d5-e913-40bc-a111-edcb7f275ce8", "NW2000368"], ["bcf1c152-7814-4c69-b493-deafb973c473", "NW2000393"],
  ["aa18a610-1464-45c9-b7b6-6d0539144497", "NW2000395"], ["75f0d379-652b-46ec-8ac6-ff74c4c2c4b6", "NW2000397"], ["280d4e41-d12f-4cf6-af30-dec4baf21566", "NW2000399"],
  ["b8417afd-7225-4380-b80e-0293197f9337", "NW2000400"], ["5dfa6b10-1bfa-47ed-9929-e8c34b7f4753", "NW2000401"], ["b8bf5033-27ae-4229-8824-6ed60b6a62a2", "NW2000408"],
  ["66e8efe5-370e-4548-986c-6786fa756e8d", "NW2000410"], ["064f0b4c-9b78-4a52-b469-cfaa33db3957", "NW2000416"], ["9a681b0d-cff5-44cf-b84e-7e9fe160f118", "NW2000418"],
  ["846794be-f7d5-4227-83e2-3d95456625be", ""], ["b267ada2-f176-4c49-874b-eded8903de4e", "NW2000423"], ["0d06a249-d43d-4bf3-93e2-66bd8eeeb100", "NW2000424"],
  ["d8314704-a342-43d6-9d46-6bb8839d6505", "NW2000426"], ["0dc482b9-5306-4fa0-a296-fe028d4918f5", "NW2000427"], ["386d1055-7dc7-4972-b08f-31d9dbc7c379", "NW2000429"],
  ["0f74810f-6b0c-474e-ad75-0942437e9789", "NW2000430"], ["84590052-89fd-4db8-bf65-51571e620f90", "NW2000431"], ["5c4e39c1-ce5d-4539-8c5f-f2a7a2841bd6", "NW2000432"],
  ["54b4242d-22fa-4a7f-94c7-fb9c4c03180c", ""], ["b2c2272f-0f6b-4fe7-b260-6b6d3460f042", "NW2000445"], ["5367fc6d-1aff-4099-88ed-dc8fe5d02622", "NW2000448"],
  ["80eccb06-66a8-427a-a559-1b5f6f2ee9b7", "NW2000449"], ["0472793f-63b3-4aa6-a278-7ef158cc2e4a", "NW2000450"], ["f0682ff0-048b-4125-bd46-7f1e1ade5e9b", "NW2000451"],
  ["e4f59400-eeff-4e60-a5ac-2a7b54647630", "NW2000457"], ["4346b48c-2358-4551-a353-8a7336507d7d", "NW2000458"], ["3bd88a69-8678-4398-98b1-4c1ad0a923a0", ""],
  ["105b19eb-cd51-4d88-a3d0-aec172adbabb", "NW2000462"], ["a396d2ed-901b-4f6a-99d9-560b5a758b3b", "NW2000463"], ["29613ff2-5f0c-4135-8d6d-42e190dcf78b", "NW2000468"],
  ["91af9df5-aa59-477a-91d1-be587298cb15", "NW2000473"], ["1c22a9a7-e31f-469a-a71d-33ad8e7c5fdf", "NW2000479"], ["faa52569-e515-4547-9e0a-e26f60a20860", "NW2000480"],
  ["3e204831-32e6-4dcb-b8eb-a0d70933d4ea", ""], ["ce24d7af-974b-4af0-8b1a-6bfbf22ef680", ""], ["e3508ad7-e4ed-4054-ad6d-9cee4928a148", "NW2000492"],
  ["b3ba3221-356c-440f-aaca-f247a383d8e7", "NW2000494"], ["ca2a49f4-544e-4bb1-a055-38866da2d80c", "NW2000498"], ["9a6bf66b-72a0-4c7d-9cd8-933f0a09c88c", "NW2000501"],
  ["ee6509b8-e052-49ec-83f0-d92332407fab", ""], ["038525d4-7d46-4eab-8c73-5f46d1c88ccc", ""], ["bd3c0ac8-879e-47b5-a929-c09c30e93611", "NW2000509"],
  ["575ebf8c-e593-43a8-b81d-e461423e7e6c", "NW2000510"], ["cc89f629-31d7-4f2d-952c-e8201bb252d6", "NW2000512"], ["b12f041f-d785-43d6-9edb-7e204f095624", "NW2000514"],
  ["ba3060a8-248e-484f-8049-7bd9db81f64a", ""], ["99b128b1-7e75-47b5-b514-7d8373647684", "NW2000519"], ["eb4a2f2b-69e3-4690-a173-513cb1a0f971", ""],
  ["3dcda6b9-9f2a-4b07-a3ba-cce637a2f86e", "NW2000526"], ["a18ce454-fd0f-489f-8d4b-9ed026e98da2", "NW2000536"], ["6c490a8f-85a7-4ca8-aae9-b057caadff92", "NW2000553"],
  ["0d01c9b8-3b70-460d-8ba1-263466a0e429", "NW2000558"], ["35e9dfbd-4082-4dac-a62e-df3c06d39d8e", ""], ["6be7f353-0323-47de-8455-a4e41bd76e17", "NW2000562"],
  ["cb689660-9bfd-4f4a-a701-4946963e39fd", "NW2000566"], ["69e35ca7-c140-4433-96e9-5abe15e000a9", "NW2000567"], ["c6ed38be-3784-431b-b9f2-3d2dcfd4404e", "NW2000569"],
  ["a63dfbbd-c65d-4e1c-b317-19b611010a7b", "NW2000571"], ["ab9a7e61-ef65-4c5a-9ae3-52b0f47cd179", "NW2000572"], ["9c8cbb3d-26ce-4dea-bc33-ebda3e5b6cc4", "NW2000577"],
  ["d878e5f2-fc31-4770-a3c4-69fd24d2d05c", "NW2000578"], ["95cce430-03b7-4e65-87d1-a21e817dee5c", "NW2000580"], ["f7dfb930-05d9-4db2-8cfb-8db77140f89d", "NW2000585"],
  ["294a63c5-1b41-4be3-9307-b3e361c63e81", "NW2000520"], ["0822e609-16ee-422f-bfef-d76c3aa97508", ""], ["ca968851-5eb2-469b-b462-4b54e953768f", "NW0006880"],
  ["2f3e3e9c-cfa3-4bf0-bb85-17fbdec3cbaa", "NW2000591"], ["627dbfb6-b61b-468c-ad44-20e12d6187f2", ""], ["e666d8e5-7d42-4e20-adfa-11488c9702a3", ""],
  ["929e8ae4-d574-418f-b72d-365327e019f6", "NW2000600"], ["a0995ba7-315d-4b77-96d7-22216d85d67f", "NW2000604"], ["38b9dc0a-f592-4875-b788-06d1eb6a5975", "NW2000607"],
  ["f1613cbd-ccc2-4b8f-abe1-82f1e447e0a4", "NW2000608"], ["987f1ec0-5541-4ea0-9b23-77299f835b1a", "NW2000609"], ["7c0d0a3f-9385-4054-92d0-9446d0d1cb7d", ""],
  ["72b40fee-0367-47e7-8d69-970f162c13c7", "NW2000614"], ["ccb403ed-5b8e-456b-84bc-b1cb569e6b3a", "NW2000615"], ["b9bb63b2-7029-4cc0-8526-0d6e165d0407", "NW2000619"],
  ["2eb98784-d3df-4789-896b-e37bc6cacafd", "NW2000620"], ["7703a7d3-54c5-4e08-9542-cb18b258c2ac", "NW2000623"], ["c456cddf-7125-4fbb-8b38-81bce07e749f", "NW2000632"],
  ["ae563400-1b67-4abb-b66b-9bb5ea38f0b5", "NW2000635"], ["12cf5c69-c108-418a-af5d-816ca61f4f8c", "NW2000668"], ["ed155807-d3fd-4a68-a8ae-a5c2e0ded76c", "NW2000673"],
  ["ea3cd38b-8f31-493f-bc03-27822bc51256", "NW2000680"], ["184e2a4e-63a6-456d-8640-d7d5051dacb1", "NW2000683"], ["aa3c15f1-7f6a-4cea-b329-fd976678d3c0", "NW2000690"],
  ["d11989ac-c31d-44e4-b7b1-5ff982c8435e", "NW2000697"], ["7db2d10d-b4bd-41f0-93b8-121e4a71feab", "NW0007464"], ["f292e62d-6560-4be1-b5ff-a4d2c899783a", "NW2000729"],
  ["f2588168-b38e-4e3e-8f88-61a8651774bb", "NW2000739"], ["cfe37bdf-6a3f-4d02-89cd-c2508f5ec6ba", "NW2000747"], ["8b1b100b-4d54-4303-9235-0ea4595641fd", "NW2000757"],
  ["55de3cfd-5f5a-4cca-8940-a68895e7001f", "NW2000763"], ["732ff6a8-68c9-49a2-b9ed-40191221d4f5", "NW2000764"],
];
const key = (s: unknown) => String(s ?? "").trim().toUpperCase();
const norm = (u: unknown) => String(u ?? "").toLowerCase().replace(/-/g, "").trim();
const iso = (v: unknown) => { const s = String(v ?? "").trim(); const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; };
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function main() {
  const people = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const empOfUid = new Map<string, string>();
  for (const r of [...archive, ...people]) if (r.teachosUserId && r.employeeId) empOfUid.set(norm(r.teachosUserId), key(r.employeeId));
  const exits = await db.select().from(darwinboxExitsTable);
  const out = ["uuid,employee_id,employee_id_from,date_of_joining,fcc_status,darwin_status,latest_exit_status,exit_raised_on,date_of_exit,archive_exit_date,exit_records"];
  let withExit = 0, noEmp = 0;
  for (const [u, given] of PAIRS) {
    const emp = key(given) || empOfUid.get(norm(u)) || "";
    if (!emp) { noEmp++; out.push([u, "", "not found", "", "", "", "", "", "", "", 0].map(csvCell).join(",")); continue; }
    const p = people.find((r) => key(r.employeeId) === emp), a = archive.find((r) => key(r.employeeId) === emp);
    const ex = exits.filter((e) => key(e.employeeId ?? cell(e.rawData as Record<string, unknown>, "Employee Id", "employee_id")) === emp)
      .map((e) => { const r = e.rawData as Record<string, unknown>; return { status: String(r["Status"] ?? ""), raised: iso(r["Exit Date"] ?? r["Separation Requested On"]), lwd: iso(r["Date Of Exit"]), doj: iso(r["Date Of Joining"] ?? r["Date of Joining"] ?? "") }; })
      .sort((x, y) => y.raised.localeCompare(x.raised));
    const approved = ex.find((x) => /approved/i.test(x.status)) ?? ex[0];
    if (approved?.lwd) withExit++;
    out.push([u, emp, given ? "your list" : "FCC (TeachOS id)", (p ?? a)?.dateOfJoining || ex.find((x) => x.doj)?.doj || "", p ? (p.manualStatus || p.computedStatus) : a ? `archive: ${a.computedStatus}` : "not in FCC",
      (p ?? a)?.darwinEmployeeStatus ?? "", approved?.status ?? "", approved?.raised ?? "", approved?.lwd ?? "", a?.exitDate ?? "", ex.length].map(csvCell).join(","));
  }
  fs.writeFileSync("uuid_exits.csv", out.join("\n"));
  console.log(`${PAIRS.length} UUIDs | with a date of exit: ${withExit} | employee ID not found: ${noEmp}. Print it: cat uuid_exits.csv`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
