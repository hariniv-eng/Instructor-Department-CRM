// Maintained overrides for the "TeachOS instructor count" standing rule.
//
// This is the durable, git-tracked source of truth the app's own
// classification logic (recomputeStatuses() in ../lib/reconcile.ts) reads
// on every reconcile. It replaces the one-off exports/*.csv files from the
// original manual analysis (exports/ is gitignored — it holds raw PII CSV
// dumps and is never a place the app itself reads from). See
// exports/TEACHOS_INSTRUCTOR_COUNT_RULES.md for the narrative rule this
// file encodes, and exports/instructor_classification_notes.csv /
// exports/payroll_converted_instructors_27.csv for the original source data
// these entries were seeded from (2026-08-27).
//
// To add a new person: append an entry below and note the decided_date.
// This list can only grow with a real human decision behind each entry —
// nothing here should ever be inferred automatically.
//
// Matching key: teachosUserId first (exact match against TeachOS's stable
// instructor_user_id, the same UUID storeRaw.ts/reconcile.ts already treat
// as the reliable TeachOS-side identity), falling back to normalized full
// name — the same employeeId-then-name fallback pattern findMatch() already
// uses elsewhere in reconcile.ts. employeeId is kept here for humans reading
// this file and for display; don't rely on it for matching — a TeachOS-only
// row rarely has a resolved employeeId on the instructors table (that's
// exactly why these particular people needed a manual override).

export type ExcludedClassification = "excluded_other_department" | "excluded_non_department_team";

export interface ExcludedOverride {
  teachosUserId?: string;
  employeeId?: string;
  fullName: string;
  classification: ExcludedClassification;
  reason: string;
  decidedDate: string;
}

export interface PayrollConvertedOverride {
  teachosUserId?: string;
  employeeId?: string;
  fullName: string;
  reason: string;
  decidedDate: string;
}

// 6 people found in TeachOS deployment data whose real designation/
// department isn't a teaching/instructor role at all (see the standing
// rule) — excluded from every instructor count, though they may still
// appear in the raw TeachOS table itself.
export const EXCLUDED_EMPLOYEES: ExcludedOverride[] = [
  { employeeId: "NW0005088", fullName: "Shaik Musharaf", classification: "excluded_other_department", reason: "Video Editor (Video House - NIAT) — support role, not a teaching/instructor designation", decidedDate: "2026-08-27" },
  { employeeId: "NW0007350", fullName: "Srinivas Vatturi", classification: "excluded_other_department", reason: "NIAT - Head of Operations (NIAT_Program Operations) — operations management, not a teaching/instructor designation", decidedDate: "2026-08-27" },
  { employeeId: "NW0001240", fullName: "Tejaswini Venkata", classification: "excluded_other_department", reason: "Head of Department - English and Communication Skills (Content – Aptitude & English) — HOD/managerial role, not a teaching/instructor designation", decidedDate: "2026-08-27" },
  { employeeId: "NW0003135", fullName: "Uday Kiran Palepu", classification: "excluded_other_department", reason: "Center Head (Student Success) — center management role, not a teaching/instructor designation", decidedDate: "2026-08-27" },
  { employeeId: "NW0001135", fullName: "Sireesha Maddikari", classification: "excluded_non_department_team", reason: "User-directed: classified as non-department team despite an Instructor designation (Learning Outcomes Academy)", decidedDate: "2026-08-27" },
  { teachosUserId: "657a9e364eaa4241a013f6483fdd2b6e", employeeId: "NW0006137", fullName: "Chandil Gauthami", classification: "excluded_other_department", reason: "Product Manager (Instructor Platform, NWD_P_IP) — a platform/engineering role, not a teaching/instructor designation, despite the department name containing \"Instructor\". Found via full-roster cross-check (2026-09-03): not in the Instructors department at all, but does exist elsewhere in Darwin.", decidedDate: "2026-09-03" },
];

