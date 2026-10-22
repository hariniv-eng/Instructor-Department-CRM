// One-off, READ-ONLY (2026-10-22, per request: "give me the complete TeachOS sync data"). Exports EVERY TeachOS account in
// niat_instructor_details -- all statuses, one row per account + campus -- with its enrolled plans (reverse-ETL copy) and its
// Capability Manager candidates (manager table), plus what the app has for that account: matched employee record, Darwin status,
// classification, product, Capability Manager shown, exit marking. "Used by the sync" = ACTIVE (the sync reads ACTIVE rows only).
// Writes ONE file in the Replit workspace root (nothing in the database): teachos_sync_export.csv. Download it from the Files panel.
//   pnpm exec tsx src/lib/connectors/_tmp_export_teachos.ts
import { writeFileSync } from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { CAPABILITY_MANAGER_TABLE_NAME } from "./capabilityManager";
import { productOf } from "../product";

const P = config.BIGQUERY_PROJECT_ID, D = config.BIGQUERY_DATASET;
const DETAILS = process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details";
const ETL = `${P}.${process.env.NIAT_REVERSE_ETL_DATASET || "niat_reverse_etl_bases"}.${process.env.NIAT_REVERSE_ETL_TABLE || DETAILS}`;
const csvCell = (v: unknown) => { const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const plain = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v);

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: P, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: P });
  let rows: Record<string, unknown>[];
  try {
    [rows] = await bq.query({ query: `SELECT DISTINCT a.*, b.enrolled_plans AS enrolled_plans FROM \`${P}.${D}.${DETAILS}\` a LEFT JOIN \`${ETL}\` b ON a.instructor_user_id = b.instructor_user_id` });
  } catch (e) {
    console.warn("enrolled_plans join failed, exporting without it:", (e as Error).message);
    [rows] = await bq.query({ query: `SELECT DISTINCT a.* FROM \`${P}.${D}.${DETAILS}\` a` });
  }
  const [mgr] = await bq.query({ query: `SELECT instructor_user_id, STRING_AGG(DISTINCT instructor_manager, '; ') AS managers FROM \`${P}.${D}.${CAPABILITY_MANAGER_TABLE_NAME}\` WHERE instructor_manager IS NOT NULL AND instructor_manager != '' GROUP BY 1` });
  const managersByUid = new Map((mgr as { instructor_user_id: string; managers: string }[]).map((m) => [m.instructor_user_id, m.managers]));
  const people = await db.select().from(instructorsTable);
  const byUid = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, p]));
  const byEmp = new Map(people.filter((p) => p.employeeId).map((p) => [p.employeeId!.toUpperCase(), p]));

  const srcCols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const headers = [...srcCols, "used_by_sync (ACTIVE)", "capability_manager_candidates (manager table)",
    "app_match", "app_employee_id", "app_name", "app_in_teachos", "app_in_darwin", "app_darwin_status", "app_classification", "app_product",
    "app_capability_manager", "app_campus", "app_exit_marked_by_cm", "app_darwin_exit_status"];
  const lines = [headers.map(csvCell).join(",")];
  const sorted = [...rows].sort((a, b) => String(a.instructor_name ?? "").localeCompare(String(b.instructor_name ?? "")));
  for (const r of sorted) {
    const uid = String(r.instructor_user_id ?? "");
    const empId = String(r.nw_instructor_id ?? "").toUpperCase().replace(/\s+/g, "");
    const p = byUid.get(uid) ?? (empId ? byEmp.get(empId) : undefined);
    const how = !p ? "not in the app" : p.teachosUserId === uid ? "matched by TeachOS user id" : "same employee id, different TeachOS account in the app";
    lines.push([
      ...srcCols.map((c) => plain(r[c])),
      String(r.instructor_status ?? "").toUpperCase() === "ACTIVE" ? "yes" : "no",
      managersByUid.get(uid) ?? "",
      how, p?.employeeId, p?.fullName, p ? (p.inTeachos ? "yes" : "no") : "", p ? (p.inDarwin ? "yes" : "no") : "", p?.darwinEmployeeStatus,
      p?.classification, p ? productOf(p) : "", p ? p.teachosManager || p.manualCapabilityManager : "", p?.institutes, p?.exitVerification, p?.exitFlagStatus,
    ].map(csvCell).join(","));
  }
  const out = `${process.env.HOME ?? "."}/workspace/teachos_sync_export.csv`;
  writeFileSync(out, "﻿" + lines.join("\r\n"));
  const active = rows.filter((r) => String(r.instructor_status ?? "").toUpperCase() === "ACTIVE").length;
  console.log(`Wrote ${rows.length} TeachOS rows (${active} ACTIVE, ${rows.length - active} other) to ${out}`);
  console.log(`Source columns: ${srcCols.join(", ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
