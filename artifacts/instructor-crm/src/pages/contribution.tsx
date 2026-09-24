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
};

type ContributionResponse = {
  count: number;
  rows: ContributionRow[];
  synced_at: string | null;
};

const QUERY_KEY = ['reports', 'instructor-contribution'];

function useContribution() {
  return useQuery<ContributionResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/instructor-contribution');
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

export default function ContributionPage() {
  const queryClient = useQueryClient();
  const query = useContribution();
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

    {syncMessage && <p data-testid="status-sync-contribution" className={`mb-4 max-w-2xl rounded-lg px-3 py-2 text-[12px] font-semibold ${syncMessage.ok ? 'bg-[#e5f3ed] text-[#287469]' : 'bg-[#fff0ec] text-[#9b4434]'}`}>{syncMessage.text}</p>}

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Contribution is unavailable right now." />}

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
          meta="Across every instructor and mentor, all-time"
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
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Department</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Capability Manager</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Lecture Hrs</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Practice Hrs</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Other Hrs</th>
                <th className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">Total Hrs</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageRows.map((row) => <tr key={row.employee_id ?? row.full_name} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-card px-4 py-3 font-mono-ui text-[11px] text-foreground">{row.employee_id || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] font-semibold text-foreground">{row.full_name}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3"><RoleBadge role={row.role} /></td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.department || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.capability_manager || '—'}</td>
                {row.has_contribution_data
                  ? <>
                    <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.lecture_hours)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.practice_hours)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-foreground">{formatHours(row.other_hours)}</td>
                    <td className="whitespace-nowrap border-l border-border px-4 py-3 text-right font-mono-ui text-[12px] font-bold tabular-nums text-foreground">{formatHours(row.total_hours)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono-ui text-[12px] tabular-nums text-muted-foreground">{formatKpi(row.sessions_completed)}</td>
                  </>
                  : <td colSpan={5} className="whitespace-nowrap border-l border-border px-4 py-3 text-center text-[11px] italic text-muted-foreground">No data</td>}
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