// 30 people found in TeachOS deployment data with no direct Darwin match:
// 27 confirmed against an uploaded payroll reference file (25 from the
// original 2026-08-27 upload, plus varshini and Anusha M added from a
// fresher 61-entry payroll file uploaded 2026-08-29), plus 2 explicit user
// overrides (Dr K Naresh / Dr Dr Gopinath — placeholder-style employee ids
// NWXXX0001 / NWXXX0002 that don't follow Darwin's real id format and will
// likely never resolve), plus 1 name-matched-with-id-conflict entry
// (Shrinath Salunke — see its own reason field). Counted as instructors
// regardless. Sushant Bakshi's entry also carries an unresolved id conflict
// flagged 2026-08-29 — see its reason field.
export const PAYROLL_CONVERTED_EMPLOYEES: PayrollConvertedOverride[] = [
  { teachosUserId: "759243ce741e46219147203f86a77251", employeeId: "NW0004555", fullName: "Ajay Kumar Maharana", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "fda5331a720241a38685507026c94455", employeeId: "NW0004155", fullName: "Annan sadr", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "441d191a1d154446abe2afd916257e68", employeeId: "NW0004563", fullName: "Anusha Poturi", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "6a7c8094b1fd483990827c3c49abc927", employeeId: "NW0005555", fullName: "Chinoori Shireesha", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "7157065f885e4abd8aaaa68aa7597fa6", employeeId: "NW0005158", fullName: "Doddigarla Joel Prashanth", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "938aa84f051648b8b759b7ab4e4bcaf0", employeeId: "NWXXX0002", fullName: "Dr Dr Gopinath", reason: "User override — not matched in payroll reference file either; placeholder-style employee id, will likely never resolve against Darwin data", decidedDate: "2026-08-27" },
  { teachosUserId: "7c2f88ca7a8e42b394f8e7701a004439", employeeId: "NWXXX0001", fullName: "Dr K Naresh", reason: "User override — not matched in payroll reference file either; placeholder-style employee id, will likely never resolve against Darwin data", decidedDate: "2026-08-27" },
  { teachosUserId: "eff89f7296594c9abb30f681fc5bc2b5", employeeId: "NW0004164", fullName: "J V Ayyappan", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "87d7dd8a4f454a688c382a91a59fa2b6", employeeId: "NW0005556", fullName: "Jaka Prasanth", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "e3fcd4664e6248a39334450721e741a8", employeeId: "NW0005110", fullName: "Kathiravan N", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "3c5a6a0009574152a70c40c3e77b2382", employeeId: "NW0003871", fullName: "M V S L SATVIK", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "4fcdc59b427945cca896023ce05ebbfc", employeeId: "NW0005557", fullName: "Mallidi Sai Rahul", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "c1955e40b065461e9066be186cb80735", employeeId: "NW0004963", fullName: "Manjot Singh", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "2938ac428639489d8d73689fcd9b38f7", employeeId: "NW0004566", fullName: "Mortha Rajesh", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "db33c92e2f8d498a87b1d13a72a42870", employeeId: "NW0004558", fullName: "Nikitha", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "19291147642540b6aacd3ad4e06bae6f", employeeId: "NW0004379", fullName: "Pratheek Pralhdachar", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "10d5d4c127c2460bb9112114294f9b59", employeeId: "NW0004821", fullName: "Riddhim", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "5e9c88ae3205495daa41c1847eb3fc74", employeeId: "NW0004701", fullName: "Safwan Molla", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "75eb5bf08d3d47a5bd0ce004756f55eb", employeeId: "NW0004808", fullName: "Samyukth Maheta B", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "703ec5259bc04274b8f84c8b0db1f346", employeeId: "NW0004066", fullName: "Satya Aparna", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "d934bb9c6935472a839f710a50888ed0", employeeId: "NW0003994", fullName: "Shylaja M", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "28d1c9358a444b71a4f5efe4f82efcd2", employeeId: "NW0003926", fullName: "Suhas Kambham", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "c68b0b39bd1f41b5b09889ccb4270dc4", employeeId: "NW0004695", fullName: "Surakshit Nautiyal", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "9a9b7ecfc00c472c95bd46ca4032fd4f", employeeId: "NW2000461", fullName: "Sushant Bakshi", reason: "Confirmed against uploaded payroll reference file. NOTE (2026-08-29): a newer payroll file lists employee_id NW0003833 for this same name — conflicts with the NW2000461 already resolved here via Darwin/TeachOS matching. Needs manual review to confirm which id is correct; left as NW2000461 for now.", decidedDate: "2026-08-27" },
  { teachosUserId: "fefd6eb7066441c6841c82a5d8ca667a", employeeId: "NW0004376", fullName: "varshini", reason: "Confirmed against uploaded payroll reference file (2026-08-29 upload, 61 entries)", decidedDate: "2026-08-29" },
  { teachosUserId: "9a30a2e81af943bcaffce0c6ca1e340f", employeeId: "NW0004548", fullName: "Anusha M", reason: "Confirmed against uploaded payroll reference file (2026-08-29 upload, 61 entries)", decidedDate: "2026-08-29" },
  { teachosUserId: "67894443787042528a81393f1d14c720", employeeId: "NW0006431", fullName: "Shrinath Salunke", reason: "Name matched in uploaded payroll reference file (2026-08-29 upload), but that file lists employee_id NW0004108 for this name — conflicts with NW0006431 already resolved here via Darwin/TeachOS matching. Needs manual review to confirm which id is correct; left as NW0006431 for now.", decidedDate: "2026-08-29" },
  { teachosUserId: "e57021affc5840cf8bf14cec7f806048", employeeId: "NW0004034", fullName: "UPPARA NAVEEN", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "c21f9b0125e64b50967e6e95b88f46b2", employeeId: "NW0004704", fullName: "Uthara S", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
  { teachosUserId: "d1a635805ba543b7baa65918bea82549", employeeId: "NW0005187", fullName: "Yugandhar Gurjalwar", reason: "Confirmed against uploaded payroll reference file", decidedDate: "2026-08-27" },
];
