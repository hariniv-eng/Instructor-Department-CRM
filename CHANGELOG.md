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
| One-off read-only checks | `artifacts/api-server/src/lib/connectors/_tmp_*.ts` |

## 2026-10-31

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
