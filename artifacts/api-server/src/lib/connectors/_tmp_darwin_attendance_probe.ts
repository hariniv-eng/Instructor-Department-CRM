// One-off, READ-ONLY (2026-11-20, per request: "we have the Darwin API -- check if we have attendance data of instructors"). The 2026-10-27
// check (_tmp_attendance_search.ts) looked only inside what we ALREADY pull (Master API roster + report-builder reports). This one asks
// Darwinbox's ATTENDANCE API directly, on the same Darwinbox host as our Master API, with the credentials we already have, for the last
// 7 days of 3 Instructor-department employees. Darwinbox normally gives attendance its own api_key / dataset key, so a refusal here
// most likely means "ask the Darwin admin to enable attendance API access" rather than "no attendance data".
// Prints only HTTP status, Darwinbox's message, the response's field names and record counts -- no attendance values, no names.
//   pnpm exec tsx src/lib/connectors/_tmp_darwin_attendance_probe.ts
import { db, instructorsTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { config } from "./config";

const PATHS = ["/attendanceDataApi/daily", "/attendanceDataApi/dailyattendance", "/AttendanceDataApi/daily", "/attendanceDataApi/monthly", "/attendanceDataApi/dailyattendanceroster", "/attendanceDataApi/punches"];
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

function shape(v: unknown, depth = 0): string {
  if (Array.isArray(v)) return `array(${v.length})${v.length && typeof v[0] === "object" && v[0] ? ` of {${Object.keys(v[0] as object).slice(0, 40).join(", ")}}` : ""}`;
  if (v && typeof v === "object") {
    if (depth > 1) return `{${Object.keys(v).slice(0, 20).join(", ")}}`;
    return `{ ${Object.entries(v as Record<string, unknown>).slice(0, 15).map(([k, x]) => `${k}: ${typeof x === "string" ? (/(message|status|error|msg)/i.test(k) ? JSON.stringify(x.slice(0, 200)) : "string") : shape(x, depth + 1)}`).join(" | ")} }`;
  }
  return typeof v;
}

async function main() {
  if (!config.DARWINBOX_ENDPOINT) { console.log("DARWINBOX_ENDPOINT is not set"); process.exit(1); }
  const host = new URL(config.DARWINBOX_ENDPOINT).origin;
  const ids = (await db.select({ e: instructorsTable.employeeId }).from(instructorsTable).where(isNotNull(instructorsTable.employeeId)).limit(400))
    .map((r) => r.e!).filter((e) => /^NW\d{7}$/.test(e)).slice(0, 3);
  const to = new Date(), from = new Date(Date.now() - 7 * 86400000);
  const auth = `Basic ${Buffer.from(`${config.DARWINBOX_USERNAME}:${config.DARWINBOX_PASSWORD}`).toString("base64")}`;
  const keys = [
    { label: "Master API key + dataset key", api_key: config.DARWINBOX_API_KEY, datasetKey: config.DARWINBOX_DATASET_KEY },
    { label: "Report API key", api_key: config.DBX_CHECK_API_KEY, datasetKey: undefined },
  ].filter((k) => k.api_key);
  console.log(`Darwinbox host: (ours) | ${ids.length} sample employees | ${dmy(from)} to ${dmy(to)}\n`);
  for (const path of PATHS) for (const k of keys) {
    const body = { api_key: k.api_key, ...(k.datasetKey ? { datasetKey: k.datasetKey } : {}), emp_number_list: ids, employee_ids: ids, from: dmy(from), to: dmy(to), from_date: dmy(from), to_date: dmy(to), attendance_date: dmy(to) };
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
      const resp = await fetch(host + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth }, body: JSON.stringify(body), signal: ctl.signal });
      clearTimeout(t);
      const text = await resp.text();
      let out: string;
      try { out = shape(JSON.parse(text)); } catch { out = `not JSON (${text.length} chars)${/<html/i.test(text) ? " -- an HTML page (path does not exist / login page)" : `: ${text.slice(0, 150).replace(/\s+/g, " ")}`}`; }
      console.log(`${path} [${k.label}] -> HTTP ${resp.status}: ${out}`);
    } catch (e) { console.log(`${path} [${k.label}] -> failed: ${(e as Error).message.slice(0, 150)}`); }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
