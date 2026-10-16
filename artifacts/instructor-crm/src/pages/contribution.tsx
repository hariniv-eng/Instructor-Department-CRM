import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Gauge, RefreshCw } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { downloadCsv, toCsv } from '@/lib/csv';
import { ALL_PRODUCTS } from './instructors';

// "Contribution" (2026-09-24, per request): each instructor's actual
// session-teaching hours delivered -- distinct from Training Stats, which
// tracks an instructor's OWN upskilling/coursework, not what they taught.
// Replaces the manual Contribution sheet Ankush previously uploaded --
// sourced instead from BigQuery's niat_instructor_session_schedule_details,
// aggregated per instructor by fetchContributionRows() and synced into
// instructorContributionTable via POST /sync/instructor-contribution (see
// api-server/src/lib/connectors/instructorContribution.ts and GET
// /reports/instructor-contribution in reports.ts).
//
// Covers both Instructors and Mentors together (2026-09-24, per request:
// "create a new tab for employee contribution, where we have data of
// instructors as well mentor data there") -- same population Training
// Stats uses, one flat table, no sub-tabs.
//
// Only COMPLETED sessions count as "hours worked" -- a scheduled-but-not-
// yet-run session isn't a contribution yet. Lecture Hours and Practice
// Hours are their own columns (session_type = LECTURE / PRACTICE); Other
// Hours is every other session_type (EXAM, and anything else that shows up
// later) bucketed together, per request ("how many hours of lecture
// session and also practice hours and also other hours he has worked").
type ContributionRow = {
  employee_id: string | null;
  full_name: string;
  department: string | null;
  capability_manager: string | null;
  // Subject (2026-10-14, per request) -- same value as the Training Stats and Instructors tabs.
  subject_area: string | null;
  // Product (2026-10-15, per request) -- same label as the Instructors tab's Product column (NIAT (Deployed), NIAT (Training), Academy, Intensive, IIT X DSA, Support).
  product: string;
  // Date of joining: Darwin, then the archived Darwin record, then typed in by hand (payroll-converted people have none in Darwin).
  date_of_joining: string | null;
  date_of_joining_source: 'darwin' | 'exit' | 'archive' | 'manual' | null;
  // Training Duration: whole days from the date of joining to the deployment date (first session ever scheduled).
  training_days: number | null;
  // Experience (2026-10-15, per request): years in the organization from the date of joining to today (or to the date of exit once the
  // person has one, experience_until_exit), one decimal. Null when there is no joining date.
  experience_years: number | null;
  experience_until_exit: boolean;
  classification: string | null;
  // Instructor/Mentor bifurcation (2026-09-24, per request) -- mirrors the
  // Instructors tab's own bifurcation column/badge styling.
  role: 'Instructor' | 'Mentor';
  has_contribution_data: boolean;
  lecture_hours: number;
  practice_hours: number;
  other_hours: number;
  total_hours: number;
  sessions_completed: number;
  lecture_sessions: number;
  practice_sessions: number;
  // Completed sessions that are neither Lecture nor Practice (exams and other types). sessions_completed is the complete total
  // (Lecture + Practice + Other) and session_days counts every day with any completed session (2026-10-15, per request).
  other_sessions: number;
  session_days: number;
  deployment_date: string | null;
  // Demo and AI-assessment hours (2026-10-14, per request): total recorded audio time of the person's Completed demo / AI assessment
  // evaluations (BigQuery z_niat_instructors_demo_qa_rating_details, audio length converted from seconds to hours) and the number of
  // evaluations. Both follow the date filter.
  demo_hours: number;
  demo_evaluations: number;
  ai_assessment_hours: number;
  ai_assessment_evaluations: number;
  // One combined average final score (0-10) over all Completed Demo and AI assessment evaluations that have a score; null when none do.
  eval_avg_score: number | null;
  eval_avg_hours: number | null;
  // Learning hours (2026-10-15, per request): total time spent on course units (seconds converted to hours) and the number of days
  // with activity. Follows the date filter.
  learning_hours: number;
  learning_days: number;
  // Batch coverage (2026-09-28, per request: "add all the batches that are
  // associated with all the instructors, and in other column only put
  // batch_names which he have been taking from past 1 month") -- both
  // scoped to COMPLETED sessions, same as every other column here.
  all_batches: string[];
  recent_batches: string[];
  // NIAT cohort year(s) (2026-09-29, per request) -- e.g. "NIAT 2025",
  // "NIAT 2026" -- which real-world student intake(s) this person has
  // taught, derived from all_batches server-side (see
  // BATCH_NAME_TO_NIAT_COHORT in instructorContribution.ts). A batch this
  // app hasn't been told the cohort for yet (or an out-of-scope one, like
  // Training Institute or IIT Kharagpur) simply doesn't contribute a
  // cohort here, so this can be shorter than all_batches.
  niat_cohorts: string[];
};

