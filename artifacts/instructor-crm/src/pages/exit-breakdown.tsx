// Exit Breakdown tab (2026-11-12, per request: "create an exit breakdown table"). Admin-only, like the Instructor Archive it reads.
// The month x breakdown table was removed (2026-11-12, per request); the page is the stats, scopes, filters and the People table.
// Who counts as an exit (2026-11-12, per request: "it should only have approved exit data"): everyone the Instructor Archive marks
// Exited whose Darwin exit is APPROVED -- pending / other exits are left out. Three scopes on top, all approved-only: All approved exits
// (instructors, mentors, Support, payroll) / Instructors & mentors (the Overview Exit data rule: not payroll, not Support) / Support. One table: rows = the chosen breakdown (Campus, Subject, Deployed vs Training, University payroll vs
// NxtWave), columns = month of the date of exit (Darwin's "Date Of Exit" or a date typed in FCC -- never the date the exit was raised;
// people without one are in the "No date of exit" column), plus a Total.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { PageIntro, QueryError, SkeletonBlock, TopStat, DownloadCsvButton, TableSearchInput, TablePager, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { MultiSelectFilter } from './instructors';
import { downloadCsv, toCsv } from '@/lib/csv';

type ArchivePerson = {
  id: number;
  employee_id: string | null;
  full_name: string;
  dept_area: string | null;
  classification: string | null;
  institutes: string[];
  capability_manager: string | null;
  is_payroll: boolean;
  date_of_exit: string | null;
  exit_status: string | null;
  status: 'Active' | 'Exited' | 'SNP';
  deployed_or_training?: string;
};

const SUPPORT_CLASSIFICATIONS = new Set(['excluded_ops_managers', 'instructor_ops']);
const isSupport = (p: ArchivePerson) => SUPPORT_CLASSIFICATIONS.has(p.classification ?? '');
const isApproved = (p: ArchivePerson) => (p.exit_status ?? '').trim().toLowerCase() === 'approved';

type ScopeKey = 'all' | 'approved' | 'support';
const SCOPES: { key: ScopeKey; label: string; note: string; test: (p: ArchivePerson) => boolean }[] = [
  { key: 'all', label: 'All approved exits', note: 'Every approved exit in the department: instructors, mentors, Support and payroll.', test: () => true },
  { key: 'approved', label: 'Instructors & mentors', note: 'Same people as the Overview Exit data: approved, not payroll, not Support.', test: (p) => !p.is_payroll && !isSupport(p) },
  { key: 'support', label: 'Support', note: 'Operations team (Support) approved exits only.', test: isSupport },
];

type DimKey = 'campus' | 'subject' | 'deployed' | 'payroll';
const DIMS: { key: DimKey; label: string; of: (p: ArchivePerson) => string }[] = [
  { key: 'campus', label: 'Campus', of: (p) => (p.institutes ?? []).find((i) => i && i.trim()) ?? 'No campus (not in TeachOS)' },
  { key: 'subject', label: 'Subject', of: (p) => (isSupport(p) ? 'Support' : p.dept_area || 'No subject') },
  { key: 'deployed', label: 'Deployed vs Training', of: (p) => (isSupport(p) ? 'Support' : p.deployed_or_training || 'Training') },
  { key: 'payroll', label: 'University payroll vs NxtWave', of: (p) => (p.is_payroll ? 'University payroll' : 'NxtWave') },
];

