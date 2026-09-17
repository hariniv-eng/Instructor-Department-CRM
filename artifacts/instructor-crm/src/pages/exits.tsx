import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX, LogOut, PenSquare, RefreshCw, Search, UserX } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, DownloadCsvButton, formatKpi, pct } from '@/components/ui-pieces';
import { downloadCsv, toCsv } from '@/lib/csv';

type ExitPerson = {
  id: number;
  full_name: string;
  employee_id: string | null;
  teachos_user_id: string | null;
  designation: string | null;
  department: string | null;
  dept_bucket: string | null;
  dept_area: string | null;
  institutes: string[];
  capability_manager: string | null;
  org_email: string | null;
  date_of_joining: string | null;
  // Darwinbox's own resignation-report fields, set automatically on every
  // Darwin sync -- present whenever exit_flag is true.
  exit_flag: boolean;
  exit_flag_status: string | null;
  exit_flag_date: string | null;
  // The manual fallback -- someone marked "exited" by hand (an uploaded
  // exits CSV, or a by-hand edit) for whoever Darwin hasn't reported yet.
  manual_status: string | null;
  exit_date: string | null;
  notes: string | null;
};

type ExitsReport = {
  count: number;
  darwin_flagged_count: number;
  manual_count: number;
  people: ExitPerson[];
};

const EXITS_QUERY_KEY = ['reports', 'exits'];

function useExitsReport() {
  return useQuery<ExitsReport>({
    queryKey: EXITS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/exits');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

// A row's exit came from one of two independent paths -- Darwin's own
// resignation record always wins when both are present, same "effective
// value" precedence used for gender/capability_manager/subject elsewhere
// in the app (see reports.ts's toApiExit).
function exitSource(person: ExitPerson): 'darwin' | 'manual' {
  return person.exit_flag ? 'darwin' : 'manual';
}

function exitStatusLabel(person: ExitPerson): string {
  if (person.exit_flag) return person.exit_flag_status || 'Exited';
  return 'Exited (manual)';
}

function exitDateOf(person: ExitPerson): string {
  return (person.exit_flag ? person.exit_flag_date : person.exit_date) ?? '';
}

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function downloadExitsCsv(people: ExitPerson[]) {
  const headers = ['Name', 'Employee ID', 'TeachOS User ID', 'Designation', 'Department', 'Subject', 'Campus', 'Capability Manager', 'Exit date', 'Status', 'Source', 'Notes'];
  const rows = people.map((person) => [
    person.full_name,
    person.employee_id ?? '',
    person.teachos_user_id ?? '',
    person.designation ?? '',
    person.department ?? '',
    person.dept_area ?? '',
    person.institutes?.join(', ') ?? '',
    person.capability_manager ?? '',
    exitDateOf(person),
    exitStatusLabel(person),
    exitSource(person) === 'darwin' ? 'Darwin sync' : 'Manual',
    person.notes ?? '',
  ]);
  downloadCsv('exits.csv', toCsv(headers, rows));
}

export default function ExitsPage() {
  const queryClient = useQueryClient();
  const exitsQuery = useExitsReport();
  const data = exitsQuery.data;
  const [search, setSearch] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: EXITS_QUERY_KEY });

  const people = useMemo(() => {
    const all = data?.people ?? [];
    const query = search.trim().toLowerCase();
    const filtered = query
      ? all.filter((person) => person.full_name.toLowerCase().includes(query) || (person.employee_id ?? '').toLowerCase().includes(query))
      : all;
    // Most recent exit first -- whichever date field is the effective one
    // for that row -- so a returning admin sees who just left at the top.
    return [...filtered].sort((a, b) => (exitDateOf(b) || '').localeCompare(exitDateOf(a) || ''));
  }, [data, search]);

  return <div className="mx-auto max-w-[1350px]">
    <PageIntro
      eyebrow="Darwinbox resignation reconciliation"
      title="Exits"
      description="Everyone currently flagged as exited -- either from Darwinbox's own resignation report (reconciled on every Darwin sync) or marked by hand for whoever Darwin hasn't reported yet. Spans every category, not just counted instructors."
      action={<button type="button" data-testid="button-refresh-exits" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {exitsQuery.isLoading && <div className="space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div><SkeletonBlock className="h-[420px]" /></div>}
    {exitsQuery.isError && <QueryError message="Exit data is unavailable right now." />}

    {data && <div className="space-y-5 animate-rise">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <TopStat label="Total exited" value={formatKpi(data.count)} meta="Across every category" icon={<UserX size={17} />} tone="navy" />
        <TopStat label="From Darwin sync" value={formatKpi(data.darwin_flagged_count)} meta={`${pct(data.darwin_flagged_count, data.count)} of exits`} icon={<LogOut size={17} />} tone="teal" />
        <TopStat label="Marked manually" value={formatKpi(data.manual_count)} meta={`${pct(data.manual_count, data.count)} -- Darwin hasn't reported these yet`} icon={<PenSquare size={17} />} tone="amber" alert />
      </section>

      <section className="rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative w-full sm:max-w-[280px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or employee ID" data-testid="input-search-exits" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12px] font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25" />
          </div>
          <DownloadCsvButton onClick={() => downloadExitsCsv(people)} disabled={people.length === 0} testId="button-download-exits-csv" />
        </div>

        {people.length === 0 ? <div className="p-5"><EmptyState title="No exits on file" description={search ? 'No one matches that search.' : "Nobody is currently flagged as exited, from Darwin's resignation report or a manual entry."} /></div> : <div className="overflow-x-auto">
          <div className="w-max min-w-full">
            <div className="grid grid-cols-[260px_160px_190px_190px_190px_150px_150px_130px] gap-4 border-b border-border bg-[#f4f7f9] px-5 py-3.5 text-left font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>Name</span>
              <span>Employee ID</span>
              <span>Designation</span>
              <span>Department</span>
              <span>Capability Manager</span>
              <span>Exit date</span>
              <span>Status</span>
              <span>Source</span>
            </div>
            <div>{people.map((person) => {
              const source = exitSource(person);
              return <div key={person.id} className="grid grid-cols-[260px_160px_190px_190px_190px_150px_150px_130px] items-center gap-4 border-b border-border/70 px-5 py-4 last:border-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f8ded7] text-[11px] font-extrabold text-[#a94334]">{initials(person.full_name)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-foreground">{person.full_name}</span>
                  </span>
                </div>
                <div className="truncate font-mono-ui text-[11px] text-muted-foreground">{person.employee_id || '—'}</div>
                <div className="truncate text-[12px] text-muted-foreground">{person.designation || '—'}</div>
                <div className="truncate text-[12px] text-muted-foreground">{person.department || '—'}</div>
                <div className="truncate text-[12px] text-muted-foreground">{person.capability_manager || '—'}</div>
                <div className="flex items-center gap-1.5 truncate font-mono-ui text-[11px] text-muted-foreground"><CalendarX size={12} className="shrink-0" />{exitDateOf(person) || '—'}</div>
                <div className="truncate text-[12px] text-muted-foreground">{exitStatusLabel(person)}</div>
                <div><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${source === 'darwin' ? 'bg-[#dff0eb] text-[#287469]' : 'bg-[#fff7db] text-[#8b6207]'}`}>{source === 'darwin' ? 'Darwin' : 'Manual'}</span></div>
              </div>;
            })}</div>
          </div>
        </div>}
      </section>
    </div>}
  </div>;
}
