import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, GraduationCap, RefreshCw } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { downloadCsv, slugify, toCsv } from '@/lib/csv';
import { ALL_PRODUCTS } from './instructors';

// "Training Stats" (2026-09-23, per request): an instructor's OWN
// training/upskilling progress, distinct from every other tab here, which
// tracks session-TEACHING activity. Sourced from BigQuery's
// niat_instructor_unit_wise_completion_and_best_attempt_details, aggregated
// server-side per (instructor, tracked course) -- see fetchCourseStatusRows
// in api-server/src/lib/connectors/instructorLearningStatus.ts and GET
// /reports/training-stats in reports.ts.
//
// Split into 3 SUB-TABS (2026-09-24, per request): Tech groups the original
// 5 track groups (Frontend Development, Backend Development, DSA, Gen AI,
// DSML) matching Ankush's reference sheet; Math and Aptitude share ONE
// tab/button ("I don't want two separate sheets or two separate tabs for
// math and aptitude. I want it in one only") even though they're still two
// separate track groups in the taxonomy underneath; English (2026-10-14) has 4
// columns (Foundation, Advanced, Applied, Language Analytics) shown only for
// instructors whose subject is English.
//
// EACH TAB SHOWS ONLY ITS OWN SUBJECT'S INSTRUCTORS (2026-09-24, per
// request -- "we know the bifurcation using the teacher's data... if I'm
// trying to open only tech, to only see the tech-related instructors...
// if I'm trying to open English-related learning stats, I need to only see
// the data of English instructors"). This reverses the earlier "same
// roster for every tab" build: rows are now filtered client-side by each
// instructor's `subject_area` (from classifyDepartment() -- see
// TECH_AREAS/subject_area in api-server/src/lib/departmentTaxonomy.ts and
// routes/reports.ts), matched against the active tab's subjectAreas below.
// A row whose subject_area is null (classifyDepartment() couldn't resolve
// one -- e.g. a flat "Mentors" string with no sub-area) won't appear on ANY
// tab until a human fills in Manual Subject for them on the Instructors tab.
//
// Scoped to Instructors + Mentors only, identified by employee_id (per
// request) -- Delivery Support / Instructor Team Operations / other-
// department rows are excluded server-side (see
// TRAINING_STATS_EXCLUDED_CLASSIFICATIONS in reports.ts).
type CourseStatus = 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'PENDING_MAPPING' | 'NO_DATA';

type TrainingCourseDef = {
  key: string;
  label: string;
  trackGroup: string;
  courseTitles: string[];
  courseIds?: string[];
};

// A column is mapped when it has course titles or course ids (2026-10-14, course ids added to match the Faculty-ops app).
const isResolved = (def: TrainingCourseDef): boolean => def.courseTitles.length > 0 || (def.courseIds?.length ?? 0) > 0;

type TrainingStatsRow = {
  employee_id: string | null;
  full_name: string;
  department: string | null;
  capability_manager: string | null;
  classification: string | null;
  has_training_data: boolean;
  subject_area: string | null;
  // Product (2026-10-15, per request) -- same label as the Instructors tab's Product column.
  product: string;
  courses: Record<string, CourseStatus>;
  // Share of each course's units completed (0-100), only for courses the instructor has data for.
  course_progress?: Record<string, number>;
};

type TrainingStatsResponse = {
  taxonomy: TrainingCourseDef[];
  tech_areas: string[];
  count: number;
  rows: TrainingStatsRow[];
  synced_at: string | null;
};

const QUERY_KEY = ['reports', 'training-stats'];

// The 3 sub-tab buttons. `trackGroups` names which taxonomy track group(s)
// supply this tab's COLUMNS; `subjectAreas` decides which ROWS (instructors)
// show on it, matched against each row's `subject_area`. Tech's subject
// areas come from the server's `tech_areas` list (the same RULES-derived set
// classifyDepartment() uses) rather than being hardcoded here, so this file
// can't drift out of sync with departmentTaxonomy.ts -- see 'TECH' handling
// below. "english" maps to the English track group (4 courses) in the backend
// trainingCourseTaxonomy.ts.
const SUB_TABS: { key: string; label: string; trackGroups: string[]; subjectAreas: string[] | 'TECH' }[] = [
  { key: 'tech', label: 'Tech', trackGroups: ['Frontend Development', 'Backend Development', 'DSA', 'Gen AI', 'DSML'], subjectAreas: 'TECH' },
  { key: 'math_aptitude', label: 'Maths and Aptitude', trackGroups: ['Aptitude', 'Maths'], subjectAreas: ['Aptitude', 'Maths'] },
  { key: 'english', label: 'English', trackGroups: ['English'], subjectAreas: ['English'] },
];

