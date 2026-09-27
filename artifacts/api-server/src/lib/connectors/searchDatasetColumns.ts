// One-off CLI helper: searches every table in the configured BigQuery
// dataset for a column whose name contains a given search term. Built
// (2026-09-27, per the back-and-forth trying to locate a column reported as
// "enroleplan"/"enrolled_plan" -- neither name turned up on
// niat_instructor_details when checked directly) so a column can be found
// by a fuzzy name match across the WHOLE dataset instead of guessing which
// table it's actually on, one check:*-column run at a time.
//
// Reads INFORMATION_SCHEMA.COLUMNS for the dataset -- a live, authoritative
// list of every column on every table, not anything hardcoded in this
// codebase -- so this reflects reality even for a table none of the
// existing connectors (bigquery.ts, niatInstructorDetails.ts, etc.) know
// about yet.

import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";

export class SearchDatasetColumnsError extends Error {}

const REQUIRED = ["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const;
const API_TIMEOUT_MS = 30000;

function assertConfigured() {
  const missingKeys = missing(REQUIRED);
  if (missingKeys.length) {
    throw new SearchDatasetColumnsError(`BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  }
}

function client(): BigQuery {
  assertConfigured();
  try {
    if (config.BIGQUERY_CREDENTIALS_JSON) {
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(config.BIGQUERY_CREDENTIALS_JSON);
      } catch (e) {
        throw new SearchDatasetColumnsError(`GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${(e as Error).message}`);
      }
      return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials });
    }
    return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
    if (e instanceof SearchDatasetColumnsError) throw e;
    throw new SearchDatasetColumnsError(`Could not create BigQuery client: ${(e as Error).message}`);
  }
}

/**
 * Searches every table in the configured dataset (BIGQUERY_DATASET) for any
 * column whose name contains `term` (case-insensitive substring match), and
 * prints each match as "table.column (type)". Also searches every OTHER
 * dataset in the same project, in case the table in question doesn't live
 * in the app's usual dataset at all.
 */
export async function searchColumns(term: string): Promise<void> {
  const bq = client();
  const project = config.BIGQUERY_PROJECT_ID;
  const primaryDataset = config.BIGQUERY_DATASET;
  const pattern = `%${term.toLowerCase()}%`;

  const runSearch = async (dataset: string) => {
    const query = `SELECT table_name, column_name, data_type FROM \`${project}.${dataset}\`.INFORMATION_SCHEMA.COLUMNS WHERE LOWER(column_name) LIKE @pattern ORDER BY table_name, ordinal_position`;
    const [rows] = await runWithHardTimeout(
      () => bq.query({ query, params: { pattern } }),
      API_TIMEOUT_MS * 3 + 10000
    );
    return rows as { table_name: string; column_name: string; data_type: string }[];
  };

  try {
    const primaryMatches = await runSearch(primaryDataset!);
    console.log(`Searching dataset "${primaryDataset}" for columns matching "${term}"...`);
    if (primaryMatches.length === 0) {
      console.log(`  No matches in "${primaryDataset}".`);
    } else {
      for (const row of primaryMatches) console.log(`  ${row.table_name}.${row.column_name} (${row.data_type})`);
    }

    // Also check every other dataset in the project, in case the table
    // isn't in the one this app is already configured to read from.
    const [datasets] = await runWithHardTimeout(() => bq.getDatasets(), API_TIMEOUT_MS + 10000);
    const otherDatasetIds = datasets.map((d) => d.id).filter((id): id is string => !!id && id !== primaryDataset);
    if (otherDatasetIds.length) {
      console.log(`\nAlso checking ${otherDatasetIds.length} other dataset(s) in this project: ${otherDatasetIds.join(", ")}`);
      for (const datasetId of otherDatasetIds) {
        try {
          const matches = await runSearch(datasetId);
          if (matches.length) {
            console.log(`  Dataset "${datasetId}":`);
            for (const row of matches) console.log(`    ${row.table_name}.${row.column_name} (${row.data_type})`);
          }
        } catch (e) {
          console.log(`  Dataset "${datasetId}": could not search (${e instanceof Error ? e.message : e})`);
        }
      }
    }
  } catch (e) {
    if (e instanceof HardTimeout) throw new SearchDatasetColumnsError(`Search failed: ${e.message}`);
    throw new SearchDatasetColumnsError(`Search failed: ${(e as Error).message}`);
  }
}
