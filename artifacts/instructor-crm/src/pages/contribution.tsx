import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, RefreshCw } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, TableSearchInput, usePagedRows, formatKpi } from '@/components/ui-pieces';

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
  // Darwin's Date of joining (2026-10-14, per request); null when Darwin has none on file.
  date_of_joining: string | null;
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
  session_days: number;
  deployment_date: string | null;
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

export default function ContributionPage() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const query = useContribution(dateFrom, dateTo);
  const data = query.data;
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState('');

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

  const searchedRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter((row) => row.full_name.toLowerCase().includes(q) || (row.employee_id ?? '').toLowerCase().includes(q));
  }, [data, search]);
  const pager = usePagedRows(searchedRows, 50);

  // Sum across every instructor currently loaded (unaffected by search) --
  // a quick "how much did the department teach in total" figure alongside
  // the per-instructor table below.
  const totalHoursAllInstructors = useMemo(() => (data ? data.rows.reduce((sum, r) => sum + r.total_hours, 0) : 0), [data]);

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
      <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
        <TopStat
          label="Instructors + Mentors tracked"
          value={formatKpi(data.count)}
          meta={data.synced_at ? `Last synced -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet -- click Sync Now'}
          icon={<Clock size={16} />}
          tone="navy"
        />
        <TopStat
          label="Total hours delivered"
          value={formatHours(totalHoursAllInstructors)}
          meta={dateFrom || dateTo ? `Across every instructor and mentor, ${dateFrom ? formatDay(dateFrom) : 'the start'} to ${dateTo ? formatDay(dateTo) : 'today'}` : 'Across every instructor and mentor, all-time'}
          icon={<Clock size={16} />}
          tone="teal"
        />
      </div>
      {data.count > 0 && <TableSearchInput value={search} onChange={setSearch} testId="input-search-contribution" />}
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
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Capability Manager</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Date of joining from Darwinbox">Date of Joining</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Date of the first session ever scheduled for this instructor">Deployment Date</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Hours, with the number of Lecture sessions in brackets">Lecture Hrs (sessions)</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Hours, with the number of Practice sessions in brackets">Practice Hrs (sessions)</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Other Hrs</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">Total Hrs</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title="Completed Lecture and Practice sessions only. Exams and other session types are not counted here (they still count in Other hours).">Sessions (days)</th>
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
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.capability_manager || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-foreground" data-testid={`cell-date-of-joining-${row.employee_id ?? row.full_name}`}>{row.date_of_joining ? formatDay(row.date_of_joining) : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-foreground" data-testid={`cell-deployment-date-${row.employee_id ?? row.full_name}`}>{row.deployment_date ? formatDay(row.deployment_date) : <span className="text-muted-foreground">—</span>}</td>
                {row.has_contribution_data
                  ? <>
                    <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.lecture_hours)} <span className="text-muted-foreground" title="Lecture sessions">({formatKpi(row.lecture_sessions ?? 0)})</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.practice_hours)} <span className="text-muted-foreground" title="Practice sessions">({formatKpi(row.practice_sessions ?? 0)})</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.other_hours)}</td>
                    <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] font-bold tabular-nums text-foreground">{formatHours(row.total_hours)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-muted-foreground">{formatKpi(row.sessions_completed)} <span className="text-[11px]" title="Distinct days on which these Lecture and Practice sessions were taken">(in {formatKpi(row.session_days ?? 0)} {row.session_days === 1 ? 'day' : 'days'})</span></td>
                    <td className="whitespace-nowrap border-l border-border px-4 py-3 text-[12px] text-foreground">{row.niat_cohorts.length > 0 ? row.niat_cohorts.join(', ') : '—'}</td>
                    <td className="max-w-[280px] truncate border-l border-border px-4 py-3 text-[12px] text-muted-foreground" title={row.all_batches.join(', ')}>{row.all_batches.length > 0 ? row.all_batches.join(', ') : '—'}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-[12px] text-muted-foreground" title={row.recent_batches.join(', ')}>{row.recent_batches.length > 0 ? row.recent_batches.join(', ') : '—'}</td>
                  </>
                  : <td colSpan={8} className="whitespace-nowrap border-l border-border px-4 py-3 text-center text-[11px] italic text-muted-foreground">No data</td>}
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
