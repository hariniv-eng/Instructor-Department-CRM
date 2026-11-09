# FCC change log

One entry per change: what changed, the file(s) where it lives, and what is needed after pulling (DB push / Publish / Sync Now).
Commit messages stay short (title + 2-3 lines); this file is the detailed record. Newest first.

## Where things live (quick reference)

| To change ... | Edit this file |
|---|---|
| Courses, lecture lists, unit IDs, course order inside a subject (e.g. GenAI: Intro to Gen AI -> LLM -> AI for Finance) | `artifacts/api-server/src/data/lectureSessions.ts` (generated from `artifacts/api-server/src/data/lecture_sessions_master.csv` -- edit both) |
| Training Stats tab names / order (Training - LP, Training - Demos, Taught in Class) | `artifacts/instructor-crm/src/pages/training-stats.tsx` (`TRAINING_VIEWS`) |
| Taught in Class page (columns, cells, filters) | `artifacts/instructor-crm/src/pages/taught-training.tsx`; data: `artifacts/api-server/src/lib/connectors/taughtTraining.ts`; API: `artifacts/api-server/src/routes/reports.ts` (`/reports/taught-training`) |
| Training - Demos page | `artifacts/instructor-crm/src/pages/demo-training.tsx`; data: `artifacts/api-server/src/lib/connectors/demoTraining.ts`; API: `routes/reports.ts` (`/reports/demo-training`) |
| Which demo / AI assessment types count, topic-to-lecture name matching | `artifacts/api-server/src/lib/connectors/demoTraining.ts` |
| What the Training Status Sync Now builds | `artifacts/api-server/src/routes/sync.ts` (`runTrainingStatusSync`) |
| Database tables | `lib/db/src/schema/index.ts` (then `pnpm --filter @workspace/db run push`) |
| Overview NIAT cohort card: batch name -> cohort | `artifacts/api-server/src/lib/connectors/instructorContribution.ts` (`BATCH_NAME_TO_NIAT_COHORT`) |
| Instructors tab fallbacks for people not in Darwin (gender, subject, joining date, email...) | `artifacts/api-server/src/routes/reports.ts` (`toApiInstructorSummary`); what the archive keeps: `artifacts/api-server/src/lib/archiveInstructors.ts` |
| Product (NIAT Deployed / Training / Academy / Intensive / IIT X DSA / Support) | `artifacts/api-server/src/lib/product.ts` (`productOf`) + `artifacts/instructor-crm/src/pages/instructors.tsx` (`productLabel`) |
| Instructors tab table (columns, frozen header / name column) | `artifacts/instructor-crm/src/pages/instructors.tsx` (`CategoryTable`, `PersonRow`, `STICKY_NAME_CELL`) |
| Overview card explanations (the (i) icon texts) | `artifacts/instructor-crm/src/components/info-tip.tsx` (`OVERVIEW_INFO`) |
| What the Instructor Archive stores (joining date, gender, subject ...) | `artifacts/api-server/src/lib/archiveInstructors.ts` |
| One-off read-only checks | `artifacts/api-server/src/lib/connectors/_tmp_*.ts` |

## 2026-11-09
- **Automatic: Serving Notice Period -> Exited after the date of exit** (per request) -- the ONE automatic change the sync makes to Employee Status: a person marked Serving Notice Period whose date of exit (Darwin "Date Of Exit"; for payroll-converted people the typed-in date) is before today (IST) is set to Exited. They then leave the Serving notice list and appear in Remove TeachOS access (if still in TeachOS) and in the Exit data. Logged in the change log as "by the SYNC (date of exit ... has passed)". Every other manual entry is still never changed by the sync. Runs at every sync (daily + Sync Now).
  File: `artifacts/api-server/src/lib/reconcile.ts` (`recomputeStatuses`). After pull: Publish, then Sync Now (Darwin or exits).
- **Serving notice period ended -> Exited** (per request, NW0005061) -- a person marked Serving Notice Period whose Darwin exit is Approved and whose Date Of Exit has passed (before today, IST) now shows as Exited in the Instructor Archive, so the Overview Exit data card counts them under Exits instead of "Upcoming -- serving notice". The Overview's Exception 2 already moves such people (still in TeachOS) to the remove-access list on the same date. The CM's mark itself is not changed.
  File: `artifacts/api-server/src/routes/reports.ts` (archive status in the archive row builder). After pull: Publish (no sync needed).