type ContributionResponse = {
  count: number;
  rows: ContributionRow[];
  synced_at: string | null;
  range?: { from: string | null; to: string | null } | null;
};

const QUERY_KEY = ['reports', 'instructor-contribution'];

// Date filter (2026-10-12, per request): hours and session counts are totalled for the chosen days only. Both ends are
// inclusive; either can be left empty. Empty both = all time.
const toIsoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - (days - 1)); return toIsoDay(date); };
const PRESETS: { label: string; days: number | null }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
];
const formatDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function useContribution(from: string, to: string) {
  return useQuery<ContributionResponse>({
    queryKey: [...QUERY_KEY, from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const response = await fetch(`/api/reports/instructor-contribution${params.toString() ? `?${params}` : ''}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

function formatHours(hours: number): string {
  return hours.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Average sessions per day (2026-10-15, per request): total sessions completed divided by the number of days sessions were taken on --
// the two figures the Sessions (days) column already shows. Shown as a whole number (rounded to the nearest, 2026-10-15 per request:
// sessions are counted in whole numbers). Null when there are no session days.
function avgSessionsPerDay(row: ContributionRow): number | null {
  if (!row.has_contribution_data || !row.session_days || row.session_days <= 0) return null;
  return row.sessions_completed / row.session_days;
}
// Average session hours per day (2026-10-15, per request): total hours (Lecture + Practice + Other) divided by the days sessions were taken on.
function avgHoursPerDay(row: ContributionRow): number | null {
  if (!row.has_contribution_data || !row.session_days || row.session_days <= 0) return null;
  return row.total_hours / row.session_days;
}
// Workload (2026-10-15, per request): Avg Hrs / Day + Learning Hrs / Day + Avg Demo / AI Hrs, added up from the figures as the row shows them
// (hours to one decimal, the demo/AI figure to two). A missing part counts as 0; null when all three are missing.
// 2026-10-16, per request: now also calculated for instructors still in training (no deployment date), from whatever data they have
// (typically learning hours and demo / AI evaluations). Someone with none of the three still gets no workload.
function workloadOf(row: ContributionRow): number | null {
  const hours = avgHoursPerDay(row);
  const learning = row.learning_days > 0 ? row.learning_hours / row.learning_days : null;
  const evalHrs = row.eval_avg_hours;
  if (hours === null && learning === null && evalHrs === null) return null;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return Math.round(((hours !== null ? round1(hours) : 0) + (learning !== null ? round1(learning) : 0) + (evalHrs ?? 0)) * 100) / 100;
}
const formatAvg = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Same badge colors as BifurcationCell on the Instructors tab (2026-09-22
// precedent) -- kept in sync deliberately so "Mentor" reads the same way
// across both pages.
function RoleBadge({ role }: { role: ContributionRow['role'] }) {
  const toneClass = role === 'Mentor' ? 'bg-[#e3f3ea] text-[#1f7a4d]' : 'bg-[#e6e9fb] text-[#4a4fb0]';
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${toneClass}`}>{role}</span>;
}

// Role by sessions (2026-10-13, per request): a second Instructor / Mentor bifurcation that lives ONLY on this table and
// changes nothing else (the Instructors tab and everywhere else keep the designation-based Role above). It is read from
// what the person actually taught: any completed Lecture session -> Instructor (lecture only, or lecture + practice);
// anyone who has taught but never a Lecture (Practice only, Practice / Other, or Other only such as exams) -> Mentor;
// no session data at all (no data, or zero completed hours) -> blank.
function sessionRole(row: ContributionRow): ContributionRow['role'] | null {
  if (!row.has_contribution_data || row.total_hours <= 0) return null;
  return row.lecture_hours > 0 ? 'Instructor' : 'Mentor';
}

const todayIso = () => toIsoDay(new Date());

// Date of joining cell (2026-10-14, per request): Darwin's date is plain text. For people Darwin has no date for (payroll-converted
// instructors) it is a date box -- pick or type the date and it saves straight away; clearing the box removes it.
function JoiningDateCell({ row, onSaved }: { row: ContributionRow; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = (row.date_of_joining_source === null || row.date_of_joining_source === 'manual') && !!row.employee_id;
  if (!editable) return row.date_of_joining ? <span title={row.date_of_joining_source === 'archive' ? 'From the archived Darwin record' : row.date_of_joining_source === 'exit' ? 'From the Darwin exit data' : 'From Darwinbox'}>{formatDay(row.date_of_joining)}</span> : <span className="text-muted-foreground">—</span>;
  const save = async (value: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/reports/instructor-contribution/joining-date', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: row.employee_id, date_of_joining: value || null }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${response.status}`);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return <div className="flex flex-col gap-1">
    <input type="date" value={row.date_of_joining ?? ''} max={todayIso()} disabled={saving} onChange={(event) => void save(event.target.value)} data-testid={`input-joining-${row.employee_id}`} title="No joining date in Darwin -- type it here" className={`h-8 w-[140px] rounded-md border bg-background px-2 text-[12px] font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 ${row.date_of_joining ? 'border-border' : 'border-dashed border-[#d9a441]'}`} />
    {row.date_of_joining_source === 'manual' && <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8a6a12]">Manual</span>}
    {error && <span className="max-w-[140px] whitespace-normal text-[10px] font-semibold text-[#9b4434]">{error}</span>}
  </div>;
}

export default function ContributionPage() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const query = useContribution(dateFrom, dateTo);
  const data = query.data;
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState('');
  // Subject filter (2026-10-14, per request): '' = all subjects, NONE = people with no subject set, otherwise one subject.
  const [subject, setSubject] = useState('');
  // Product filter (2026-10-15, per request): '' = all products, otherwise one product.
  const [product, setProduct] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch('/api/sync/instructor-contribution', { method: 'POST' });
      const result = await response.json();
      if (result.ok) {
        setSyncMessage({ ok: true, text: `Synced ${formatKpi(result.stored)} instructor contribution rows.` });
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

  const subjectOptions = useMemo(() => (data ? [...new Set(data.rows.map((row) => row.subject_area).filter((area): area is string => !!area))].sort() : []), [data]);
  const hasNoSubject = useMemo(() => !!data && data.rows.some((row) => !row.subject_area), [data]);
  const productOptions = useMemo(() => (data ? ALL_PRODUCTS.filter((name) => data.rows.some((row) => row.product === name)) : []), [data]);
  const subjectRows = useMemo(() => {
    if (!data) return [];
    const byProduct = product ? data.rows.filter((row) => row.product === product) : data.rows;
    if (!subject) return byProduct;
    if (subject === 'NONE') return byProduct.filter((row) => !row.subject_area);
    return byProduct.filter((row) => row.subject_area === subject);
  }, [data, subject, product]);
  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subjectRows;
    return subjectRows.filter((row) => row.full_name.toLowerCase().includes(q) || (row.employee_id ?? '').toLowerCase().includes(q));
  }, [subjectRows, search]);
  const pager = usePagedRows(searchedRows, 50);

  // Sum across every instructor currently loaded (unaffected by search) --
  // a quick "how much did the department teach in total" figure alongside
  // the per-instructor table below.
  const totalHoursAllInstructors = useMemo(() => subjectRows.reduce((sum, r) => sum + r.total_hours, 0), [subjectRows]);
  // Average workload (2026-10-16, per request): the mean of the Workload column over the same rows as the cards above (date range,
  // subject and product filters; not search). People with no workload (no session, learning or evaluation data) are left out, not
  // counted as 0. Averages the workloads exactly as the column shows them (two decimals).
  const workloadStats = useMemo(() => {
    const values = subjectRows.map(workloadOf).filter((v): v is number => v !== null);
    return { count: values.length, average: values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null };
  }, [subjectRows]);
  const subjectLabel = [product, subject === 'NONE' ? 'with no subject' : subject].filter(Boolean).join(' · ');

  // Download CSV (2026-10-15, per request): everything the current date range, subject filter and search match -- every page, not just the
  // one on screen -- with the same columns as the table. Hours and counts are plain numbers so they sum and sort in a spreadsheet.
  const downloadTable = () => {
    const headers = ['Employee ID', 'Name', 'Role', 'Role (by sessions)', 'Department', 'Subject', 'Product', 'Capability Manager', 'Date of Joining', 'Date of Joining Source', 'Deployment Date', 'Training Duration (days)', 'Experience (years)', 'Lecture Hrs', 'Lecture Sessions', 'Practice Hrs', 'Practice Sessions', 'Other Hrs', 'Other Sessions', 'Total Hrs', 'Sessions', 'Session Days', 'Demo Hrs', 'Demo Evaluations', 'AI Assessment Hrs', 'AI Assessment Evaluations', 'Learning Hrs', 'Learning Days', 'Avg Sessions / Day', 'Avg Hrs / Day', 'Learning Hrs / Day', 'Avg Demo / AI Hrs', 'Workload', 'Contribution', 'All Batches', 'Batches (Last 30 Days)'];
    const rows = searchedRows.map((row) => {
      const has = row.has_contribution_data;
      return [
        row.employee_id, row.full_name, row.role, sessionRole(row), row.department, row.subject_area, row.product, row.capability_manager,
        row.date_of_joining, row.date_of_joining_source, row.deployment_date, row.training_days, row.experience_years,
        has ? row.lecture_hours : '', has ? row.lecture_sessions : '', has ? row.practice_hours : '', has ? row.practice_sessions : '', has ? row.other_hours : '', has ? row.other_sessions : '', has ? row.total_hours : '', has ? row.sessions_completed : '', has ? row.session_days : '',
        row.demo_evaluations > 0 ? row.demo_hours : '', row.demo_evaluations > 0 ? row.demo_evaluations : '',
        row.ai_assessment_evaluations > 0 ? row.ai_assessment_hours : '', row.ai_assessment_evaluations > 0 ? row.ai_assessment_evaluations : '',
        row.learning_days > 0 ? row.learning_hours : '', row.learning_days > 0 ? row.learning_days : '', avgSessionsPerDay(row) !== null ? Math.round(avgSessionsPerDay(row)!) : '', avgHoursPerDay(row) !== null ? Math.round(avgHoursPerDay(row)! * 10) / 10 : '', row.learning_days > 0 ? Math.round((row.learning_hours / row.learning_days) * 10) / 10 : '', row.eval_avg_hours ?? '', workloadOf(row) ?? '',
        row.niat_cohorts.join(', '), row.all_batches.join(', '), row.recent_batches.join(', '),
      ];
    });
    const range = dateFrom || dateTo ? `-${dateFrom || 'start'}-to-${dateTo || toIsoDay(new Date())}` : '';
    const subjectPart = [product, subject && subject !== 'NONE' ? subject : ''].filter(Boolean).map((part) => `-${part.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`).join('');
    downloadCsv(`contribution${subjectPart}${range}.csv`, toCsv(headers, rows));
  };

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="BigQuery / niat_instructor_session_schedule_details, aggregated per instructor"
      title="Contribution"
      description="Actual session-teaching hours delivered by each instructor and mentor -- Lecture, Practice, and Other (exams and anything else) -- counting only sessions that actually ran (COMPLETED), not ones still scheduled."
      action={<div className="flex items-center gap-2">
        <button type="button" data-testid="button-refresh-contribution" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>
        <button type="button" data-testid="button-sync-contribution" onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-2 self-start rounded-lg bg-primary px-3.5 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 lg:self-auto">{syncing ? 'Syncing…' : 'Sync Now'}</button>
      </div>}
    />

    {syncMessage && <p data-testid="status-sync-contribution" className={`mb-4 max-w-2xl rounded-lg px-3 py-2 text-[12px] font-semibold ${syncMessage.ok ? 'bg-[#e5f3ed] text-[#256e65]' : 'bg-[#fff0ec] text-[#9b4434]'}`}>{syncMessage.text}</p>}

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Contribution is unavailable right now." />}

    {data && <div data-testid="contribution-date-filter" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">From
        <input type="date" value={dateFrom} max={dateTo || toIsoDay(new Date())} onChange={(event) => setDateFrom(event.target.value)} data-testid="input-contribution-from" className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-[12px] font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" />
      </label>
      <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">To
        <input type="date" value={dateTo} min={dateFrom || undefined} max={toIsoDay(new Date())} onChange={(event) => setDateTo(event.target.value)} data-testid="input-contribution-to" className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-[12px] font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" />
      </label>
      <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Subject
        <select value={subject} onChange={(event) => setSubject(event.target.value)} data-testid="select-contribution-subject" className="mt-1 block h-9 min-w-[160px] rounded-md border border-border bg-background px-2 text-[12px] font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25">
          <option value="">All subjects</option>
          {subjectOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          {hasNoSubject && <option value="NONE">No subject set</option>}
        </select>
      </label>
      <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Product
        <select value={product} onChange={(event) => setProduct(event.target.value)} data-testid="select-contribution-product" className="mt-1 block h-9 min-w-[160px] rounded-md border border-border bg-background px-2 text-[12px] font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25">
          <option value="">All products</option>
          {productOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const active = preset.days === null ? !dateFrom && !dateTo : dateFrom === daysAgo(preset.days) && dateTo === toIsoDay(new Date());
          return <button key={preset.label} type="button" data-testid={`button-contribution-range-${preset.days ?? 'all'}`} onClick={() => { if (preset.days === null) { setDateFrom(''); setDateTo(''); } else { setDateFrom(daysAgo(preset.days)); setDateTo(toIsoDay(new Date())); } }} className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>{preset.label}</button>;
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{dateFrom || dateTo ? `Showing sessions from ${dateFrom ? formatDay(dateFrom) : 'the start'} to ${dateTo ? formatDay(dateTo) : 'today'} (both days included).` : 'Showing all sessions. Pick a range to see Lecture, Practice and total sessions for just those days.'}</p>
    </div>}

    {data && (dateFrom || dateTo) && data.count > 0 && totalHoursAllInstructors === 0 && <p data-testid="note-contribution-empty-range" className="mb-4 max-w-3xl rounded-lg bg-[#fff3d6] px-3 py-2 text-[12px] font-semibold text-[#8a6a12]">No completed sessions in this range. If the date filter was only just added, click Sync Now once to load the day-by-day data.</p>}

    {data && <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        <TopStat
          label={subject ? `Instructors + Mentors tracked (${subjectLabel})` : 'Instructors + Mentors tracked'}
          value={formatKpi(subjectRows.length)}
          meta={data.synced_at ? `Last synced -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet -- click Sync Now'}
          icon={<Clock size={16} />}
          tone="navy"
        />
        <TopStat
          label="Total hours delivered"
          value={formatHours(totalHoursAllInstructors)}
          meta={dateFrom || dateTo ? `Across ${subject ? `every ${subjectLabel} instructor and mentor` : 'every instructor and mentor'}, ${dateFrom ? formatDay(dateFrom) : 'the start'} to ${dateTo ? formatDay(dateTo) : 'today'}` : `Across ${subject ? `every ${subjectLabel} instructor and mentor` : 'every instructor and mentor'}, all-time`}
          icon={<Clock size={16} />}
          tone="teal"
        />
        <TopStat
          label="Average workload"
          value={workloadStats.average !== null ? workloadStats.average.toFixed(2) : '—'}
          meta={`Over ${formatKpi(workloadStats.count)} of ${formatKpi(subjectRows.length)} ${subject || product ? `${subjectLabel} ` : ''}instructors and mentors with a workload; the ${formatKpi(subjectRows.length - workloadStats.count)} with no session, learning or evaluation data are left out`}
          icon={<Gauge size={16} />}
          tone="indigo"
        />
      </div>
      {data.count > 0 && <div className="flex flex-wrap items-center gap-2">
        <DownloadCsvButton onClick={downloadTable} disabled={searchedRows.length === 0} label={`Download CSV (${formatKpi(searchedRows.length)})`} testId="button-download-contribution-csv" />
        <TableSearchInput value={search} onChange={setSearch} testId="input-search-contribution" />
      </div>}
    </div>}

    {data && data.count === 0 && <EmptyState title="No contribution data yet" description="Click Sync Now to pull the latest from BigQuery." />}

    {data && data.count > 0 && searchedRows.length === 0 && <EmptyState title="No one matches this search" description="Try a broader search or clear the search box." />}

    {data && data.count > 0 && searchedRows.length > 0 && (
      <div className="rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-[#f4f7f9]">
                <th className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-[#f4f7f9] px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Employee ID</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Name</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Role</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Instructor if they took any Lecture session; Mentor if they took sessions but no Lecture; blank if no session data">Role (by sessions)</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Department</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Subject</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Same Product as the Instructors tab">Product</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Capability Manager</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Date of joining from Darwinbox">Date of Joining</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Date of the first session ever scheduled for this instructor">Deployment Date</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Whole days from the date of joining to the deployment date (first session taken)">Training Duration</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Years in the organization: from the date of joining to today, or to the date of exit once the person has one">Experience</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Hours, with the number of Lecture sessions in brackets">Lecture Hrs (sessions)</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Hours, with the number of Practice sessions in brackets">Practice Hrs (sessions)</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Hours of exams and any other session type that is not Lecture or Practice, with the number of those sessions in brackets">Other Hrs (sessions)</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">Total Hrs</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Total completed sessions: Lecture + Practice + Other (exams and other types), with the number of days the instructor took sessions on in brackets">Sessions (days)</th>
                <th className="border-l border-border whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Total recorded time of the instructor's Completed DEMO evaluations, in hours, with the number of evaluations in brackets">Demo Hrs (evaluations)</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Total recorded time of the instructor's Completed AI assessment evaluations, in hours, with the number of evaluations in brackets">AI Assessment Hrs (evaluations)</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Total time the instructor spent on course units on the learning platform, in hours, with the number of active days in brackets">Learning Hrs (days)</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Total sessions divided by the number of days the instructor took sessions on (both follow the date filter)">Avg Sessions / Day</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Total session hours (Lecture + Practice + Other) divided by the number of days the instructor took sessions on (both follow the date filter)">Avg Hrs / Day</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Learning hours divided by the number of days the instructor was active on the learning platform (both follow the date filter)">Learning Hrs / Day</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Demo hours divided by demo evaluations, plus AI assessment hours divided by AI evaluations (average length of one evaluation of each kind, added together). Uses the exact recorded time, not the rounded hours shown">Avg Demo / AI Hrs</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-foreground" title="Workload = Avg Hrs / Day + Learning Hrs / Day + Avg Demo / AI Hrs, added up as shown in those columns. Includes instructors still in training, from whatever data they have; blank when they have no session, learning or evaluation data">Workload</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-left font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Contribution</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-left font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">All Batches</th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Batches (Last 30 Days)</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageRows.map((row) => <tr key={row.employee_id ?? row.full_name} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-card px-4 py-3 font-mono-ui text-[11px] text-foreground">{row.employee_id || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] font-semibold text-foreground">{row.full_name}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3"><RoleBadge role={row.role} /></td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3" data-testid={`cell-session-role-${row.employee_id ?? row.full_name}`}>{(() => { const derived = sessionRole(row); return derived ? <RoleBadge role={derived} /> : null; })()}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.department || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-foreground" data-testid={`cell-subject-${row.employee_id ?? row.full_name}`}>{row.subject_area || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-foreground" data-testid={`cell-product-${row.employee_id ?? row.full_name}`}>{row.product || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.capability_manager || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-foreground" data-testid={`cell-date-of-joining-${row.employee_id ?? row.full_name}`}><JoiningDateCell row={row} onSaved={refresh} /></td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-foreground" data-testid={`cell-deployment-date-${row.employee_id ?? row.full_name}`}>{row.deployment_date ? formatDay(row.deployment_date) : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] font-semibold tabular-nums text-foreground" data-testid={`cell-training-duration-${row.employee_id ?? row.full_name}`} title={row.training_days !== null ? `About ${Math.round((row.training_days / 7) * 10) / 10} weeks` : 'Needs both a date of joining and a deployment date'}>{row.training_days !== null ? `${row.training_days} ${row.training_days === 1 ? 'day' : 'days'}` : <span className="font-normal text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] font-semibold tabular-nums text-foreground" data-testid={`cell-experience-${row.employee_id ?? row.full_name}`} title={row.experience_years !== null ? (row.experience_until_exit ? 'Joining date to date of exit' : 'Joining date to today') : 'Needs a date of joining'}>{row.experience_years !== null ? `${row.experience_years.toFixed(1)} yrs` : <span className="font-normal text-muted-foreground">—</span>}</td>
                {row.has_contribution_data
                  ? <>
                    <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.lecture_hours)} <span className="text-muted-foreground" title="Lecture sessions">({formatKpi(row.lecture_sessions ?? 0)})</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.practice_hours)} <span className="text-muted-foreground" title="Practice sessions">({formatKpi(row.practice_sessions ?? 0)})</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.other_hours)} <span className="text-muted-foreground" title="Other sessions (exams and other types)">({formatKpi(row.other_sessions ?? 0)})</span></td>
                    <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] font-bold tabular-nums text-foreground">{formatHours(row.total_hours)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-muted-foreground">{formatKpi(row.sessions_completed)} <span className="text-[11px]" title="Distinct days on which these Lecture and Practice sessions were taken">(in {formatKpi(row.session_days ?? 0)} {row.session_days === 1 ? 'day' : 'days'})</span></td>
                  </>
                  : <td colSpan={5} className="whitespace-nowrap border-l border-border px-4 py-3 text-center text-[11px] italic text-muted-foreground">No data</td>}
                <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground" data-testid={`cell-demo-hours-${row.employee_id ?? row.full_name}`}>{row.demo_evaluations > 0 ? <>{formatHours(row.demo_hours)} <span className="text-muted-foreground" title="Demo evaluations">({formatKpi(row.demo_evaluations)})</span></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground" data-testid={`cell-ai-hours-${row.employee_id ?? row.full_name}`}>{row.ai_assessment_evaluations > 0 ? <>{formatHours(row.ai_assessment_hours)} <span className="text-muted-foreground" title="AI assessment evaluations">({formatKpi(row.ai_assessment_evaluations)})</span></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground" data-testid={`cell-learning-hours-${row.employee_id ?? row.full_name}`}>{row.learning_days > 0 ? <>{formatHours(row.learning_hours)} <span className="text-muted-foreground" title="Days with activity">({formatKpi(row.learning_days)})</span></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground" data-testid={`cell-avg-sessions-${row.employee_id ?? row.full_name}`} title={`${row.sessions_completed} sessions over ${row.session_days ?? 0} days (rounded to the nearest whole number)`}>{avgSessionsPerDay(row) !== null ? Math.round(avgSessionsPerDay(row)!).toLocaleString('en-IN') : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground" data-testid={`cell-avg-hours-${row.employee_id ?? row.full_name}`} title={`${formatHours(row.total_hours)} hrs over ${row.session_days ?? 0} days`}>{avgHoursPerDay(row) !== null ? formatAvg(avgHoursPerDay(row)!) : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground" data-testid={`cell-learning-per-day-${row.employee_id ?? row.full_name}`}>{row.learning_days > 0 ? formatAvg(row.learning_hours / row.learning_days) : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground" data-testid={`cell-eval-avg-hours-${row.employee_id ?? row.full_name}`} title={`Demo ${formatHours(row.demo_hours)} hrs / ${row.demo_evaluations} + AI ${formatHours(row.ai_assessment_hours)} hrs / ${row.ai_assessment_evaluations}`}>{row.eval_avg_hours !== null ? row.eval_avg_hours.toFixed(2) : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] font-bold tabular-nums text-foreground" data-testid={`cell-workload-${row.employee_id ?? row.full_name}`} title={workloadOf(row) !== null ? 'Avg Hrs / Day + Learning Hrs / Day + Avg Demo / AI Hrs' : 'No session, learning or evaluation data yet'}>{workloadOf(row) !== null ? workloadOf(row)!.toFixed(2) : <span className="font-normal text-muted-foreground">—</span>}</td>
                {row.has_contribution_data
                  ? <>
                    <td className="whitespace-nowrap border-l border-border px-4 py-3 text-[12px] text-foreground">{row.niat_cohorts.length > 0 ? row.niat_cohorts.join(', ') : '—'}</td>
                    <td className="max-w-[280px] truncate border-l border-border px-4 py-3 text-[12px] text-muted-foreground" title={row.all_batches.join(', ')}>{row.all_batches.length > 0 ? row.all_batches.join(', ') : '—'}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-[12px] text-muted-foreground" title={row.recent_batches.join(', ')}>{row.recent_batches.length > 0 ? row.recent_batches.join(', ') : '—'}</td>
                  </>
                  : <td colSpan={3} className="border-l border-border" />}
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
