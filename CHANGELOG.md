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
| Deployed - Readiness tab (subjects, semesters, rules) | `artifacts/api-server/src/lib/connectors/deployedReadiness.ts`; page: `artifacts/instructor-crm/src/pages/deployed-readiness.tsx` |
| One-off read-only checks | `artifacts/api-server/src/lib/connectors/_tmp_*.ts` |

## 2026-11-27 -- Training tab: Semester 6 courses (Emerging Tech group)

Per request ("also do it for Sem 6"), from KKH Batch-2's Semester 6 (the only Semester 6 batch) and its learning-portal courses (`_tmp_batch_sem_courses.ts KKH 6`, `_tmp_lp_content_for_courses.ts KKH 6`):
- ML moved from Semester 5 to **Semester 6**; Deep Learning gets **Semester 6** and its portal course 90d18553... ("INTRODUCTION TO DEEP LEARNING", 210 units) besides 8347d32f....
- New group **Emerging Tech** (Tech sub-tab), Semester 6: Practical Software Engineering (3d3d4f4b...) and Internet of Things ("Get Started with Internet of Things", c41ce78c...). No instructor subject maps to it yet.
- Computer Networks, Operating Systems and Language Analytics: KKH takes them in Semester 6 on the same portal courses as CDU, so they stay Semester 4 (per request).
- Not added (no learning-portal course): Data Visualization, Robotics Operating System.
- Files: `artifacts/api-server/src/data/trainingCourseTaxonomy.ts`, `artifacts/instructor-crm/src/pages/training-stats.tsx`, `artifacts/api-server/src/lib/connectors/instructorContribution.ts`. After pull: typecheck + Publish, then Sync Now (Training Status).

## 2026-11-27 -- Training tab: Semester 4 courses (CS Core and Interdisciplinary groups)

Per request ("map those subjects as Sem 4 courses and record them in the Training tab"), from the CDU Semester 4 prod sequence (niat_schedule_details_as_per_prod_sequence) and the matching learning-portal courses (`_tmp_lp_content_for_courses.ts`, `_tmp_find_course_id.ts`). Already there as Semester 4: IPS (DSA), Advanced Aptitude, Linear Algebra and Calculus, Language Analytics. Added, all Semester 4, matched by course id only:
- Production AI Engineering (Gen AI) -- 3b6305a6..., the portal course behind "Production of AI systems using LLM".
- New group **CS Core** (Tech sub-tab): Computer Networks (6e937f29...) and Operating Systems (91b2de79...). Smaller same-name portal courses are not counted. No instructor subject maps to CS Core yet.
- New group **Interdisciplinary** (Maths and Aptitude sub-tab): Environmental Science (53251ac6...); Interdisciplinary & Applied Sciences instructors are measured on it.
- Taught in Class: sessions on these course ids now get their subject from this list (Production AI -> GenAI; CS Core / Interdisciplinary stay in "Other").
- Files: `artifacts/api-server/src/data/trainingCourseTaxonomy.ts`, `artifacts/instructor-crm/src/pages/training-stats.tsx` (`SUB_TABS`, `SUBJECT_TRACK`, `COURSE_SEMESTER`), `artifacts/api-server/src/lib/connectors/instructorContribution.ts` (`TRACK_SUBJECT`). After pull: typecheck + Publish, then Sync Now (Training Status) so the new columns fill.

## 2026-11-25 -- Training Stats: new "Deployed - Readiness" tab

Readiness for NIAT (Deployed) instructors: are they ready for the semester their batch moves to next (NIAT 2026: Sem 1 -> 2, NIAT 2025: Sem 3 -> 4, NIAT 2024: Sem 5 -> 6)? Same rules as Training - Readiness (demo QA, AI assessment, Top-N; lowest of the three; no data = Red), scored on the next semester's lectures and topin exams, with a "Current semester" switch for comparison.
- One row per instructor x batch x subject. Subjects = what they teach that batch now (lectures in the last 30 days, else 60 days, else the mapped subject) PLUS any other subject they have a next-semester demo, AI assessment or topin exam for (blue chip, "Other subject").
- Row: lectures done (demo + AI) out of the semester's lectures, the three scores, the category for the semester picked and the other one. Expand: all their subjects side by side (current vs next) and the course breakdown.
- Filters: subject, subject from, Capability Manager, category, role by sessions; batch buttons; CSV download.
- Every demo counts (in-training, after deployment, mock); pre-preparedness and under-10-minute demos do not. Learning portal: only Aptitude Top-N, as on Training - Readiness. Show only, nothing stored.
- Files: `artifacts/api-server/src/lib/connectors/deployedReadiness.ts` (new), `artifacts/api-server/src/routes/reports.ts` (`/reports/deployed-readiness`), `artifacts/instructor-crm/src/pages/deployed-readiness.tsx` (new), `artifacts/instructor-crm/src/pages/training-stats.tsx` (tab). Review script with the same logic: `_tmp_next_sem_readiness.ts`. After push: typecheck + Publish.

