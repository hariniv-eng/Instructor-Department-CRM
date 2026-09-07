const { readFileSync } = require("fs");

function loadEnv(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
loadEnv(".env");

const endpoint = process.env.DARWINBOX_ENDPOINT;
const username = process.env.DARWINBOX_USERNAME;
const password = process.env.DARWINBOX_PASSWORD;
const apiKey = process.env.DARWINBOX_API_KEY;
const datasetKey = process.env.DARWINBOX_DATASET_KEY;

const auth = "Basic " + Buffer.from(username + ":" + password).toString("base64");

(async () => {
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ api_key: apiKey, datasetKey: datasetKey }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error("Darwinbox API returned HTTP " + resp.status + ": " + text.slice(0, 500));
  }
  const raw = await resp.json();
  let records = Array.isArray(raw) ? raw : (raw.employee_data || raw.data || raw.employees || raw.records);
  if (!Array.isArray(records)) throw new Error("Unrecognized response shape: " + Object.keys(raw).join(", "));
  require("fs").writeFileSync("darwin_full_roster.json", JSON.stringify({ count: records.length, rows: records }, null, 2));
  console.log("Wrote " + records.length + " total company records to darwin_full_roster.json (ALL departments, not just Instructors)");
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