function useTrainingStats() {
  return useQuery<TrainingStatsResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/training-stats');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

// Subject filter (2026-10-14, per request): an instructor's Subject (the same value as the Subject column) -> the course track group
// that measures that subject's training. Selecting a subject shows only that subject's instructors and course columns, and the two
// overview cards (Completed / In Progress) are worked out over exactly those instructors and that track group. A subject with no
// course track here just filters the rows.
const SUBJECT_TRACK: Record<string, string> = {
  Frontend: 'Frontend Development',
  Backend: 'Backend Development',
  DSA: 'DSA',
  GenAI: 'Gen AI',
  // Artificial Intelligence & Emerging Technologies instructors are judged on the DSML courses (ML, Supervised Learning, Deep Learning, ML Projects, NLP, Data Foundation).
  'Artificial Intelligence & Emerging Technologies': 'DSML',
  Aptitude: 'Aptitude',
  Maths: 'Maths',
  English: 'English',
};

// Groups the flat taxonomy list into [{ trackGroup, defs }] in taxonomy
// order, for the two-row grouped header below.
function groupByTrack(taxonomy: TrainingCourseDef[]): { trackGroup: string; defs: TrainingCourseDef[] }[] {
  const groups: { trackGroup: string; defs: TrainingCourseDef[] }[] = [];
  for (const def of taxonomy) {
    const last = groups[groups.length - 1];
    if (last && last.trackGroup === def.trackGroup) last.defs.push(def);
    else groups.push({ trackGroup: def.trackGroup, defs: [def] });
  }
  return groups;
}

// Labels match Ankush's reference sheet's own status vocabulary verbatim
// (2026-09-23, per request: "it should be added to the application [in] a
// format that i have shared you before") -- emoji + label, same as the
// sheet's cells. "On Hold" (⏸) isn't produced here: completion_status has
// no such value anywhere in the live BigQuery data (confirmed via
// check:instructor-learning-column) -- see the open question in the page
// description below. "Mapping pending" and "No data" are this app's own
// additions for the two situations the reference sheet doesn't have to deal
// with (an unconfirmed course mapping, or an instructor with no synced rows
// at all) -- kept visually distinct (grey, no emoji) so they're never
// mistaken for one of the sheet's real 4 statuses.
const STATUS_BADGE: Record<CourseStatus, { label: string; className: string }> = {
  COMPLETED: { label: '✅ Completed', className: 'bg-[#e5f3ed] text-[#256e65]' },
  IN_PROGRESS: { label: '🟡 In Progress', className: 'bg-[#fff3d6] text-[#8a6a12]' },
  NOT_STARTED: { label: '❌ Not Started', className: 'bg-[#f3f0ec] text-[#8a7a63]' },
  PENDING_MAPPING: { label: 'Mapping pending', className: 'bg-[#f1f2f4] italic text-muted-foreground' },
  NO_DATA: { label: 'No data', className: 'bg-transparent text-muted-foreground' },
};

// An In Progress or Completed course also shows how much of it is done, e.g. "In Progress (62%)" or "Completed (92%)" (2026-10-14, per
// request: a course counts as Completed from 85% of its units, so the actual share is shown to tell 85, 90 and 100 apart).
function StatusBadge({ status, progress }: { status: CourseStatus; progress?: number }) {
  const badge = STATUS_BADGE[status];
  if (status === 'NO_DATA') return <span className="text-[11px] text-muted-foreground">—</span>;
  const label = (status === 'IN_PROGRESS' || status === 'COMPLETED') && progress !== undefined ? `${badge.label} (${Math.round(progress)}%)` : badge.label;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.className}`}>{label}</span>;
}

// Subject-wise completion % (2026-10-12, per request): Completed = 100%, In Progress = 50%, Not Started = 0%, averaged
// over every mapped course of the subject (track group). A course with no training data for the instructor counts as
// 0% (decided with Ankush); a course with no confirmed mapping yet is left out of the average, since nobody can have it.
// An instructor with no synced training data at all gets no percentage (null), shown as a dash, rather than a 0% that
// would look like "has done nothing".
const STATUS_SCORE: Partial<Record<CourseStatus, number>> = { COMPLETED: 100, IN_PROGRESS: 50, NOT_STARTED: 0, NO_DATA: 0 };
function subjectCompletion(row: TrainingStatsRow, defs: TrainingCourseDef[]): number | null {
  if (!row.has_training_data) return null;
  const scores = defs
    .filter((def) => isResolved(def))
    .map((def) => {
      const status = row.courses[def.key] ?? 'NO_DATA';
      // An In Progress course counts for how much of it is actually done; 50% only if that figure is missing.
      if (status === 'IN_PROGRESS' && row.course_progress?.[def.key] !== undefined) return row.course_progress[def.key];
      return STATUS_SCORE[status];
    })
    .filter((score): score is number => score !== undefined);
  if (scores.length === 0) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
const formatPercent = (value: number) => `${Math.round(value * 10) / 10}%`;
const percentTone = (value: number) => (value >= 80 ? 'bg-[#e5f3ed] text-[#256e65]' : value >= 40 ? 'bg-[#fff3d6] text-[#8a6a12]' : 'bg-[#f3f0ec] text-[#8a7a63]');

// Completion tally (2026-10-15, per request): how many instructors finished the subject they teach. Each instructor is measured on THEIR OWN
// subject's course track (SUBJECT_TRACK) -- a Frontend instructor on Frontend Development, an English instructor on English -- so a mixed group
// (a whole tab, a product) can be counted together. Completed = 100% on that track, In progress = above 0% and below 100%, Not started = 0%,
// No data = no synced training data (or nothing mapped yet). Instructors whose subject has no course track
// (e.g. a subject not listed in SUBJECT_TRACK) cannot be measured and are counted separately, not in the total or the rate.
// nearComplete: instructors at 80% or more but not yet 100% -- shown wherever nobody has reached 100% yet (2026-10-15, per request).
type CompletionTally = { total: number; completed: number; nearComplete: number; inProgress: number; notStarted: number; noData: number; untracked: number };
const NEAR_COMPLETE_PCT = 80;
function tallyCompletion(rows: TrainingStatsRow[], taxonomy: TrainingCourseDef[]): CompletionTally {
  const tally: CompletionTally = { total: 0, completed: 0, nearComplete: 0, inProgress: 0, notStarted: 0, noData: 0, untracked: 0 };
  for (const row of rows) {
    const track = row.subject_area ? SUBJECT_TRACK[row.subject_area] : undefined;
    const defs = track ? taxonomy.filter((def) => def.trackGroup === track) : [];
    if (defs.length === 0) { tally.untracked += 1; continue; }
    tally.total += 1;
    const pct = subjectCompletion(row, defs);
    if (pct === null) tally.noData += 1;
    else if (pct >= 100) tally.completed += 1;
    else if (pct > 0) { tally.inProgress += 1; if (pct >= NEAR_COMPLETE_PCT) tally.nearComplete += 1; }
    else tally.notStarted += 1;
  }
  return tally;
}
const completionRate = (tally: CompletionTally) => (tally.total > 0 ? Math.round((tally.completed / tally.total) * 1000) / 10 : null);

// Text under a "completed" card: count out of the measured instructors with the rate, and -- where nobody has reached 100% yet -- how many
// are at 80% or more (2026-10-15, per request).
function completedMeta(tally: CompletionTally, noun: string): string {
  return `of ${formatKpi(tally.total)} ${noun} at 100% (${completionRate(tally) ?? 0}%)${tally.completed === 0 ? ` -- ${formatKpi(tally.nearComplete)} at 80% or more` : ''}`;
}

export default function TrainingStatsPage() {
  const queryClient = useQueryClient();
  const query = useTrainingStats();
  const data = query.data;
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState(SUB_TABS[0].key);
  const [subject, setSubject] = useState('ALL');
  // Product filter (2026-10-15, per request): 'ALL' or one product. Kept when switching tabs; a product with nobody on the tab is ignored.
  const [product, setProduct] = useState('ALL');

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch('/api/sync/training-status', { method: 'POST' });
      const result = await response.json();
      if (result.ok) {
        setSyncMessage({ ok: true, text: `Synced ${formatKpi(result.stored)} course-status rows.` });
        refresh();
      } else {
        setSyncMessage({ ok: false, text: result.error || 'Sync failed.' });
      }
    } catch {
      setSyncMessage({ ok: false, text: 'Sync failed -- could not reach the server.' });
    } finally {
      setSyncing(false);
    }
  };

  const activeSubTab = SUB_TABS.find((t) => t.key === activeTab) ?? SUB_TABS[0];
  const activeTaxonomy = data ? data.taxonomy.filter((d) => activeSubTab.trackGroups.includes(d.trackGroup)) : [];
  // Each tab shows only ITS OWN subject's instructors (2026-09-24, per
  // request -- see the big comment above SUB_TABS). "TECH" resolves against
  // the server-supplied tech_areas list; the other tabs use their own static
  // list. A row with subject_area === null never matches any tab. Re-derived
  // per tab so page 2 of Tech doesn't carry over confusingly into Math and
  // Aptitude's row list.
  const activeSubjectAreas = activeSubTab.subjectAreas === 'TECH' ? (data?.tech_areas ?? []) : activeSubTab.subjectAreas;
  const activeRows = data ? data.rows.filter((row) => row.subject_area !== null && activeSubjectAreas.includes(row.subject_area)) : [];
  // Search box (2026-09-24, per request: "where ever there are tables in
  // the application add search option to search for any person") -- matches
  // name or employee ID, same two fields the Instructors tab's own search
  // already checks. Applied after the subject-area filter above, so a
  // search on the Tech tab only searches among tech instructors, not the
  // whole roster.
  const [search, setSearch] = useState('');
  // Subject filter: the subjects present on this tab, and the rows of the chosen one.
  const subjectOptions = useMemo(() => [...new Set(activeRows.map((row) => row.subject_area).filter((area): area is string => !!area))].sort(), [activeRows]);
  const subjectActive = subject !== 'ALL' && subjectOptions.includes(subject);
  const productOptions = useMemo(() => ALL_PRODUCTS.filter((name) => activeRows.some((row) => row.product === name)), [activeRows]);
  const productActive = product !== 'ALL' && productOptions.includes(product);
  const subjectRows = useMemo(() => {
    const byProduct = productActive ? activeRows.filter((row) => row.product === product) : activeRows;
    return subjectActive ? byProduct.filter((row) => row.subject_area === subject) : byProduct;
  }, [activeRows, subject, subjectActive, product, productActive]);
  const selectedTrack = subjectActive ? SUBJECT_TRACK[subject] : undefined;
  const trackTaxonomy = selectedTrack ? activeTaxonomy.filter((d) => d.trackGroup === selectedTrack) : [];
  const displayTaxonomy = trackTaxonomy.length > 0 ? trackTaxonomy : activeTaxonomy;
  // Overview cards (2026-10-15, per request): completion over everyone the filters leave -- the whole tab when no subject is picked, one
  // subject when it is, narrowed by the Product filter as well. See tallyCompletion above for how each instructor is counted.
  const subjectSummary = useMemo(() => {
    const tally = tallyCompletion(subjectRows, activeTaxonomy);
    return tally.total > 0 ? tally : null;
  }, [subjectRows, activeTaxonomy]);
  // One pair of cards per subject on this tab that has a course track (narrowed by the chosen product). A subject without courses to measure
  // (for example Interdisciplinary & Applied) has no cards.
  const subjectBreakdown = useMemo(() => {
    const byProduct = productActive ? activeRows.filter((row) => row.product === product) : activeRows;
    return subjectOptions.map((name) => ({ name, tally: tallyCompletion(byProduct.filter((row) => row.subject_area === name), activeTaxonomy) })).filter((entry) => entry.tally.total > 0);
  }, [activeRows, subjectOptions, product, productActive, activeTaxonomy]);
  const scopeLabel = `${subjectActive ? subject : activeSubTab.label}${productActive ? ` (${product})` : ''}`;
  const productSuffix = productActive ? ` (${product})` : '';
  const searchedRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return subjectRows;
    return subjectRows.filter((row) => row.full_name.toLowerCase().includes(query) || (row.employee_id ?? '').toLowerCase().includes(query));
  }, [subjectRows, search]);
  const pager = usePagedRows(searchedRows, 50);
  const groups = groupByTrack(displayTaxonomy);
  // Download CSV (2026-10-15, per request): everything the current tab, subject filter and search match -- every page, not just the one
  // on screen -- with the same columns and status wording the table shows (no emoji), then the subject completion % per track group.
  const downloadTable = () => {
    const statusText = (status: CourseStatus, progress?: number) => {
      if (status === 'NO_DATA') return '';
      const label = status === 'COMPLETED' ? 'Completed' : status === 'IN_PROGRESS' ? 'In Progress' : status === 'NOT_STARTED' ? 'Not Started' : 'Mapping pending';
      return (status === 'IN_PROGRESS' || status === 'COMPLETED') && progress !== undefined ? `${label} (${Math.round(progress)}%)` : label;
    };
    const headers = ['Employee ID', 'Name', 'Department', 'Subject', 'Product', 'Capability Manager', ...displayTaxonomy.map((def) => `${def.trackGroup} - ${def.label}`), ...groups.map((group) => `Subject completion % - ${group.trackGroup}`)];
    const rows = searchedRows.map((row) => [
      row.employee_id, row.full_name, row.department, row.subject_area, row.product, row.capability_manager,
      ...displayTaxonomy.map((def) => statusText(row.courses[def.key] ?? 'NO_DATA', row.course_progress?.[def.key])),
      ...groups.map((group) => { const pct = subjectCompletion(row, group.defs); return pct === null ? '' : Math.round(pct * 10) / 10; }),
    ]);
    downloadCsv(`training-stats-${slugify(subjectActive ? subject : activeSubTab.label)}${productActive ? `-${slugify(product)}` : ''}.csv`, toCsv(headers, rows));
  };
  const pendingCount = displayTaxonomy.filter((d) => !isResolved(d)).length;

  return <div className="mx-auto max-w-[1600px]">
    <PageIntro
      eyebrow="BigQuery / niat_instructor_unit_wise_completion_and_best_attempt_details, aggregated per course"
      title="Training Stats"
      description="Each instructor's OWN training/upskilling completion -- not their session-teaching activity, which the other tabs track. Scoped to Instructors and Mentors only, identified by Employee ID. Columns marked 'Mapping pending' don't have a confirmed real course match yet and show the same placeholder for everyone until that's resolved."
      action={<div className="flex items-center gap-2">
        <button type="button" data-testid="button-refresh-training-stats" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>
        <button type="button" data-testid="button-sync-training-status" onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-2 self-start rounded-lg bg-primary px-3.5 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 lg:self-auto">{syncing ? 'Syncing…' : 'Sync Now'}</button>
      </div>}
    />

    {syncMessage && <p data-testid="status-sync-training-status" className={`mb-4 max-w-2xl rounded-lg px-3 py-2 text-[12px] font-semibold ${syncMessage.ok ? 'bg-[#e5f3ed] text-[#256e65]' : 'bg-[#fff0ec] text-[#9b4434]'}`}>{syncMessage.text}</p>}

    <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
      {SUB_TABS.map((tab) => <button
        key={tab.key}
        type="button"
        data-testid={`button-tab-${tab.key}`}
        onClick={() => { setActiveTab(tab.key); setSubject('ALL'); }}
        className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${tab.key === activeTab ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
      >
        {tab.label}
      </button>)}
    </div>

    {data && subjectOptions.length > 1 && <div data-testid="training-subject-filter" className="-mt-3 mb-6 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Subject</span>
      {['ALL', ...subjectOptions].map((option) => <button
        key={option}
        type="button"
        data-testid={`button-subject-${option}`}
        onClick={() => setSubject(option)}
        className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${(option === 'ALL' ? !subjectActive : subject === option) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
      >
        {option === 'ALL' ? 'All subjects' : option}
      </button>)}
    </div>}

    {data && productOptions.length > 1 && <div data-testid="training-product-filter" className={`mb-6 flex flex-wrap items-center gap-2 ${subjectOptions.length > 1 ? '-mt-3' : ''}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Product</span>
      {['ALL', ...productOptions].map((option) => <button
        key={option}
        type="button"
        data-testid={`button-product-${option}`}
        onClick={() => setProduct(option)}
        className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${(option === 'ALL' ? !productActive : product === option) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
      >
        {option === 'ALL' ? 'All products' : option}
      </button>)}
    </div>}

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Training Stats is unavailable right now." />}

    {data && <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className={`grid grid-cols-1 gap-3 ${subjectSummary ? 'max-w-3xl sm:grid-cols-3' : 'max-w-xs'}`}>
        <TopStat
          label={`${subjectActive ? subject : activeSubTab.label}${productSuffix} instructors tracked`}
          value={formatKpi(subjectRows.length)}
          meta={data.synced_at ? `Last synced -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet -- click Sync Now'}
          icon={<GraduationCap size={16} />}
          tone="navy"
        />
        {subjectSummary && <TopStat
          label={`${scopeLabel} -- completed`}
          value={formatKpi(subjectSummary.completed)}
          meta={`${completedMeta(subjectSummary, 'instructors')}${subjectSummary.untracked > 0 ? ` -- ${formatKpi(subjectSummary.untracked)} with no course track not counted` : ''}`}
          icon={<CheckCircle2 size={16} />}
          tone="green"
        />}
        {subjectSummary && <TopStat
          label={`${scopeLabel} -- in progress`}
          value={formatKpi(subjectSummary.inProgress)}
          meta={`of ${formatKpi(subjectSummary.total)} instructors, part-way`}
          icon={<Clock size={16} />}
          tone="amber"
        />}
      </div>
      {subjectRows.length > 0 && <div className="flex flex-wrap items-center gap-2">
        <DownloadCsvButton onClick={downloadTable} disabled={searchedRows.length === 0} label={`Download CSV (${formatKpi(searchedRows.length)})`} testId="button-download-training-stats-csv" />
        <TableSearchInput value={search} onChange={setSearch} testId="input-search-training-stats" />
      </div>}
    </div>}

    {data && !subjectActive && subjectBreakdown.length > 1 && <div data-testid="subject-completion-cards" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {subjectBreakdown.flatMap(({ name, tally }) => [
        <TopStat
          key={`${name}-completed`}
          label={`${name}${productSuffix} -- completed`}
          value={formatKpi(tally.completed)}
          meta={completedMeta(tally, `${name} instructors`)}
          icon={<CheckCircle2 size={16} />}
          tone="green"
        />,
        <TopStat
          key={`${name}-in-progress`}
          label={`${name}${productSuffix} -- in progress`}
          value={formatKpi(tally.inProgress)}
          meta={`of ${formatKpi(tally.total)} ${name} instructors, part-way`}
          icon={<Clock size={16} />}
          tone="amber"
        />,
      ])}
    </div>}

    {data && pendingCount > 0 && <p className="mb-6 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
      <strong className="font-semibold text-foreground">{pendingCount} column{pendingCount === 1 ? '' : 's'}</strong> ({displayTaxonomy.filter((d) => !isResolved(d)).map((d) => d.label).join(', ')}) don't have a confirmed course mapping yet and show as "Mapping pending" for everyone -- see Instructor_Learning_Status_Course_Mapping_Review.xlsx.
    </p>}

    {data && activeTaxonomy.length > 0 && <p data-testid="note-subject-completion" className="mb-6 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
      <strong className="font-semibold text-foreground">Subject completion %</strong> averages each course in the subject. A course counts as Completed once 85% or more of its units are done, In Progress below that, and Not Started at zero progress. Both Completed and In Progress show the actual share of units done next to the status (for example Completed (92%)). Scores: Completed = 100%, In Progress = the share of that course's units actually done (shown next to the status), Not Started or no data = 0%. Courses still showing "Mapping pending" are left out. For example, Frontend with 5 courses completed and React JS 60% done is (5 x 100 + 60) / 6 = 93.3%.
    </p>}

    {data && activeTaxonomy.length === 0 && <EmptyState
      title={`No ${activeSubTab.label} courses configured yet`}
      description={`The ${activeSubTab.label} tab is ready, but no courses have been mapped to it yet -- let Claude know which courses to track and this tab will populate the same way the others did.`}
    />}

    {data && activeTaxonomy.length > 0 && data.count === 0 && <EmptyState title="No training-status data yet" description="Click Sync Now to pull the latest from BigQuery." />}

    {data && activeTaxonomy.length > 0 && data.count > 0 && activeRows.length === 0 && <EmptyState
      title={`No ${activeSubTab.label} instructors classified yet`}
      description="No instructor's Subject is set to this area yet -- set it on the Instructors tab (Subject column) and it'll show up here."
    />}

    {data && activeTaxonomy.length > 0 && activeRows.length > 0 && searchedRows.length === 0 && <EmptyState title="No one matches this search" description="Try a broader search or clear the search box." />}

    {data && activeTaxonomy.length > 0 && searchedRows.length > 0 && (
      <div className="rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-[#f4f7f9]">
                <th rowSpan={2} className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-[#f4f7f9] px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Employee ID</th>
                <th rowSpan={2} className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Name</th>
                <th rowSpan={2} className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Department</th>
                <th rowSpan={2} className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Subject</th>
                <th rowSpan={2} className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Same Product as the Instructors tab">Product</th>
                <th rowSpan={2} className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Capability Manager</th>
                {groups.map((group) => <th key={group.trackGroup} colSpan={group.defs.length} className="whitespace-nowrap border-b border-l border-border px-4 py-2 text-center font-mono-ui text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">{group.trackGroup}</th>)}
                <th colSpan={groups.length} data-testid="header-subject-completion" className="whitespace-nowrap border-b border-l-2 border-border bg-[#eef4ee] px-4 py-2 text-center font-mono-ui text-[10px] font-bold uppercase tracking-[0.12em] text-foreground" title="Completed = 100%, In Progress = its actual % done, Not Started or no data = 0%, averaged over the subject's mapped courses">Subject completion %</th>
              </tr>
              <tr className="border-b border-border bg-[#f4f7f9]">
                {groups.flatMap((group) => group.defs.map((def, i) => <th key={def.key} className={`whitespace-nowrap px-3 py-2.5 text-center font-mono-ui text-[10px] uppercase tracking-[0.1em] text-muted-foreground ${i === 0 ? 'border-l border-border' : ''}`}>{def.label}</th>))}
                {groups.map((group, i) => <th key={`pct-${group.trackGroup}`} className={`whitespace-nowrap bg-[#eef4ee] px-3 py-2.5 text-center font-mono-ui text-[10px] uppercase tracking-[0.1em] text-muted-foreground ${i === 0 ? 'border-l-2 border-border' : ''}`}>{group.trackGroup}</th>)}
              </tr>
            </thead>
            <tbody>
              {pager.pageRows.map((row) => <tr key={row.employee_id ?? row.full_name} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-card px-4 py-3 font-mono-ui text-[11px] text-foreground">{row.employee_id || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] font-semibold text-foreground">{row.full_name}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.department || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-foreground" data-testid={`cell-subject-${row.employee_id ?? row.full_name}`}>{row.subject_area || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-foreground" data-testid={`cell-product-${row.employee_id ?? row.full_name}`}>{row.product || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.capability_manager || '—'}</td>
                {displayTaxonomy.map((def, i) => <td key={def.key} className={`px-3 py-2.5 text-center ${i === 0 ? 'border-l border-border' : ''}`}><StatusBadge status={row.courses[def.key] ?? 'NO_DATA'} progress={row.course_progress?.[def.key]} /></td>)}
                {groups.map((group, i) => {
                  const pct = subjectCompletion(row, group.defs);
                  return <td key={`pct-${group.trackGroup}`} data-testid={`cell-subject-completion-${group.trackGroup}`} className={`bg-[#f6faf6] px-3 py-2.5 text-center ${i === 0 ? 'border-l-2 border-border' : ''}`}>{pct === null ? <span className="text-[11px] text-muted-foreground">—</span> : <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${percentTone(pct)}`}>{formatPercent(pct)}</span>}</td>;
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
        <TablePager
          page={pager.page}
          pageCount={pager.pageCount}
          pageSize={pager.pageSize}
          start={pager.start}
          end={pager.end}
          total={pager.total}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
        />
      </div>
    )}
  </div>;
}