## 2026-11-25 -- Daily sync: five GitHub tries

Decision: keep GitHub Actions as the only outside trigger (no cron-job.org, no Reserved VM for now). Two more tries added, 06:43 and 07:37 IST, after 05:03 / 05:27 / 06:01, so a run GitHub delays or drops is still caught before the working day. Each try syncs only what is still behind.
- File: `.github/workflows/daily-sync.yml`. After push: nothing to publish.

## 2026-11-25 -- Stuck syncs clear themselves

On 20 and 25 Nov a sync started in the background (Autoscale gives it almost no CPU when no request is open) stalled after Darwin, kept the sync lock and left a connection "idle in transaction" for hours, so every later sync was refused. Now: (1) Postgres rolls back any transaction left idle for 15 minutes; (2) a sync that finds the lock held for more than 30 minutes ends that connection (and transactions idle 10+ minutes) and runs -- what `_tmp_sync_health.ts --release` did by hand. A normal sync takes about a minute.
- Files: `lib/db/src/index.ts` (pool `connect`), `artifacts/api-server/src/lib/syncContext.ts` (`releaseStaleLock`, `withSyncLock`). After pull: Publish.

## 2026-11-23 -- Archive: a leaving mark beats the automatic payroll tag

NW2000587 has the automatic payroll_converted classification (Darwin drops a person's active record when they leave), but his Capability Manager marked Serving Notice Period, his Darwin exit is Approved and the sync moved him to Exited on 23 Nov (date of exit 1 Oct). The Overview's Exit data left him out as "payroll" (Archive 37 / Exit Breakdown 36 / Overview 35). In the Instructor Archive, anyone marked Exited, Serving Notice Period or Absconded is now never payroll, so such people count in the Overview's Exit data, Exit Breakdown's Instructors & mentors scope and the daily exit snapshot. People with no leaving mark are unchanged.
- File: `artifacts/api-server/src/routes/reports.ts` (`toApiArchiveSummary` is_payroll). After pull: Publish.

## 2026-11-23 -- Change log records who made an Employee Status / date of exit change

Per request ("who marked NW2000671 as payroll converted, and when?"): the log only said "on the page". Each Employee Status change and typed date-of-exit change now ends "by <e-mail>" for a signed-in user, or "by Manager view (no login)" (those controls are open to Manager view, which has no login). Changes before today cannot say who. Read-only `_tmp_payroll_mark_history.ts NW...` shows one person's automatic payroll classification, Capability Manager mark, Darwin exit records and every change-log row about them.
- File: `artifacts/api-server/src/routes/instructors.ts` (`changedBy`). After pull: Publish.

## 2026-11-23 -- Daily sync: three 5 AM tries

On 20, 22 and 23 Nov no 5 AM run reached the app, so the sync crept forward one source at a time (8:29 ... 10:41) whenever someone opened FCC and Autoscale put the server back to sleep mid-catch-up. The GitHub workflow now calls /api/sync/daily at 05:03, 05:27 and 06:01 IST (odd minutes; GitHub often delays or drops runs on the hour); each call syncs only the sources still behind, so a later try finishes what an earlier one missed and does nothing once all are current. Runs queue instead of overlapping; time limit 30 min, curl up to 25 min with 3 retries.
- **Trigger waits for a running sync:** on 23 Nov GitHub started the 5 AM run at 9:23; a background catch-up (started when someone opened FCC at 8:29) already held the lock, so the trigger answered "already_running" at once and closed, and with no request open Autoscale starved the catch-up (Exits 9:45, TeachOS 10:00, Training 10:22, Contribution 10:41). The daily and exits triggers now keep their request open, re-check every 20 s for up to 20 min, then run whatever is still behind. Exits refresh curl limit raised to 25 min to match.
- Files: `.github/workflows/daily-sync.yml`, `.github/workflows/exits-refresh.yml`, `artifacts/api-server/src/routes/cron.ts` (`handleTokenTrigger`, `WAIT_FOR_RUNNING_MS`). After pull: Publish (for cron.ts). Test it: GitHub -> Actions -> Daily sync -> Run workflow.

## 2026-11-19 -- Aptitude instructors: all their topin exams count

Per request ("if we have any assessment, add them to their data in FCC"). `_tmp_aptitude_topin_people.ts` showed 50 of 51 Aptitude people have topin exams under their TeachOS id, but only 26 had one counted as Aptitude: the rest had titles matching no rule, or Aptitude exams with "Math" in the title counted as Maths. Now, for a person whose subject is Aptitude, every topin exam they took except technical / English ones (= Aptitude + Maths + unmatched titles) counts as their "Aptitude exams". Shown on Training - Assessments and in Readiness' "Assessments given (overall)" column (Readiness' Aptitude Top-N colour still comes from the learning portal). Not applied when an Aptitude person is also learning Maths now. Everyone else unchanged: unmatched exams still do not count.
- Files: `api-server/src/lib/connectors/topinAssessments.ts` (`UNMATCHED_KEY`, `topinCellsFor`), `routes/reports.ts` (`/reports/topin-assessments`, `/reports/training-readiness`; `departmentIdsOf` exported for the check script). After pull: Publish only.

