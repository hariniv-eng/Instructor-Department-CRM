// Builds a per-person Capability Manager map for every Instructor, Mentor,
// and Operations team member currently in the CRM, using:
//   1. the live public report (/api/reports/instructors) for the current
//      population + each person's teachos_user_id
//   2. exports/teachos.csv (the niat_instructor_managers_and_instructors_
//      details BigQuery export you already pulled) for the
//      instructor_user_id -> instructor_manager (Capability Manager) mapping
//   3. darwin_full_roster.json for resolving each Capability Manager's own
//      employee ID (via corporate email first, name as a fallback)
//
// Pure built-in Node (fetch + fs) -- no npm dependencies, so it runs fine
// even with the broken node_modules symlinks. Run from inside
// artifacts/api-server:
//   node build_capability_manager_map.cjs

const fs = require("fs");

function norm(s) { return (s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
function tokenSet(s) { return norm(s).split(" ").filter(Boolean).sort().join(" "); }
function parseCsvLine(line) { return line.split(","); }

async function main() {
  // 1. Fetch live report (public endpoint -- no login needed)
  const resp = await fetch("https://instructor-department-crm-instructorcentr.replit.app/api/reports/instructors");
  if (!resp.ok) throw new Error("report fetch failed: HTTP " + resp.status);
  const report = await resp.json();

  function mergedPeople(split) {
    if (!split) return [];
    const seen = new Map();
    for (const bucket of ["darwin_only", "both", "teachos_only"]) {
      for (const p of (split[bucket]?.people || [])) seen.set(p.id, p);
    }
    return [...seen.values()];
  }
  const categories = {
    instructors: mergedPeople(report.access_breakdown?.instructors),
    mentors: mergedPeople(report.access_breakdown?.mentors),
    ops_team: mergedPeople(report.access_breakdown?.ops_team),
  };
  console.error("Population sizes:", Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.length])));

  // 2. Load teachos.csv -> instructor_user_id -> manager info
  const csvText = fs.readFileSync("exports/teachos.csv", "utf8");
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",");
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const managerByTeachosId = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const tid = (cols[idx.instructor_user_id] || "").trim();
    if (!tid) continue;
    const mgrName = (cols[idx.instructor_manager] || "").trim();
    const mgrMail = (cols[idx.instructor_manager_mail] || "").trim().toLowerCase();
    if (mgrName && mgrName.toUpperCase() !== "NA") {
      managerByTeachosId.set(tid, { name: mgrName, mail: mgrMail });
    }
  }

  // 3. Load darwin roster, build lookup maps to resolve manager employee IDs
  const darwin = JSON.parse(fs.readFileSync("darwin_full_roster.json", "utf8"));
  const byEmail = new Map(), byExactName = new Map(), byTokenName = new Map();
  for (const r of darwin.rows) {
    const e = norm(r.org_email_id);
    if (e) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e).push(r); }
    const n = norm(r.full_name);
    if (!byExactName.has(n)) byExactName.set(n, []);
    byExactName.get(n).push(r);
    const t = tokenSet(r.full_name);
    if (!byTokenName.has(t)) byTokenName.set(t, []);
    byTokenName.get(t).push(r);
  }
  const managerEmployeeCache = new Map();
  function getManagerEmployee(mgr) {
    const key = mgr.name + "|" + mgr.mail;
    if (managerEmployeeCache.has(key)) return managerEmployeeCache.get(key);
    let result = null;
    if (mgr.mail && byEmail.has(mgr.mail)) result = byEmail.get(mgr.mail)[0];
    else {
      const en = norm(mgr.name);
      if (byExactName.has(en) && byExactName.get(en).length === 1) result = byExactName.get(en)[0];
      else {
        const tn = tokenSet(mgr.name);
        if (byTokenName.has(tn) && byTokenName.get(tn).length === 1) result = byTokenName.get(tn)[0];
      }
    }
    managerEmployeeCache.set(key, result);
    return result;
  }

  // 4. Build output rows
  const rows = [];
  for (const [category, people] of Object.entries(categories)) {
    for (const p of people) {
      const mgr = p.teachos_user_id ? managerByTeachosId.get(p.teachos_user_id) : null;
      const mgrEmp = mgr ? getManagerEmployee(mgr) : null;
      rows.push({
        category, full_name: p.full_name, employee_id: p.employee_id || "",
        teachos_user_id: p.teachos_user_id || "",
        capability_manager: mgr ? mgr.name : "",
        capability_manager_mail: mgr ? mgr.mail : "",
        capability_manager_employee_id: mgrEmp ? mgrEmp.employee_id : (mgr ? "NOT_FOUND" : ""),
      });
    }
  }
  rows.sort((a, b) => a.category.localeCompare(b.category) || a.full_name.localeCompare(b.full_name));

  const cols = ["category", "full_name", "employee_id", "teachos_user_id", "capability_manager", "capability_manager_mail", "capability_manager_employee_id"];
  const esc = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [cols.join(",")].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(","))).join("\r\n");
  fs.mkdirSync("exports", { recursive: true });
  fs.writeFileSync("exports/instructor_capability_manager_map.csv", out, "utf8");

  const withManager = rows.filter((r) => r.capability_manager).length;
  console.error(`Wrote ${rows.length} rows to exports/instructor_capability_manager_map.csv`);
  console.error(`  With a Capability Manager assigned: ${withManager}`);
  console.error(`  No TeachOS match (Darwin-only, so no manager on file): ${rows.length - withManager}`);
  console.error(`  Manager name matched but employee ID unresolved: ${rows.filter((r) => r.capability_manager_employee_id === "NOT_FOUND").length}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