- **Overview Product mix: Support removed** (per request) -- the card now counts instructors + mentors only; the Operations team and anyone whose product is Support are left out of the donut, the percentages and the list (Support had been counted since the 10 Oct 2026 redesign). The (i) note says so.
  Files: `artifacts/instructor-crm/src/pages/dashboard.tsx` (`ProductMixCard`), `components/info-tip.tsx` (`OVERVIEW_INFO.productMix`). After pull: Publish.
- **Fix: filter drop-downs hidden behind the table header** -- the frozen (sticky) table header had the same layer as the open filter list, so the header row covered part of it. The list now sits above it. File: `artifacts/instructor-crm/src/pages/instructors.tsx` (`MultiSelectFilter`, used on every page with these filters). After pull: Publish.
- **Overview: Semester 1 / Semester 3 boxes removed** (per request) from the Contribution of NIAT instructors & mentors card; the cohort list is unchanged. File: `artifacts/instructor-crm/src/pages/dashboard.tsx` (`NiatContributionCard`). After pull: Publish.
- **Cause found for NW2000452** -- TeachOS gives him NW2000452; Darwin has no employee NW2000452 (he exited, Approved, 25 Jul 2026). The old full-roster NAME fallback matched him to another Darwin employee with the same name (NW1008701, Business Development Associate) every sync, writing that person's details and employee ID onto his row; TeachOS then set NW2000452 back. The ID flipping made his exit flag go off and on each sync, which triggered the (now removed) rule that cleared the Payroll Converted mark. Fixed by ID-only matching; `_tmp_fix_name_link.ts` (dry run, then `--apply`) clears the copied values on his live and archive rows.
- **Matching by employee ID only -- no more name matching** -- Darwin, TeachOS, the TeachOS ID reference, the Darwin full-roster fallback, the confirmed-designation pass, manual exit uploads and the Instructor Archive now link people ONLY by employee ID (TeachOS rows: TeachOS user id first, then employee ID). The full-name fallbacks are removed: one linked a TeachOS instructor to a different Darwin employee with the same name (NW2000452 showed a Business Development Associate's details and exit). A person with no ID on a source is simply not linked to it. Not changed: hand-written override lists (classificationOverrides.ts) entries without an ID, and the HOD lookup's manager-name fallback.
  Files: `artifacts/api-server/src/lib/reconcile.ts` (`findMatch`, `reconcileTeachos`, `reconcileDarwinFullRosterFallback`, confirmed-designation pass, `reconcileTeachosEmployeeIdReference`), `lib/archiveInstructors.ts` (`findArchiveMatch`), new read-only `_tmp_id_link_check.ts`. Links made by name in the past stay until removed (see the check). After pull: Publish, then Sync Now.
- **Manual entries are never changed by the sync** -- removed the rule in `recomputeStatuses` that cleared a Payroll Converted Employee Status when an exit record newly appeared. Employee Status is now only ever written from the page. (Other manual fields -- subject, gender, Capability Manager, exit date, joining date -- are separate manual columns the sync does not write.)
  File: `artifacts/api-server/src/lib/reconcile.ts`. After pull: Publish.
- **Employee Status change log** -- every Employee Status (CM mark) saved on the page, is written to the uploads log (source "Employee Status change", e.g. `NW2000452: (empty) -> payroll_converted on the page`). Added because NW2000452's Payroll Converted mark kept disappearing; his exit record and exit flag were stable, so the sync's clear rule should not have fired -- the log will show what clears it.
  Files: `artifacts/api-server/src/routes/instructors.ts` (PATCH exit-verification), `_tmp_cm_mark_check.ts` (section 5 shows the log for one ID). After pull: Publish.

## 2026-11-07
- **Training - Demos: 10-minute rule + hover note** -- for demos, each cell now shows the different lectures covered by demos of 10 minutes or more (audio length) and their average QA. Hovering (or tapping) a cell shows a note: total demos, how many were under 10 minutes, how many of the 10+ minute ones were repeats, the average of the 10+ minute ones and of all, and the last date. AI assessments are not cut at 10 minutes (they are 5-12 min by nature); their note shows total, repeats and average. CSV: per course and kind -- lectures, total, under 10 min, repeats, avg score, avg score (all).
  Files: `lib/db/src/schema/index.ts` (`instructor_demo_course`: demos_short, lectures_long, score_sum_long, scored_long, repeats, repeats_long), `artifacts/api-server/src/lib/connectors/demoTraining.ts`, `lib/storeRaw.ts` (`storeDemoCourses`), `routes/reports.ts` (`/reports/demo-training`), `instructor-crm/src/pages/demo-training.tsx` (`StatCell`). **After pull: `pnpm --filter @workspace/db run push`, then Publish, then Sync Now.**
- **Fix: Training - Demos counted one demo in several courses** -- a topic name that is a lecture in more than one course (e.g. "Your Learning Journey" = Intro to Gen AI #1, LLM #6, AI for Finance #1) was counted in all of them (NW2000396: 1 demo shown as 3). Now each demo / AI assessment counts in ONE course: the one where the instructor has other evaluations matching only that course, else the earliest course in the list.
  File: `artifacts/api-server/src/lib/connectors/demoTraining.ts` (`fetchDemoCourseRows`). After pull: Publish, then Sync Now. (`_tmp_person_demos.ts` still lists every course a topic name matches, per row.)
- **Training - Demos: in training vs after deployment** -- each course now has four columns: In-training demos, Demos after deployment, In-training AI assessments, AI assessments after deployment. In training = every TRAINING_DEMO / TRAINING_AI_ASSESSMENT, plus regular DEMO / AI_ASSESSMENT dated on or before the deployment date (Contribution's first session; not deployed yet -> all of them). After deployment = regular ones after that date. Each cell now also shows the number of demos (repeats included) under the lectures covered. Demos dated before the joining date are kept in In training, not dropped.
  Files: `artifacts/api-server/src/lib/connectors/demoTraining.ts` (`demoKindOf`, `fetchDemoCourseRows`), `routes/sync.ts` (joining + deployment dates passed in), `routes/reports.ts` (`/reports/demo-training`, 4 kinds), `instructor-crm/src/pages/demo-training.tsx`, `_tmp_person_demos.ts` (shows dates and "counted as" per row). No schema change (kinds stored in `evaluation_kind`). After pull: Publish, then Sync Now (until then, old rows show as after deployment).
- **Training - LP: DSA column now reads the semester 2 DSA course** -- course id `e216af3e-bcd0-4dee-9c4f-67e7502ecba3` (same course as "DSA (C++)" on Demos / Taught in class) instead of DSA Foundation (`bb04e38a...`). Matched by course id only. DAA and IPS unchanged.
  File: `artifacts/api-server/src/data/trainingCourseTaxonomy.ts` (`dsa`). After pull: Publish, then Sync Now on Training - LP. If the column comes out empty, the portal table has no rows for this course id -- check with `_tmp_portal_course_units.ts e216af3e-bcd0-4dee-9c4f-67e7502ecba3`.
- **Training - Demos: old-course topics now counted** -- 11 demo topic names from the old Static / Responsive Website courses (Bootstrap, Bootstrap Grid / Navbar, Favourite Places, Website Integration, CSS Transforms, Intro to Responsive Web Design) and "Introduction to Generative AI" were matched to no course, so those demos were dropped. They now count for HTML & CSS / Modern Responsive UI / Introduction to Gen AI in the number of demos and the average score, but not in "lectures covered" (that stays out of the new course's 20 / 21 lectures). Found on NW2000396 (12 of 36 completed demos were not counted).
  Files: `artifacts/api-server/src/lib/connectors/demoTraining.ts` (`EXTRA_TOPICS`), `_tmp_person_demos.ts` (prints "old-course topic", plus per-type counts). After pull: Publish, then Sync Now.
- **Overview: instructors per semester** -- the "Contribution of NIAT instructors & mentors" card now shows two boxes: Semester 1 (teaching NIAT 2026) and Semester 3 (teaching NIAT 2025). Someone teaching both cohorts counts in both; the footnote says how many. Same population as the card (NIAT Deployed instructors + mentors, cohort from the last 30 days / 2 months).
  File: `artifacts/instructor-crm/src/pages/dashboard.tsx` (`NiatContributionCard`). After pull: Publish.
- Added read-only `_tmp_semester_courses.ts` (each cohort's semester courses with dates; not needed now that the semester list was shared).

## 2026-11-06

- **Exit data list: Download CSV** -- the Overview Exit data card's pop-up has a "Download CSV (n)" button. One file (`exit-data-YYYY-MM-DD.csv`) with all three lists and a "List" column (Exits / Upcoming -- Exited or Absconded / Upcoming -- serving notice). Columns: Name, Employee ID, Subject, Capability Manager, Marked as, Approval, Date of exit, Date type. The file has staff names.
  File: `artifacts/instructor-crm/src/pages/dashboard.tsx` (`ExitKpiCard`). After pull: Publish.
- **Payroll date of exit: calendar pop-up** -- clicking the box opens a calendar next to it with Month and Year dropdowns; clicking a day saves it at once; "Clear" removes it. Replaces the typed date box.
  File: `artifacts/instructor-crm/src/pages/instructors.tsx` (`DateOfExitCell`, uses `components/ui/popover` + `components/ui/calendar`). After pull: Publish.
- **Fix: payroll instructors' manual date of exit (Instructors tab)** -- (1) the date picker did not open: the row is a link and the click-stop that keeps it from opening the profile also blocked the browser's picker; clicking the box now opens the picker itself. (2) For a CM-marked Payroll Converted person still in Darwin, the typed date was saved but the column kept showing Darwin's date; it now shows the typed date for every payroll person (same test as the editable box).
  Files: `artifacts/instructor-crm/src/pages/instructors.tsx` (`DateOfExitCell`), `artifacts/api-server/src/routes/reports.ts` (`date_of_exit` in `toApiInstructorSummary`). After pull: Publish.

## 2026-11-05

- **Instructor Archive keeps a joining date for everyone** -- Darwin's date as before; for people Darwin never gave one to (payroll-converted) or who left before it was kept, filled from their Darwin exit record's "Date Of Joining", else the date typed in on the Contribution tab. Also fills archived people who have already left. Once stored it stays. Shown in the Archive's "Date of joining" column and CSV.
  File: `artifacts/api-server/src/lib/archiveInstructors.ts` (`loadJoiningFallback`, `archiveInstructors`). After pull: Publish + Sync Now (Darwin) -- the archive is filled during the sync.
- **Overview (i) notes shortened** -- each card's note is now one line saying where the number comes from (e.g. Instructor Department: "Darwin's Instructors department + TeachOS's payroll-converted instructors.").
  File: `artifacts/instructor-crm/src/components/info-tip.tsx` (`OVERVIEW_INFO`). After pull: Publish.
- **TeachOS inactive instructors export (read-only)** -- everyone INACTIVE in BigQuery `niat_instructor_details`, with FCC status (in Darwin, exit record, CM review, archive status, last session) and a best-guess reason. Writes `teachos_inactive.csv` (staff names -- delete after download).
  File: `artifacts/api-server/src/lib/connectors/_tmp_teachos_inactive.ts`.
- **Overview: (i) "how is this counted" icon on every card** (per Capability Managers' request) -- hover or tap the icon at the top right of each card / next to its title to see how the number is worked out and its source: the 3 Exceptions cards, Instructor Department, Instructors + Mentors, Operations team, Exit data, Product mix, NIAT contribution, Top campuses, Manager workload, NIAT map. Instructor Department / Instructors + Mentors / Operations team notes written source-first (Darwin Instructors department + payroll-converted from TeachOS).
  Files: `artifacts/instructor-crm/src/components/info-tip.tsx` (new: the icon + ALL the texts in `OVERVIEW_INFO` -- edit texts here), `artifacts/instructor-crm/src/pages/dashboard.tsx`, `artifacts/instructor-crm/src/components/niat-map.tsx`. After pull: Publish.
- **Instructors tab table: frozen header row** -- the column-name row stays at the top while scrolling down (the table now scrolls inside its own box, up to the window height); the name column already stays on the left while scrolling sideways, and the top-left "Name" cell stays in both. Also applies to the Custom filter page (same table).
  File: `artifacts/instructor-crm/src/pages/instructors.tsx` (`CategoryTable`). After pull: Publish.
- **Product rules: DSA campus -> IIT X DSA (fixed); new product "IIT KGP"** -- the DSA-campus check missed TeachOS's spelling "...Technologies - DSA", so 4 DSA instructors (NW0007902, NW0006942, NW0007347, NW0006899) counted as NIAT (Deployed); now IIT X DSA. Any campus mentioning IIT KGP / Kharagpur (e.g. "Nxtwave & IIT KGP OCN", 2 people) is its own product "IIT KGP", not NIAT (Deployed). Intensive Kukatpally stays Intensive (decided, no change). NIAT (Deployed) expected 498 -> 492.
  Files: `artifacts/api-server/src/lib/product.ts` (`isIitxDsaCampus`, new `isIitKgpCampus`, `productOf`), `artifacts/instructor-crm/src/pages/instructors.tsx` (`productLabel`, `ALL_PRODUCTS`), `artifacts/instructor-crm/src/pages/dashboard.tsx` (product colour). After pull: Publish. Also affects Taught in Class / Demos / Overview cohort card, which use NIAT (Deployed).
- **Manual deployed sheet vs FCC (read-only)** -- compares the manual NIAT deployed list (490 employee IDs + location, shared 5 Nov; names not stored) with FCC's NIAT (Deployed) 498: who is only in FCC, who is only in the sheet and where FCC has them instead, and location vs TeachOS campus differences.
  File: `artifacts/api-server/src/lib/connectors/_tmp_manual_deployed_compare.ts` (the sheet's IDs are inside it as `MANUAL`).
- **NIAT (Deployed) session activity (read-only)** -- for the 498: completed sessions in the last 7 / 30 / 60 days, last session, upcoming sessions; buckets by instructors / mentors; lists who taught nothing in 60 days, with their university (TeachOS campus) and Darwin workspace (added same day). Writes `niat_deployed_activity.csv` (staff names -- delete after download).
  File: `artifacts/api-server/src/lib/connectors/_tmp_niat_deployed_activity.ts`. Source table: session schedule (`SESSION_SCHEDULE_TABLE` in `connectors/instructorContribution.ts`).
- **NIAT (Deployed) count check (read-only)** -- recounts NIAT (Deployed) instructors + mentors with the app's rules (department -> productOf), split by role / subject / payroll, joiners and exits in the last 14 days, approved exits still counted, vs BigQuery niat_instructor_details.
  File: `artifacts/api-server/src/lib/connectors/_tmp_niat_deployed_count.ts`. Product rule: `artifacts/api-server/src/lib/product.ts` (`productOf`); Overview card: `artifacts/instructor-crm/src/pages/dashboard.tsx` (`NiatContributionCard`).

## 2026-10-31

- **New BigQuery tables check (read-only)** -- whether `z_niat_users_live_classess_attendance_and_time_spent_details` and `z_niat_live_session_student_feedback_details` exist in any dataset we can see, their columns, row count, date range, and whether we have read access.
  File: `artifacts/api-server/src/lib/connectors/_tmp_new_tables_check.ts`.

- **Archive total check (read-only)** -- why Instructor Department (695) + exits (26) differs from the Archive total (717): lists people in the department but not archived, archived Active/SNP but no longer in the department, Exited but still in the department, Exited but not on the exit card.
  File: `artifacts/api-server/src/lib/connectors/_tmp_archive_total_check.ts`. Counts come from: department = `computeDepartmentAndExceptionRows` and archive = `loadArchivePeople`, both in `artifacts/api-server/src/routes/reports.ts`.

## 2026-10-30

- **Payroll gender check (read-only)** -- for payroll-converted people: gender shown on the Instructors tab vs where it is stored (live row, archive, Darwin full roster, Darwin exit records).
  File: `artifacts/api-server/src/lib/connectors/_tmp_payroll_gender_check.ts`. Gender fallback order itself: `artifacts/api-server/src/routes/reports.ts` (`toApiInstructorSummary`, `gender:`); archive copy: `artifacts/api-server/src/lib/archiveInstructors.ts` (`keepFromDarwin`).

## 2026-10-29

- **Training - Demos: scores shown out of 10** -- QA and AI averages read e.g. "QA 6.8/10", "AI 6.5/10" (final_score is 0-10 for both), in cells, overall column and headers.
  File: `artifacts/instructor-crm/src/pages/demo-training.tsx`. After pull: Publish.

- **Training - Demos cells: unique lectures + average only** -- each Demos / AI cell shows different lectures covered of the course total (a repeat counts once) and the average score over ALL demos / assessments, repeats included. The total-with-repeats line is removed (hover only).
  File: `artifacts/instructor-crm/src/pages/demo-training.tsx`. After pull: Publish.

- **Training - Demos: AI assessment column beside each course's demo column** -- per instructor and course: lectures covered, number of AI assessments (regular + training) and average AI score; same for the subject's overall column. CSV download includes both.
  Files: `lib/db/src/schema/index.ts` (new column `evaluation_kind` on `instructor_demo_course`), `connectors/demoTraining.ts` (reads AI_ASSESSMENT + TRAINING_AI_ASSESSMENT too), `lib/storeRaw.ts`, `routes/reports.ts` (`/reports/demo-training` cell = demo + ai), `routes/sync.ts` (log label), `pages/demo-training.tsx` (two sub-columns per course). After pull: DB push + Publish + Sync Now (Training Status).

- **One-person demo check (read-only)** -- lists one instructor's DEMO / TRAINING_DEMO / AI evaluations with status, score, matched course and links, plus how many completed demos company-wide are scored 0. Used for NW0005240 (Demos tab shows QA 0).
  File: `artifacts/api-server/src/lib/connectors/_tmp_person_demos.ts`.

- **GenAI column order** -- Intro to Gen AI, then LLM, then AI for Finance (Demos + Taught in Class).
  File: `artifacts/api-server/src/data/lectureSessions.ts` (course moved in `LECTURE_COURSES`). After pull: Publish + Sync Now (Training Status). Commit `b703af5`.
- **Training Stats tab names and order** -- Training - LP, Training - Demos, Taught in Class; page headings match.
  Files: `pages/training-stats.tsx`, `pages/demo-training.tsx`, `pages/taught-training.tsx`. After pull: Publish. Commit `b703af5`.
- **Demo count audit (read-only)** -- per-instructor DEMO / TRAINING_DEMO counts, completed, avg score, counted in the Demos tab or not; writes `demo_counts_audit.csv` (staff names -- delete after download).
  File: `artifacts/api-server/src/lib/connectors/_tmp_demo_counts_audit.ts`. Commit `b703af5`.

## 2026-10-28

- **New Training - Demos view** -- per instructor and course: lectures with a completed demo (e.g. 8/20) and the average QA score of all those demos. NIAT Deployed + Training instructors.
  Files: `lib/db/src/schema/index.ts` (table `instructor_demo_course`), `connectors/demoTraining.ts` (new), `lib/storeRaw.ts`, `routes/sync.ts`, `routes/reports.ts`, `pages/demo-training.tsx` (new), `pages/training-stats.tsx`. After pull: DB push + Publish + Sync Now. Commit `4c34611`.
- **Demos: looser topic-name matching** -- ignores subject tags ("Quant", "logical reasoning"), "Part", plurals, two misspellings; old Static Website names count for HTML & CSS.
  File: `connectors/demoTraining.ts`. Commit `10992e8`.
- **Demos: training demos count with regular demos** (training AI assessments do not).
  File: `connectors/demoTraining.ts`. Commit `b7940bf`.

## 2026-10-27

- **IPS** -- third DSA course (Greedy, DP, Graphs; 48 lectures). File: `data/lectureSessions.ts` + CSV. Commit `db9f438`.
- **HTML & CSS replaces Static Web + Responsive Design** (20 lectures; old IDs kept as extra IDs); Modern Responsive UI 21. Files: `data/lectureSessions.ts` + CSV. Commit `7524152`.
- **Extra unit IDs of other course versions** (106 IDs, 13 courses) and HTML5 ID fix. Files: `data/lectureSessions.ts` + CSV. Commits `256b40d`, `0e9c575`, `7524152`.
- **Overview cohort card: renamed batch names + loose name match.** File: `connectors/instructorContribution.ts`. Commit `256b40d`.