## 2026-11-19 -- Training - Readiness: Aptitude / Maths assessments given (overall)

All semesters view only (per request): a new column "Assessments given (overall)" for instructors learning (or mapped to) Aptitude or Maths -- topin exams taken + average best %, and learning-portal assessments (EXAM + QUIZ units with a score, any course of that subject) + average best %. Overall only, because topin exams cannot be tied to a semester. Shown, not used for the colours. Also in the CSV (4 columns).
- Files: `api-server/src/lib/connectors/trainingReadiness.ts` (`fetchLpSubjectAssessments`, `topinOverallOf`, `OVERALL_ASSESSMENT_SUBJECTS`), `routes/reports.ts` (`overall_assessments`), `instructor-crm/src/pages/training-readiness.tsx`. After pull: Publish only.

## 2026-11-19 -- Training - Readiness: Aptitude exam score from the learning portal

Topin Aptitude exams cannot be split into courses, so for Aptitude only the Top-N score now comes from the learning portal (per request): best % of each EXAM and QUIZ unit (daily PRACTICE left out), averaged over the units the instructor took. Courses: Quantitative Aptitude (Sem 1), Numerical Ability (Sem 2), Logical Reasoning (Sem 3), Advanced / Advance Aptitude (All semesters only). Revision, bridge, mock, orientation and "Numerical Ability and Reasoning Skills for Engineers" are not counted. The topin "Aptitude exams" bucket is no longer used in Readiness (Training - Assessments still shows it). Every other subject is unchanged (topin). Same colour lines (75% / 60%). The scoring panel has one extra line saying so.
- Files: `api-server/src/lib/connectors/trainingReadiness.ts` (`APTITUDE_LP_COURSES`, `fetchLpAptitudeScores`, `EXAM_SEMESTER`, `TOPN_COURSES`), `routes/reports.ts` (`/reports/training-readiness`), `instructor-crm/src/pages/training-readiness.tsx`. Check script: `_tmp_lp_aptitude_assessments.ts`. After pull: Publish only.

## 2026-11-19 -- Training - Readiness: scoring rules as a simple table

The long description paragraph is replaced by a "How readiness is scored" panel (open by default, Hide / Show): one small table (Demo QA / AI assessment / Top-N against Green / Yellow / Red) and four short lines (Overall = lowest of the three; Ready = Green + demo and AI on every lecture; which subject is scored; what does not count). Same rules; thresholds read from the API. Nothing in the scoring changed.
- File: `artifacts/instructor-crm/src/pages/training-readiness.tsx` (`ReadinessRules`). After pull: Publish only.

## 2026-11-19 -- Instructor Archive: "Pending approval" status

a person whose Darwin exit is still Pending With Approver now shows as Pending approval, not Exited; once Darwin approves it they move to Exited (and into Exit Breakdown / the Overview Exit data, which already counted only Approved exits). A person the Capability Manager marked Serving Notice Period stays SNP while pending, and becomes Exited only when the exit is Approved and the Date Of Exit has passed. New Pending approval card, filter button and CSV value on the Archive page; the API returns `pending_count`. Archive Exited now matches Exit Breakdown except people with only a stored exit date and no Darwin record (e.g. NW2000756).
  Files: `artifacts/api-server/src/routes/reports.ts` (`toApiArchiveSummary`, `/reports/instructor-archive`), `artifacts/instructor-crm/src/pages/instructor-archive.tsx`; status type in `dashboard.tsx`, `exit-breakdown.tsx`. After pull: Publish (no Sync needed).

