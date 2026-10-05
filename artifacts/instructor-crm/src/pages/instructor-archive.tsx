import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, RefreshCw } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, TableSearchInput, usePagedRows, formatKpi } from '@/components/ui-pieces';

// Instructor Archive (2026-10-05, made visible per request: "we will
// create a data base of all the instructor department data ... from now
// everyday ... where ever there a new record added to the darwin data
// there data should be added to this full database, and where there is a
// exit record create on any of the candidates of this table should not
// remove there data but instead they should add there exit date to there
// details"). This data already existed before that request --
// instructor_archive, populated by archiveInstructors() (api-server/src/
// lib/archiveInstructors.ts) at the end of every recomputeStatuses() run,
// so it has been growing on the exact same cadence as every Darwin/TeachOS
// sync since 2026-09-28 (originally built for a related but different
// request: payroll-converted instructors losing their Darwin data).
// Nothing had ever surfaced it until this page -- GET
// /reports/instructor-archive (reports.ts) just reads it back out, scoped
// to the same Instructor Department population (Instructors + Mentors +
// Ops team) the live Instructors tab uses.
//
// Additive-only, like the table backing it: no record is ever removed
// here, including on exit -- a person who leaves keeps their row, with
// Exit Date filled in instead. A resignation that's later Revoked clears
// Exit Date back to blank on that SAME row (no new row), per request: "if
// that is status is revoke no need to create another column, just remove
// the exit date". A genuine rehire gets a new employee_id from Darwinbox,
// so it naturally lands as a brand-new row here instead of overwriting the
// old one, per request: "if it status is approved and the hired then
// obviously they will have new employee_id for them then obviously new
// record".
type ArchiveRow = {
  id: number;
  employee_id: string | null;
  teachos_user_id: string | null;
  full_name: string;
  designation: string | null;
  department: string | null;
  dept_area: string | null;
  classification: string | null;
  institutes: string[];
  capability_manager: string | null;
  darwin_manager: string | null;
  date_of_joining: string | null;
  org_email: string | null;
  work_location: string | null;
  gender: string | null;
  enrolled_plans: string | null;
  exit_date: string | null;
  exit_status: string | null;
  status: 'Active' | 'Exited';
  first_seen_at: string;
  last_synced_at: string;
};

type ArchiveResponse = {
  people: ArchiveRow[];
  total: number;
  active_count: number;
  exited_count: number;
};

const QUERY_KEY = ['reports', 'instructor-archive'];

function useArchive() {
  return useQuery<ArchiveResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/instructor-archive');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

// Same bifurcation labeling as the Instructors tab's own BifurcationCell
// (instructors.tsx) -- classification is the reliable source there too
// (dept_bucket gets nulled for Mentor/Ops rows), kept in sync deliberately.
function bifurcationLabel(classification: string | null): string {
  if (classification === 'mentor') return 'Mentor';
  if (classification === 'excluded_ops_managers') return 'Delivery Support';
  return 'Instructor';
}

function StatusBadge({ status }: { status: ArchiveRow['status'] }) {
  const toneClass = status === 'Active' ? 'bg-[#e5f3ed] text-[#287469]' : 'bg-[#fdeeea] text-[#b45436]';
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${toneClass}`}>{status}</span>;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InstructorArchivePage() {
  const queryClient = useQueryClient();
  const query = useArchive();
  const data = query.data;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'exited'>('all');

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.people;
    if (statusFilter === 'active') rows = rows.filter((row) => row.status === 'Active');
    if (statusFilter === 'exited') rows = rows.filter((row) => row.status === 'Exited');
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.full_name.toLowerCase().includes(q) || (row.employee_id ?? '').toLowerCase().includes(q));
  }, [data, search, statusFilter]);
  const pager = usePagedRows(filteredRows, 50);

  const filterButtons: { key: typeof statusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'exited', label: 'Exited' },
  ];

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="instructor_archive — additive-only, grows with every Darwin/TeachOS sync"
      title="Instructor Archive"
      description="The permanent record of everyone who's ever been part of the Instructor Department. Nobody is ever removed from this list -- someone who exits keeps their row here, with an Exit Date filled in instead."
      action={<button type="button" data-testid="button-refresh-archive" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Instructor Archive is unavailable right now." />}

    {data && <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
        <TopStat
          label="Total ever recorded"
          value={formatKpi(data.total)}
          meta="Instructors + Mentors + Ops, all-time"
          icon={<Archive size={16} />}
          tone="navy"
        />
        <TopStat
          label="Currently active"
          value={formatKpi(data.active_count)}
          meta="No exit on file right now"
          icon={<Archive size={16} />}
          tone="teal"
        />
        <TopStat
          label="Exited"
          value={formatKpi(data.exited_count)}
          meta="Kept on record, with an exit date"
          icon={<Archive size={16} />}
          tone="amber"
        />
      </div>
      {data.total > 0 && <div className="flex flex-col items-end gap-2">
        <TableSearchInput value={search} onChange={setSearch} testId="input-search-archive" />
        <div className="flex gap-1.5">
          {filterButtons.map((btn) => <button
            key={btn.key}
            type="button"
            data-testid={`button-filter-${btn.key}`}
            onClick={() => setStatusFilter(btn.key)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${statusFilter === btn.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'}`}
          >{btn.label}</button>)}
        </div>
      </div>}
    </div>}

    {data && data.total === 0 && <EmptyState title="No archive data yet" description="This fills in automatically the next time Darwin/TeachOS data syncs." />}

    {data && data.total > 0 && filteredRows.length === 0 && <EmptyState title="No one matches this search" description="Try a broader search, clear the search box, or change the status filter." />}

    {data && data.total > 0 && filteredRows.length > 0 && (
      <div className="rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-[#f4f7f9]">
                <th className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-[#f4f7f9] px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Name</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Employee ID</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Designation</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Bifurcation</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Subject</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Department</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Campus</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Capability Manager</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Manager (Darwin)</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Date of joining</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Status</th>
                <th className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Exit Date</th>
                <th className="whitespace-nowrap px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Exit Status (Darwin)</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageRows.map((row) => <tr key={row.id} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-card px-4 py-3 text-[12px] font-semibold text-foreground">{row.full_name}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[11px] text-muted-foreground">{row.employee_id || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.designation || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{bifurcationLabel(row.classification)}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.dept_area || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.department || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.institutes.length > 0 ? row.institutes.join(', ') : '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.capability_manager || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.darwin_manager || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[11px] text-muted-foreground">{formatDate(row.date_of_joining)}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3"><StatusBadge status={row.status} /></td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[11px] text-muted-foreground">{formatDate(row.exit_date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[12px] text-muted-foreground">{row.exit_status || '—'}</td>
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
