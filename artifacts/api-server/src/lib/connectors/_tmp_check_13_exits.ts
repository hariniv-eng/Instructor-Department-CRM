// One-off (2026-10-06): re-check the 13 payroll-converted people with a real
// NW ID but no exit row. Looks for each person in the exits table by exact ID,
// ID with different case/spacing/leading zeros, the numeric part alone, and by
// name (any word-order). Also checks the full roster and the archive row.
// Read-only.
import { db, instructorArchiveTable, darwinboxExitsTable, darwinboxFullRosterTable } from "@workspace/db";
import { normalize } from "../reconcile";

type Raw = Record<string, unknown>;
const pick = (raw: Raw, ...keys: string[]) => { for (const k of keys) { const v = raw?.[k]; if (v !== undefined && v !== null && String(v).trim() !== "") return String(v); } return ""; };
const PEOPLE: Array<[string, string]> = [
  ["Nikitha", "NW0004558"], ["M V S L Satvik", "NW0003871"], ["Pratheek Pralhdachar", "NW0004379"],
  ["Shylaja M", "NW0003994"], ["Anusha Poturi", "NW0004563"], ["Yugandhar Gurjalwar", "NW0005187"],
  ["Doddigarla Joel Prashanth", "NW0005158"], ["Uppara Naveen", "NW0004034"], ["Rachamalla Venkateswarlu", "NW0004042"],
  ["Manjot Singh", "NW0004963"], ["Mallidi Sai Rahul", "NW0005557"], ["Jaka Prasanth", "NW0005556"], ["Safwan Molla", "NW0004701"],
];
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const sortedWords = (s: string) => normalize(s).split(" ").filter(Boolean).sort().join(" ");

async function main() {
  const exits = await db.select().from(darwinboxExitsTable);
  const roster = await db.select().from(darwinboxFullRosterTable);
  const archive = await db.select().from(instructorArchiveTable);
  console.log(`exits rows: ${exits.length} | roster rows: ${roster.length} | archive rows: ${archive.length}\n`);
  for (const [name, id] of PEOPLE) {
    console.log(`=== ${name} | ${id} ===`);
    const arc = archive.find((a) => a.employeeId === id);
    console.log(`  archive: ${arc ? `id=${arc.id} name="${arc.fullName}" inDarwin=${arc.inDarwin} inTeachos=${arc.inTeachos} class=${arc.classification} exitFlag=${arc.exitFlag} exitFlagStatus=${arc.exitFlagStatus} exitFlagDate=${arc.exitFlagDate} exitDate=${arc.exitDate}` : "NOT FOUND by ID"}`);
    const key = sortedWords(name);
    const hits = exits.filter((e) => e.employeeId === id || digits(e.employeeId) === digits(id) || (e.employeeId ?? "").trim().toUpperCase() === id || sortedWords(e.fullName ?? "") === key || (key.split(" ").filter((w) => w.length > 2).length >= 2 && key.split(" ").filter((w) => w.length > 2).every((w) => normalize(e.fullName ?? "").includes(w))));
    if (hits.length === 0) console.log("  exits report: no match by ID, number or name");
    for (const e of hits) console.log(`  exits report: emp=${e.employeeId} name="${e.fullName}" status=${pick(e.rawData as Raw, "Status", "status")} exitDate=${pick(e.rawData as Raw, "Exit Date", "exit_date")} lastWorkingDay=${pick(e.rawData as Raw, "Last Working Day", "Last Working Date")} designation=${pick(e.rawData as Raw, "Current Designation", "Designation")}`);
    // Whole-record search (2026-10-06, per "in the complete exit data"): the ID or
    // name may sit in ANY column of the exit report (e.g. a different ID column,
    // reporting manager, old ID), not just employee_id / full_name.
    const idLower = id.toLowerCase();
    const words = key.split(" ").filter((w) => w.length > 2);
    const seenIds = new Set(hits.map((h) => h.id));
    const deep = exits.filter((e) => {
      if (seenIds.has(e.id)) return false;
      const blob = JSON.stringify(e.rawData).toLowerCase();
      const norm = normalize(blob);
      return blob.includes(idLower) || (words.length >= 2 && words.every((w) => norm.includes(w))) || (words.length === 1 && norm.split(" ").includes(words[0]));
    });
    if (deep.length === 0) console.log("  exits report (any column): nothing else found");
    for (const e of deep) {
      const raw = e.rawData as Raw;
      const where = Object.entries(raw).filter(([, v]) => { const t = String(v ?? "").toLowerCase(); return t.includes(idLower) || words.some((w) => normalize(t).includes(w)); }).map(([k, v]) => `${k}="${v}"`).slice(0, 3).join("; ");
      console.log(`  exits report (other column): row emp=${e.employeeId} name="${e.fullName}" status=${pick(raw, "Status", "status")} exitDate=${pick(raw, "Exit Date", "exit_date")} | matched in: ${where}`);
    }
    const rhits = roster.filter((r) => r.employeeId === id || digits(r.employeeId) === digits(id) || sortedWords(r.fullName ?? "") === key);
    if (rhits.length === 0) console.log("  full roster: no match");
    for (const r of rhits) console.log(`  full roster: emp=${r.employeeId} name="${r.fullName}" status=${pick(r.rawData as Raw, "Employee Status", "Status", "status")} doj=${pick(r.rawData as Raw, "Date of Joining", "date_of_joining")}`);
    console.log("");
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