## 2026-11-17 -- Training Stats views: Instructor department only

Training - LP, Taught in Class, Training - Demos, Training - Assessments and Training - Readiness now include only people the Instructors tab counts as Instructors or Mentors (`departmentIdsOf()` in `routes/reports.ts`, the rule the Contribution tab already used). Correction the same day: Training - LP did NOT have it either; added there too. Robotics instructors and non-teaching staff who only have a TeachOS INSTRUCTOR account (e.g. NW0007471 and the 16 others found on 16 Nov) no longer appear. After pulling: Publish only.

## 2026-11-17 -- Mock demos count as normal demos

MOCK recordings (16.7k completed since Jan 2024, every subject, still recorded) now count as regular demos in Training - Demos, Readiness and Contribution's Training Demo QA: in-training on/before the deployment date, after deployment after it; 10-minute rule for the average. Never treated as pre-preparedness (that rule only looks at DEMO / AI_ASSESSMENT). Topic titles like "Introduction to Python > Programming with Python" now match on the part after ">".
- Files: `api-server/src/lib/connectors/demoTraining.ts`, `trainingReadiness.ts`, `routes/sync.ts` (log text), `instructor-crm/src/pages/demo-training.tsx` (description). Check: `_tmp_mock_subjects.ts`.
- After pulling: Publish, then Training Status Sync Now.

## 2026-11-17 -- Training - Readiness: Date of joining column

Date of joining column after Employee ID (same value as Contribution: Darwin, archive or typed-in; source on hover) with "N days ago"; CSV gets Date of joining and Days since joining. Files: `routes/reports.ts` (`/reports/training-readiness`), `instructor-crm/src/pages/training-readiness.tsx`. After pulling: Publish only.

## 2026-11-17 -- Training - Demos / Readiness: pre-preparedness recordings left out

Pre-preparedness demos / AI assessments (the ones Contribution now counts) are no longer counted in Training - Demos (so "Demos after deployment" = non-preparation demos only), Readiness, or Contribution's Training Demo QA. Training types are never pre-preparedness, so in-training figures are unchanged except for rare plain demos before a class on/before the deployment day.
- The rule now lives in one place: `api-server/src/lib/connectors/preparedness.ts` (`prepCtes`, `notPreparednessCondition`); used by `instructorEvaluations.ts`, `demoTraining.ts`, `trainingReadiness.ts`.
- Check: `_tmp_prep_split_check.ts`. After pulling: Publish, then Training Status Sync Now and Contribution Sync Now.

## 2026-11-17 -- Contribution: Demo / AI = pre-preparedness only

Contribution's Demo and AI assessment figures (hours, count, now also average score each) count ONLY pre-preparedness recordings: a plain DEMO / AI_ASSESSMENT on the topic of a class the instructor then took (completed class in niat_pre_lecture_readiness_check_list_details; topic = session_id of the class's QA-rated recording, else its title), recorded before the class. Rule checked on 19,773 classes (`_tmp_prep_demo_rule.ts`): "any time before" matches the checklist's demo count for 100% of classes, AI 99%. Training demos no longer count here (they stay in Training Demo QA / Training Stats). Workload (Avg Prep Demo / AI Hrs), the Instructors tab workload and the profile use the same figures.
- Files: `api-server/src/lib/connectors/instructorEvaluations.ts` (query; table override env READINESS_CHECKLIST_TABLE), `routes/reports.ts` (demo_avg_score, ai_avg_score), `instructor-crm/src/pages/contribution.tsx` (labels, scores, CSV).
- After pulling: preview `_tmp_prep_demo_preview.ts`, Publish, then Contribution Sync Now (no DB push).

## 2026-11-16 -- Training - Readiness: "Learning now" subject

