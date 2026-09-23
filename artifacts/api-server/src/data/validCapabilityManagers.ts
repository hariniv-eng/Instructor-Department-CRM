// Maintained list of who actually holds the "Capability Manager" role,
// confirmed directly (2026-09-08, per request).
//
// Why this file exists: the BigQuery source reconcileCapabilityManager()
// reads from (niat_instructor_managers_and_instructors_details, via
// fetchCapabilityManagerRows() in ../lib/connectors/capabilityManager.ts)
// carries multiple candidate "instructor_manager" rows per instructor --
// up to 8 distinct values for the same person, evidently historical/stale
// assignment rows mixed in with the current one. Only ONE of those
// candidates is the person's real, current Capability Manager; the rest
// are noise (e.g. "Ranjith" and "Rajat" have both been observed written to
// teachos_manager even though neither is an actual Capability Manager).
// Without filtering, reconcileCapabilityManager() previously just took
// whichever candidate came last when iterating BigQuery's result rows --
// so the value that ended up on file for a person was essentially
// arbitrary noise, not a real assignment.
//
// reconcileCapabilityManager() now only accepts a candidate whose name
// matches (via normalize() in ../lib/reconcile.ts -- case/accent/spacing-
// insensitive) an entry in this list; every other candidate row is
// skipped. A person with no matching candidate among their up-to-8 rows is
// left with no Capability Manager rather than getting an arbitrary/wrong
// one written.
//
// "Garlapati Prudhvi Raj" gets extra handling on top of this list: he's a
// real Capability Manager, but shows up as a candidate for far more people
// than the others do, evidently as some kind of default/fallback in the
// source data. reconcileCapabilityManager() treats him as lowest priority
// among valid candidates -- if a person has any OTHER name from this list
// among their candidate rows, that one is used instead of him, even when
// his row is also present. He's only accepted when he's the only valid
// candidate for that person.
//
// To add or remove a Capability Manager: edit this list directly and note
// why in the commit message -- same "durable, human-decided" convention as
// classificationOverrides.ts.
export const VALID_CAPABILITY_MANAGERS: string[] = [
  "Akhilendar Reddy",
  "Boddikurapati Yaswanth",
  "Dharavath Jayanth",
  "Garlapati Prudhvi Raj",
  "Hari Krishna Daggubati",
  "Karthik Katuri",
  "Katuri Karthik",
  "Kushal Kumar Terli",
  "Meka Sri Satya Prudhvi Charan",
  "Nunna Naga Venkata Dasaradhi",
  "Penumarthi Satya Syamala",
  "Pradeep Jat",
  "Preethi Vangaveti",
  "Riya Rai",
  "Shaik Mohammed Pasha",
  "Sigatapu Sai Sankar",
  "solasa vinay",
  "Voppangi Sai Prasanna",
];

// Aliases for how a valid Capability Manager's name is actually recorded as
// an "instructor_manager" candidate in the raw source data, when that
// differs from their full name above -- confirmed via
// check:capability-managers (2026-09-16, per request):
//   - "Riya" (51 candidate rows) and "Pradeep" (29 candidate rows) were
//     being silently dropped as unmatched/invalid, even though they're
//     really Riya Rai and Pradeep Jat -- the source only ever records
//     their first name, never the full name reconcileCapabilityManager()
//     was matching against.
//   - "Akhil" (19 candidate rows) is Akhilendar Reddy -- confirmed against
//     Darwin's own record for NW0001087 ("Akhilendar Reddy Karri",
//     designation "Capability Manager"), same first-name-only truncation
//     as the other two.
//
// Note: "Naga Venkata Dasaradhi Nunna" (132 candidate rows, same four words
// as "Nunna Naga Venkata Dasaradhi" reversed) was also considered for this
// list but deliberately left out, per request (2026-09-16) -- don't add it
// back without checking first.
//
// Key = the raw candidate value as recorded in BigQuery, looked up via the
// same normalize() (case/accent/spacing-insensitive) reconcileCapabilityManager()
// already uses for everything else. Value = the canonical full name from
// VALID_CAPABILITY_MANAGERS above, which is what actually gets written to
// teachos_manager -- so the app always shows one consistent full name for
// these, regardless of which raw variant the source happened to record.
export const CAPABILITY_MANAGER_ALIASES: Record<string, string> = {
  Riya: "Riya Rai",
  Pradeep: "Pradeep Jat",
  Akhil: "Akhilendar Reddy",
};