// Filters on the people table (2026-11-12, per request: "show them as a table like the Instructors tab, with multiple filters and a
// search"). The same filters also narrow the breakdown table above, so both always show the same people.
type FilterKey = 'month' | 'campus' | 'subject' | 'deployed' | 'payroll' | 'manager';
const FILTERS: { key: FilterKey; label: string; of: (p: ArchivePerson) => string }[] = [
  { key: 'month', label: 'Month', of: (p) => monthLabel(monthOf(p)) },
  { key: 'campus', label: 'Campus', of: (p) => DIMS[0].of(p) },
  { key: 'subject', label: 'Subject', of: (p) => DIMS[1].of(p) },
  { key: 'deployed', label: 'Deployed / Training', of: (p) => DIMS[2].of(p) },
  { key: 'payroll', label: 'Payroll / NxtWave', of: (p) => DIMS[3].of(p) },
  { key: 'manager', label: 'Capability Manager', of: (p) => p.capability_manager || 'No Capability Manager' },
];
const EMPTY_FILTERS: Record<FilterKey, string[]> = { month: [], campus: [], subject: [], deployed: [], payroll: [], manager: [] };

const NO_DATE = 'none';
const monthOf = (p: ArchivePerson) => (p.date_of_exit ? p.date_of_exit.slice(0, 7) : NO_DATE);
const monthLabel = (m: string) => (m === NO_DATE ? 'No date of exit' : new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }));