Readiness is scored on the subject(s) each instructor is learning NOW, not only the mapped subject (check on 97 training instructors: 21 active only in another subject, 25 in several).
- Learning now = subjects of in-training demos / AI assessments in the last 30 days (each subject with at least 25% of the top subject's count; topic names found in several subjects skipped); else learning-portal units COMPLETED in the last 30 days (completion_datetime, course -> subject as Taught in Class); else the mapped subject.
- New columns Mapped subject / Learning now (blue = not the mapped subject, "differs" flag, source); filters Learning now and Mapped vs now; row click shows the 30-day demo and LP counts per subject.
- (Replaced the same day) Several subjects for everyone, decided by DEMOS: the top demo / AI subject plus every other subject with 2+ demos / AI assessments in the last 30 days (`MIN_DEMOS`). No demos -> the single top learning-portal subject. Subjects only read on the learning portal show as "reading" (not scored). With 2+ subjects, each subject's own readiness (lectures, demo, AI, Top-N, overall, per semester) shows in the row breakdown and the CSV (`by_subject`, `bySubject()`). Mentor tag beside the name, Role in the CSV.
- Settings: `LEARNING_DAYS`, `LEARNING_SHARE` in `api-server/src/lib/connectors/trainingReadiness.ts`. Check script: `_tmp_learning_subject.ts`.
- After pulling: Publish only.

## 2026-11-16 -- Training - Readiness: semester-wise

Semester buttons on Training - Readiness (All semesters, Semester 1, 2, 3, 4). A semester shows only instructors whose subject has courses in it; demo / AI scores, Top-N, completion and colours are counted on that semester's courses only. Topin exams on a whole subject (General, DSA, Gen AI) count only in All semesters. Course breakdown shows the semester.
- Semester per course: `LECTURE_SEMESTER` / `EXAM_SEMESTER` in `api-server/src/lib/connectors/trainingReadiness.ts` (same as Training - LP; Intro to English Language -> 1, DBMS -> 2, DSA (C++) -> 2, DSA II -> 3, IPS -> 4).
- Files: `trainingReadiness.ts`, `instructor-crm/src/pages/training-readiness.tsx`. After pulling: Publish only.

## 2026-11-16 -- Training - Readiness view (Pre-Deployment Readiness, Phase 1)

New view **Training - Readiness** in Training Stats, for NIAT (Training) instructors. Show only, nothing stored.
- Demo score: in-training demos (10 min or longer), best score per lecture, averaged over the lectures done. AI score: same for in-training AI assessments.
- Top-N: topin Daily + Weekly exams of the instructor's own subject, average best %.
- Complete: a demo AND an AI assessment on every lecture of the subject's lecture-list courses.
- Green: demo >= 7.5, AI >= 8.5, Top-N >= 75%. Yellow: demo >= 6.5, AI >= 7.5, Top-N >= 60%. Else Red. Overall = lowest of the three (no data = Red); "Incomplete" shown beside it; Ready = Green and complete.
- Row click shows the per-course breakdown; filters Subject / CM / Overall / Completion; CSV.
- Files: `api-server/src/lib/connectors/trainingReadiness.ts` (logic + thresholds), `routes/reports.ts` (`GET /reports/training-readiness`), `instructor-crm/src/pages/training-readiness.tsx`, `training-stats.tsx`.
- After pulling: Publish only (read live from BigQuery, no sync, no DB push).

## 2026-11-16
- **Demo Hrs / AI Assessment Hrs now read `niat_session_wise_qa_rating`** (per request: one demo source). `z_niat_instructors_demo_qa_rating_details` is a subset of it (same evaluations, scores and lengths -- checked for NW2000396) and is no longer read. The hours now also include the training recordings: Demo Hrs = DEMO + TRAINING_DEMO, AI Assessment Hrs = AI_ASSESSMENT + TRAINING_AI_ASSESSMENT (since 6 Oct 2026). Same counting rule: completed only, one recording per session per type (the longest). Affects Contribution and the instructor profile; numbers rise for instructors with training recordings.
  Files: `artifacts/api-server/src/lib/connectors/instructorEvaluations.ts`, `artifacts/instructor-crm/src/pages/contribution.tsx` (comment). After pull: Publish, then Contribution Sync Now. (`INSTRUCTOR_EVALUATION_TABLE` still overrides the table if ever needed.)

## 2026-11-13
- **Training - LP: course ids added** (per request: "all the course ids"). New Frontend column **HTML & CSS (2026)** = portal course `cf46b9923227407484b2f6867a00360d` (234 units: the current semester-1 course covering the HTML & CSS and Modern Responsive UI lectures), semester 1; matched by id only, because a small 25-unit course `d2563f3c...` has the same title. Ids added to columns that were matched by title only: JavaScript Sprint `2a60221e...`, React JS `40ab5ebd...` + `fcac9e0c...`, Linear Algebra and Calculus `ce546ef7...` (their numbers do not change).
  Files: `artifacts/api-server/src/data/trainingCourseTaxonomy.ts`, `artifacts/instructor-crm/src/pages/training-stats.tsx` (`COURSE_SEMESTER`). After pull: Publish, then Training Status Sync Now.
- `.gitignore`: the "Claude outputs/" folder (delivered files with staff names) is never committed.

## 2026-11-12
- **New Training Stats view: Training - Assessments** (per request: topin assessment data in FCC, all subjects). Per instructor and course: Daily exams and Weekly exams -- exams taken and average best score (%), with the subject buttons, filters (Deployed / Training, Instructor subject, Capability Manager), search and CSV of Training - Demos. Read LIVE from `z_niat_tech_instrctor_trainee_exam_best_scores_details` (cached 10 min; Refresh reads again). No course column there, so exams are matched to a course by title -- rules in `ASSESSMENT_COURSES` (e.g. static_website_ = Static Web, responsive_web_ = Responsive Design, modern_responsive_ = Modern Responsive UI, js_sprint_ / JS_Essentials_, dynamic_web_, python_, databases_ = SQL, DSA, maths topics); whole-subject exams go to a General column per subject; mock / entry tests, daily quizzes and per-batch test exams are not counted.
  Files: `artifacts/api-server/src/lib/connectors/topinAssessments.ts` (new), `routes/reports.ts` (`GET /reports/topin-assessments`), `artifacts/instructor-crm/src/pages/topin-assessments.tsx` (new), `pages/training-stats.tsx`. No DB change. After pull: Publish.
- **Exit Breakdown: Role column + filter** (per request) -- Instructor / Mentor / Support, from the team the Instructor Archive filed the person under (Support = Delivery Support / Instructor Team Operations; Mentor = mentor). In the People table, the filters and the CSV. File: `pages/exit-breakdown.tsx`. After pull: Publish.
- **Exit Breakdown: Exit date column** (per request) -- Darwin's "Exit Date" (the day the exit was raised), next to Date of exit, in the People table and the CSV. Shown only as its own column; it is never used as the date of exit or for the Month filter. File: `pages/exit-breakdown.tsx`. After pull: Publish.
- **Typed date of exit: payroll only, and logged** (per request: NW2000736 had a wrong typed date 2026-01-22 -- typed while he was briefly shown as payroll; Darwin has no Date Of Exit for him). `PATCH /instructors/:id/exit-date` now refuses to SET a date for anyone who is not payroll (clearing is always allowed), and every change is logged in the uploads table as "Date of exit change". One-off `_tmp_clear_exit_date.ts NW2000736 --apply` clears his wrong date.
  Files: `artifacts/api-server/src/routes/instructors.ts`. After pull: Publish.
- **Exit Breakdown: payroll instructors who left** (per request) -- a payroll person (already converted) who leaves has no Darwin exit; the Capability Manager types their date of exit in FCC. Such a person, with a typed date of exit of today or earlier, now counts as an exit in the tab (dated by the typed date) and is counted in the University payroll card. New "Exit type" column: Darwin exit approved / Payroll -- date typed in FCC. Scope "All approved exits" renamed "All exits". The archive API now also returns `manual_exit_date`.
  Files: `artifacts/instructor-crm/src/pages/exit-breakdown.tsx`, `artifacts/api-server/src/routes/reports.ts` (`loadArchivePeople`). After pull: Publish.
- **Exit Breakdown: month table removed** (per request) -- the tab now has the totals, the scope buttons, search + filters and the People table only (the "Break down by" buttons went with the table; Month, Campus, Subject, Deployed / Training and Payroll / NxtWave stay as filters). File: `pages/exit-breakdown.tsx`. After pull: Publish.
- **Exit Breakdown: approved exits only** (per request) -- only people whose Darwin exit is Approved; scopes renamed All approved exits / Instructors & mentors (Overview rule) / Support; the Darwin exit status filter and column are removed (always Approved). File: `pages/exit-breakdown.tsx`. After pull: Publish.
- **New tab: Exit Breakdown** (Admin only, per request). One table of exits by month (columns, newest first, plus "No date of exit" and Total) against a chosen breakdown (rows): Campus, Subject, Deployed vs Training, or University payroll vs NxtWave. Three scopes: All department exits (everyone the Instructor Archive marks Exited -- instructors, mentors, Support, payroll), Approved exits (Overview Exit data rule) and Support. Month = date of exit only (Darwin's Date Of Exit or a typed date). Below it, a People table like the Instructors tab: search by name / employee ID and multi-select filters (Month, Campus, Subject, Deployed / Training, Payroll / NxtWave, Capability Manager, Darwin exit status); the filters narrow the breakdown table too. CSV download with the names. Reads the existing `/api/reports/instructor-archive`; no API or DB change.
  Files: `artifacts/instructor-crm/src/pages/exit-breakdown.tsx` (new), `App.tsx`, `components/app-shell.tsx`. After pull: Publish (no Sync needed).


## 2026-11-11
- **Date of exit = Darwin's "Date Of Exit" only** (per request: pending-approval people were on Remove access with a date the exit data does not have). The "Lwd As Per Notice Period" backup added on 2026-11-09 is removed -- Darwin fills that projected date even while an exit is still Pending With Approver, which gave pending people a date of exit and moved them onto the Remove access list. Now: no "Date Of Exit" in the exit data = no date of exit anywhere (Instructors tab, Overview lists, Archive, profile); a date typed in FCC by a Capability Manager still wins. Pending people without a date go back to the Serving notice list.
  Files: `artifacts/api-server/src/lib/reconcile.ts` (`lastWorkingDateOf`), `routes/reports.ts` (archive exit lookup). Check: `src/lib/connectors/_tmp_exit_date_origin.ts`. After pull: Publish, then Sync Now.
- **TeachOS-only people are no longer made Payroll Converted automatically** (per request). A NEW person in TeachOS with no Darwin record and no Darwin exit record now gets classification `teachos_only_unreviewed` and shows in the Overview **CM actions -> Needs review** list (Instructors tab -> Exception) with the Employee Status dropdown. Once a Capability Manager sets Employee Status, the next sync files them as payroll converted (Payroll Converted stays payroll; Exited / Serving Notice Period / Absconded go to the existing payroll exit lists). Everyone already filed as payroll converted before this change keeps it (the current payroll list, incl. the 30 with no exit record), and IIT Kharagpur / other-department / Darwin-by-employee-ID rules still come first. While waiting they count in the department headcount but not as Payroll (Overview split, TeachOS breakdown).
  Files: `artifacts/api-server/src/lib/reconcile.ts`, `data/classificationOverrides.ts` (`TEACHOS_ONLY_UNREVIEWED`), `routes/reports.ts`, `routes/instructors.ts`; `artifacts/instructor-crm/src/pages/instructors.tsx`, `pages/dashboard.tsx`, `components/info-tip.tsx`. After pull: Publish, then Sync Now.
- **Correction (per request):** the Founders Team person (TeachOS id 7a8205…) is now in `EXCLUDED_EMPLOYEES` as excluded_non_department_team, so he shows under **Excluded** in the TeachOS breakdown (the "needs review" list entry is removed -- needs review folds into Payroll there). The "IIT KGP" campus spelling change is **taken back**: ARUN MUNOLI stays as he is until TeachOS has his employee ID; the Darwin-by-employee-ID check then files him at the next sync.
- **TeachOS-only people: check Darwin by employee ID before payroll** (per request) -- in `recomputeStatuses`, a TeachOS-only person whose employee ID is an ACTIVE employee in Darwin's full roster (and not in the Instructors-department pull) is now filed as **other department**, not payroll converted (e.g. NW0007056, other team). Someone not in Darwin at all stays as before. New `NEEDS_REVIEW_TEACHOS_ONLY` list in `classificationOverrides.ts`: TeachOS-only people kept as an exception (needs review) instead of payroll -- the Founders Team person with no employee ID (TeachOS id 7a8205…), moved there from other department.
  Files: `artifacts/api-server/src/lib/reconcile.ts`, `data/classificationOverrides.ts`. After pull: Publish, then Sync Now.
- **Three people wrongly filed as payroll** (per request) -- FCC files anyone in TeachOS with no Darwin match as payroll converted automatically. (1) IIT KGP campus test in `recomputeStatuses` now also matches "IIT KGP" ("Nxtwave & IIT KGP OCN"), not only "Kharagpur": such people go to the IIT Kharagpur team, not payroll (ARUN MUNOLI). (2) The Founders Team person with no employee ID (TeachOS id 7a8205…) and NW0007056 (other team) added to `EXCLUDED_EMPLOYEES` as other department, by TeachOS id / employee ID.
  Files: `artifacts/api-server/src/lib/reconcile.ts`, `data/classificationOverrides.ts`. After pull: Publish, then Sync Now.
- **NW0007056 moved to Other department** (per request: he is in Darwin, in another team, but showed as payroll converted) -- added to `EXCLUDED_EMPLOYEES` by employee ID, so he leaves the Instructor Department count and the payroll list at the next sync. `_tmp_why_payroll.ts` now also takes an employee ID.
  File: `artifacts/api-server/src/data/classificationOverrides.ts`. After pull: Publish, then Sync Now.
- **Serving notice: date of exit for payroll people** (per request) -- approved Serving Notice Period people who are payroll-converted showed no date of exit, because payroll people only used a typed date. Now anyone marked Serving Notice Period / Exited / Absconded uses Darwin's last working day when nothing is typed (typed date still wins). So their date shows in the Serving notice list, and once it has passed they move to Remove TeachOS access and are set to Exited at the next sync. Read-only `_tmp_snp_check.ts` lists every Serving Notice Period person with their date and list.
  Files: `artifacts/api-server/src/routes/reports.ts` (`LEAVING_MARKS`, `date_of_exit`, `exitDateOf`), `lib/reconcile.ts` (`recomputeStatuses`). After pull: Publish, then Sync Now.
- **A typed-in date of exit wins over Darwin's** (per request, NW0004547) -- she moved to payroll in 2025, so her Darwin exit record says Date Of Exit 31 Oct 2025; she actually left on 31 Oct 2026, typed by hand. The manual date of exit now wins for everyone who has one (before: only payroll people used it): Instructors tab, Instructor Archive, Exit data, Exception 2 lists, Contribution experience, and the serving-notice -> exited rule. People with no typed date are unchanged.
  Files: `artifacts/api-server/src/routes/reports.ts` (`date_of_exit`, `exitDateOf`, `loadArchivePeople`, experience), `lib/reconcile.ts` (`recomputeStatuses`). After pull: Publish (no sync needed).

## 2026-11-10
- **New Capability Manager: Pasupuleti Sai Krishna Chakradhar (NW0007993)** -- added to the list of valid Capability Managers. Instructors whose TeachOS manager entry has his full name get him at the next sync, and he can be picked as a manual Capability Manager. If TeachOS records him under a shorter name, an alias is needed.
  File: `artifacts/api-server/src/data/validCapabilityManagers.ts`. After pull: Publish, then Sync Now.

## 2026-11-09
- **Exit data: Support (Operations team) left out** (per request: two support people were among the 19 October exits) -- the Overview Exit data count, its pop-up lists and CSV no longer include the Operations team (classification excluded_ops_managers / instructor_ops; product Support), same as the Product mix. `_tmp_exits_by_month.ts` labels them SUPPORT.
  File: `artifacts/instructor-crm/src/pages/dashboard.tsx` (`ExitKpiCard`, `exitCandidates`). After pull: Publish.
- **Date of exit: backup field** -- when a Darwin exit record has no "Date Of Exit", FCC now uses "Lwd As Per Notice Period" (filled on ~2,270 of 4,089 records). Checked: the 11 approved exits that show "Raised ..." (NW2000681, NW2000729, NW2000598, NW2000614, NW2000763, NW2000736, NW2000431, NW2000696, NW2000747, NW2000757, NW2000764) have ONLY "Exit Date" on their record and are not in Darwin's full roster -- Darwin sends no last working day for them anywhere.
  Files: `artifacts/api-server/src/lib/reconcile.ts` (`lastWorkingDateOf`), `routes/reports.ts` (archive Date of Exit). After pull: Publish, then Sync Now (exits).
- **Exit data: Deployed / Training column** (per request) -- the Overview Exit data pop-up (and its CSV) shows whether each person was Deployed or Training. For exits (archive): Deployed = they ever had a session scheduled (Contribution's deployment date), else Training -- the campus is not used, since people who left have none. For upcoming exits (still active): from their product. The Instructor Archive API now also returns `deployment_date` and `deployed_or_training`.
  Files: `artifacts/api-server/src/routes/reports.ts` (`loadArchivePeople`), `artifacts/instructor-crm/src/pages/dashboard.tsx` (`ExitKpiCard`). Also read-only `_tmp_exits_by_month.ts` (now shows Deployed / Training) and `_tmp_exit_date_fields.ts` (looks for the last working day under other field names). After pull: Publish.
- **Contribution tab: Training Demo QA column** (per request) -- after Training Duration: the average QA (out of 10) of the person's in-training demos of 10 minutes or more, with the number of demos; hover shows how many were under 10 minutes and the average of all. Same data as the Training - Demos tab's In-training demos (training demos + demos up to the deployment date), all courses together, all-time. CSV adds In-training Demos, under 10 min, Avg QA (10+ min), Avg QA (all).
  Files: `artifacts/api-server/src/routes/reports.ts` (`/reports/instructor-contribution`), `artifacts/instructor-crm/src/pages/contribution.tsx`. Needs the instructor_demo_course columns from the db push. After pull: db push (if not done), Publish, Sync Now on Training - Demos.
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
