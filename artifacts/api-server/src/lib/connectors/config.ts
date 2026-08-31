// Live-sync credentials, read straight from process.env. Loaded via
// `--env-file-if-exists=.env` on the start script (see package.json) for
// local/VS Code dev; in Replit deployment these come from Replit Secrets
// instead, so this file makes no assumption about *how* they got into
// process.env.

function env(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function num(name: string, fallback = 0): number {
  const v = env(name);
  const n = v === undefined ? fallback : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  // Darwinbox Master API (active employees)
  DARWINBOX_ENDPOINT: env("DARWINBOX_ENDPOINT"),
  DARWINBOX_USERNAME: env("DARWINBOX_USERNAME"),
  DARWINBOX_PASSWORD: env("DARWINBOX_PASSWORD"),
  DARWINBOX_API_KEY: env("DARWINBOX_API_KEY"),
  DARWINBOX_DATASET_KEY: env("DARWINBOX_DATASET_KEY"),
  DARWINBOX_SYNC_INTERVAL_HOURS: num("DARWINBOX_SYNC_INTERVAL_HOURS"),

  // Darwinbox Reports Builder API (exit employee details — custom report)
  DBX_CHECK_ENDPOINT: env("DBX_CHECK_ENDPOINT"),
  DBX_CHECK_USERNAME: env("DBX_CHECK_USERNAME"),
  DBX_CHECK_PASSWORD: env("DBX_CHECK_PASSWORD"),
  DBX_CHECK_API_KEY: env("DBX_CHECK_API_KEY"),
  DBX_CHECK_REPORT_ID: env("DBX_CHECK_REPORT_ID"),
  DARWINBOX_EXITS_SYNC_INTERVAL_HOURS: num("DARWINBOX_EXITS_SYNC_INTERVAL_HOURS"),

  // TeachOS via BigQuery
  BIGQUERY_PROJECT_ID: env("BIGQUERY_PROJECT_ID"),
  BIGQUERY_DATASET: env("BIGQUERY_DATASET"),
  BIGQUERY_TABLE: env("BIGQUERY_TABLE"),
  BIGQUERY_SYNC_INTERVAL_HOURS: num("BIGQUERY_SYNC_INTERVAL_HOURS"),
  // Local/VS Code dev: google-cloud/bigquery reads GOOGLE_APPLICATION_CREDENTIALS
  // (a file path) from process.env itself — no need to re-read it here, just
  // make sure it's set in .env (it already is, pointing at
  // ./bigquery-service-account.json).
  //
  // Replit (dev workspace or deployment) has no file to point at — Secrets
  // are plain strings — so set GOOGLE_APPLICATION_CREDENTIALS_JSON there
  // instead, to the *entire contents* of bigquery-service-account.json.
  // bigquery.ts's client() prefers this when present.
  BIGQUERY_CREDENTIALS_JSON: env("GOOGLE_APPLICATION_CREDENTIALS_JSON"),
};

export function missing(keys: readonly (keyof typeof config)[]): string[] {
  return keys.filter((k) => !config[k]);
}