export default function ExitBreakdownPage() {
  const query = useQuery<{ people: ArchivePerson[] }>({
    queryKey: ['reports', 'instructor-archive'],
    queryFn: async () => {
      const response = await fetch('/api/reports/instructor-archive');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
  const [scope, setScope] = useState<ScopeKey>('all');
  const scopeDef = SCOPES.find((s) => s.key === scope)!;

  const exits = useMemo(() => (query.data?.people ?? []).filter((p) => p.status === 'Exited' && isApproved(p)), [query.data]); // approved exits only
  const scoped = useMemo(() => exits.filter(scopeDef.test), [exits, scopeDef]);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((p) => FILTERS.every((f) => filters[f.key].length === 0 || filters[f.key].includes(f.of(p)))
      && (!q || p.full_name.toLowerCase().includes(q) || (p.employee_id ?? '').toLowerCase().includes(q)));
  }, [scoped, filters, search]);
  // Option counts follow the other filters (not the filter's own selection), like the Instructors tab.
  const optionsFor = (key: FilterKey) => {
    const f = FILTERS.find((x) => x.key === key)!;
    const base = scoped.filter((p) => FILTERS.every((o) => o.key === key || filters[o.key].length === 0 || filters[o.key].includes(o.of(p))));
    const counts = new Map<string, number>();
    for (const p of base) counts.set(f.of(p), (counts.get(f.of(p)) ?? 0) + 1);
    for (const sel of filters[key]) if (!counts.has(sel)) counts.set(sel, 0);
    const entries = [...counts.entries()];
    if (key === 'month') {
      const order = (label: string) => scoped.find((p) => monthLabel(monthOf(p)) === label);
      entries.sort((a, b) => { const x = order(a[0]), y = order(b[0]); return (y ? monthOf(y) : '').localeCompare(x ? monthOf(x) : '') || a[0].localeCompare(b[0]); });
    } else entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return entries.map(([label, count]) => ({ key: label, label, count }));
  };
  const anyFilter = search.trim() !== '' || FILTERS.some((f) => filters[f.key].length > 0);
  const listRows = useMemo(() => [...people].sort((a, b) => (b.date_of_exit ?? '').localeCompare(a.date_of_exit ?? '') || a.full_name.localeCompare(b.full_name)), [people]);
  const pager = usePagedRows(listRows, 50);


  const download = () => {
    downloadCsv(`exit-breakdown-${scope}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(
      ['Name', 'Employee ID', 'Date of exit', 'Month', 'Campus', 'Subject', 'Deployed / Training', 'University payroll / NxtWave', 'Capability Manager'],
      listRows.map((p) => [
        p.full_name, p.employee_id ?? '', p.date_of_exit ?? '', monthLabel(monthOf(p)), DIMS[0].of(p), DIMS[1].of(p), DIMS[2].of(p), DIMS[3].of(p), p.capability_manager ?? '',
      ]),
    ));
  };

  const chip = (active: boolean) => `rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-secondary'}`;
  const payroll = people.filter((p) => p.is_payroll).length;

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="instructor_archive — approved exits, by month of exit"
      title="Exit Breakdown"
      description="Approved exits (Darwin exit status Approved) of the Instructor Department. Filter by month, campus, subject, deployed vs training, university payroll vs NxtWave or Capability Manager, or search by name. The date is the date of exit (Darwin's Date Of Exit, or a date typed in FCC) -- never the date the exit was raised."
      action={<DownloadCsvButton onClick={download} disabled={people.length === 0} label={`Download CSV (${people.length})`} testId="button-download-exit-breakdown" />}
    />
    {query.isLoading && <SkeletonBlock className="h-[420px]" />}
    {query.isError && <QueryError message="Exit Breakdown is unavailable right now." />}
    {query.data && <>
      <div className="mb-5 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        <TopStat label={scopeDef.label} value={formatKpi(people.length)} meta="Approved exits, in this view" icon={<LogOut size={16} />} tone="navy" />
        <TopStat label="NxtWave" value={formatKpi(people.length - payroll)} meta="Darwin employees" icon={<LogOut size={16} />} tone="teal" />
        <TopStat label="University payroll" value={formatKpi(payroll)} meta="Payroll converted" icon={<LogOut size={16} />} tone="amber" />
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {SCOPES.map((s) => <button key={s.key} type="button" data-testid={`button-exit-scope-${s.key}`} onClick={() => setScope(s.key)} className={chip(scope === s.key)}>{s.label}</button>)}
      </div>
      <p className="mb-4 text-[11px] text-muted-foreground">{scopeDef.note}</p>
      <div className="relative z-30 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-3">
        <TableSearchInput value={search} onChange={setSearch} testId="input-search-exit-breakdown" />
        {FILTERS.map((f) => <MultiSelectFilter key={f.key} label={f.label} options={optionsFor(f.key)} selected={filters[f.key]} onChange={(next) => { setFilters((cur) => ({ ...cur, [f.key]: next })); pager.setPage(1); }} testId={`filter-exit-${f.key}`} />)}
        {anyFilter && <button type="button" data-testid="button-clear-exit-filters" onClick={() => { setFilters(EMPTY_FILTERS); setSearch(''); }} className="text-[12px] font-bold text-primary underline-offset-2 hover:underline">Clear filters</button>}
      </div>
      <h2 className="mb-2 mt-2 text-[14px] font-extrabold tracking-[-0.02em]">People ({people.length.toLocaleString('en-IN')})</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1100px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left">
              {['Name', 'Employee ID', 'Date of exit', 'Campus', 'Subject', 'Deployed / Training', 'Payroll / NxtWave', 'Capability Manager'].map((h, i) =>
                <th key={h} className={`whitespace-nowrap px-3 py-2.5 font-extrabold ${i === 0 ? 'sticky left-0 z-10 bg-secondary' : ''}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No people match these filters.</td></tr>}
            {pager.pageRows.map((p) => <tr key={p.id} className="border-b border-border/60 hover:bg-secondary/40" data-testid={`row-exit-${p.id}`}>
              <td className="sticky left-0 z-10 bg-card px-3 py-2 font-semibold">{p.full_name}</td>
              <td className="px-3 py-2 font-mono-ui text-[11px]">{p.employee_id ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2">{p.date_of_exit ? new Date(`${p.date_of_exit}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-3 py-2">{DIMS[0].of(p)}</td>
              <td className="px-3 py-2">{DIMS[1].of(p)}</td>
              <td className="px-3 py-2">{DIMS[2].of(p)}</td>
              <td className="px-3 py-2">{DIMS[3].of(p)}</td>
              <td className="px-3 py-2">{p.capability_manager ?? <span className="text-muted-foreground">—</span>}</td>
            </tr>)}
          </tbody>
        </table>
        <TablePager page={pager.page} pageCount={pager.pageCount} pageSize={pager.pageSize} start={pager.start} end={pager.end} total={pager.total} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} />
      </div>
    </>}
  </div>;
}
