const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({
  projectId: "kossip-helpers",
  keyFilename: "./bigquery-service-account.json",
});
(async () => {
  const query = "SELECT instructor_user_id, instructor_name, nw_instructor_id AS employee_id, institute_name, institute_type, instructor_category, instructor_role, instructor_status FROM `kossip-helpers.niat_instructor_automation_data.niat_instructor_details` WHERE UPPER(instructor_status) = 'ACTIVE' ORDER BY instructor_name";
  const [rows] = await bq.query({ query });
  require("fs").writeFileSync("niat_active_instructors.json", JSON.stringify({ count: rows.length, rows }, null, 2));
  console.log("Wrote " + rows.length + " rows to niat_active_instructors.json");
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
