import { AlertTriangle, ArrowRight, Briefcase, Building2, Check, Clock, Copy, GraduationCap, LogOut, PieChart, RefreshCw, Trash2, UsersRound, X } from 'lucide-react';
import { Link } from 'wouter';
import { useMemo, useState } from 'react';
import { useGetReportsInstructors, getGetReportsInstructorsQueryKey, type AccessSplit, type InstructorSummary } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageIntro, QueryError, SkeletonBlock, DownloadCsvButton, TableSearchInput } from '@/components/ui-pieces';
import { downloadCsv, slugify, toCsv } from '@/lib/csv';
import { ALL_PRODUCTS, productLabel } from './instructors';

function formatKpi(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

type AccessCardKey = 'department' | 'instructors' | 'mentors' | 'ops_team';
type AccessTabKey = 'all' | 'both' | 'darwin_only' | 'teachos_only';

const ACCESS_CARD_LABELS: Record<AccessCardKey, string> = {
  department: 'Instructor Department',
  instructors: 'Instructors',
  mentors: 'Mentors',
  ops_team: 'Operations team',
};

// "All" (2026-09-07, per request) isn't one of the backend's three access
// buckets -- it's the union of all of them, computed client-side in
// AccessDrilldown below, since darwin_only/both/teachos_only are already
// mutually exclusive and safe to concatenate without dedup.
const ACCESS_TABS: { key: AccessTabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'both', label: 'Both' },
  { key: 'darwin_only', label: 'Only Darwin' },
  { key: 'teachos_only', label: 'Only TeachOS' },
];

// Same Both / Darwin only / TeachOS only order as ACCESS_TABS above, used
// for each KpiCard's own inline breakdown row (2026-09-07, per request --
// it previously listed Darwin only first, out of step with the tabs).
const CARD_BREAKDOWN_ORDER: { key: 'both' | 'darwin_only' | 'teachos_only'; label: string }[] = [
  { key: 'both', label: 'Both' },
  { key: 'darwin_only', label: 'Darwin only' },
  { key: 'teachos_only', label: 'TeachOS only' },
];

// The Overview tab is deliberately just these cards (2026-09-04, per
// request -- everything else that used to live here, the standing-rule
// banner, source-match table, classification/role-mix glance row, and the
// movement/sub-department charts, was removed): Instructors (matched with
// Darwin directly, plus confirmed payroll-converted), Mentors (Darwin's
// "Mentors" department), Operations team (Darwin's "Delivery Support (Ops
// and Central Managers)" department, individual Ops overrides included),
// plus a 4th "Instructor Department" card (2026-09-07) that rolls all three
// of those up into one total. Clicking a card opens an access drill-down
// below it: three buttons -- Only Darwin / Both / Only TeachOS -- each
// showing that bucket's actual people (see access_breakdown in reports.ts
// /reports/instructors; "department" there is the union of instructors +
// mentors + ops_team).
export default function DashboardPage() {
  const queryClient = useQueryClient();
  const reportQuery = useGetReportsInstructors();
  const report = reportQuery.data;
  const [activeAccessCard, setActiveAccessCard] = useState<AccessCardKey | null>(null);
  const [activeAccessTab, setActiveAccessTab] = useState<AccessTabKey>('both');
  // Exceptions on the Overview (2026-10-06, per request) -- two read-only
  // views of the same queue the Instructors tab's "Exception" tab shows
  // (access_breakdown.exception; see reports.ts's exceptionRows):
  //   Exception 1 ("review"): in the queue and NOT yet reviewed
  //     (exit_verification empty) -- tells Capability Managers there is
  //     something to act on; the acting itself still happens in the
  //     Instructors tab, not here.
  //   Exception 2 ("remove"): Instructors/Mentors a Capability Manager has
  //     marked Exited or Absconded who are STILL in TeachOS (both or
  //     teachos_only bucket) -- the list someone works through to remove
  //     them from TeachOS. A person leaves it by itself once they are gone
  //     from TeachOS, since the queue only holds people still present in
  //     Darwin or TeachOS and this view additionally needs TeachOS presence.
  const [activeException, setActiveException] = useState<'remove' | 'pending' | null>(null);
  const [removeInitialView, setRemoveInitialView] = useState<'exit' | 'notice' | 'archive'>('exit');
  const exceptionSplit = report?.access_breakdown?.exception;
  const reviewPeople = useMemo(() => [...(exceptionSplit?.darwin_only?.people ?? []), ...(exceptionSplit?.both?.people ?? []), ...(exceptionSplit?.teachos_only?.people ?? [])]
    .filter((p) => !p.exit_verification)
    .sort((a, b) => a.full_name.localeCompare(b.full_name)), [exceptionSplit]);
  // Exception 2 comes from its own backend list (access_breakdown.exception_remove)
  // because the Instructors tab's Exception view no longer contains people
  // reviewed as Exited/Absconded -- see exceptionRemoveRows in reports.ts.
  const removeSplit = (report?.access_breakdown as Record<string, AccessSplit | undefined> | undefined)?.exception_remove;
  const removePeople = useMemo(() => [...(removeSplit?.both?.people ?? []), ...(removeSplit?.teachos_only?.people ?? [])]
    .sort((a, b) => a.full_name.localeCompare(b.full_name)), [removeSplit]);
  // Serving notice period list (access_breakdown.exception_notice): reviewed as
  // Serving Notice Period and their Darwin Date Of Exit hasn't passed yet. The
  // day after that date they move to the Exit list above (see reports.ts).
  const noticeSplit = (report?.access_breakdown as Record<string, AccessSplit | undefined> | undefined)?.exception_notice;
  const noticePeople = useMemo(() => [...(noticeSplit?.darwin_only?.people ?? []), ...(noticeSplit?.both?.people ?? []), ...(noticeSplit?.teachos_only?.people ?? [])]
    .sort((a, b) => a.full_name.localeCompare(b.full_name)), [noticeSplit]);
  // Exception 3 (2026-10-08, per request): everyone whose exit approval is still pending -- the
  // HRBP's action list (access_breakdown.exception_pending; see pendingApprovalRows in reports.ts).
  const pendingSplit = (report?.access_breakdown as Record<string, AccessSplit | undefined> | undefined)?.exception_pending;
  const pendingPeople = useMemo(() => [...(pendingSplit?.darwin_only?.people ?? []), ...(pendingSplit?.both?.people ?? []), ...(pendingSplit?.teachos_only?.people ?? [])]
    .sort((a, b) => a.full_name.localeCompare(b.full_name)), [pendingSplit]);
  // Everyone counted in the Instructors card (all three access buckets, each person once) -- the population the
  // Top 10 campuses and Capability Managers cards below are built from (2026-10-08, per request).
  const instructorSplit = report?.access_breakdown?.instructors;
  const instructorPeople = useMemo(() => {
    const seen = new Set<number>();
    return [...(instructorSplit?.both?.people ?? []), ...(instructorSplit?.darwin_only?.people ?? []), ...(instructorSplit?.teachos_only?.people ?? [])]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [instructorSplit]);
  // Whole Instructor Department (instructors + mentors + Operations team), each person once -- the population
  // the Product pie chart splits (Operations team rows are the Support product).
  const departmentSplit = report?.access_breakdown?.department;
  const departmentPeople = useMemo(() => {
    const seen = new Set<number>();
    return [...(departmentSplit?.both?.people ?? []), ...(departmentSplit?.darwin_only?.people ?? []), ...(departmentSplit?.teachos_only?.people ?? [])]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [departmentSplit]);
  const toggleAccessCard = (card: AccessCardKey) => {
    if (activeAccessCard === card) {
      setActiveAccessCard(null);
    } else {
      setActiveAccessCard(card);
      setActiveAccessTab('both');
    }
  };

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="Command center / 09:42 IST"
      title="Faculty Command Center (FCC)"
      description="Instructor Department, Instructors, Mentors, and Operations team -- each broken down by which system actually has access: Darwin only, TeachOS only, or both."
      action={<button type="button" data-testid="button-refresh-dashboard" onClick={() => queryClient.invalidateQueries({ queryKey: getGetReportsInstructorsQueryKey() })} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh data</button>}
    />

    {report && <section aria-label="Exceptions" data-testid="banner-exceptions" className="mb-4 grid grid-cols-1 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card animate-rise sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <ExceptionSegment label="Exception 1" title="Needs review" meta="Exit record not reviewed yet — Capability Managers" count={reviewPeople.length} icon={<AlertTriangle size={16} />} href="/instructors?category=exception" testId="exception-1" />
      <ExceptionSegment label="Exception 2" title="Remove TeachOS access" meta={`Exit list · ${noticePeople.length} serving notice`} count={removePeople.length} icon={<Trash2 size={16} />} active={activeException === 'remove'} onClick={() => { setRemoveInitialView('exit'); setActiveException(activeException === 'remove' ? null : 'remove'); }} testId="exception-2" />
      <ExceptionSegment label="Exception 3" title="Approval pending" meta="Exit approval pending — HRBP action" count={pendingPeople.length} icon={<Clock size={16} />} active={activeException === 'pending'} onClick={() => setActiveException(activeException === 'pending' ? null : 'pending')} testId="exception-3" />
    </section>}
    {report && activeException === 'pending' && <ExceptionPendingPanel people={pendingPeople} onClose={() => setActiveException(null)} />}
    {report && activeException === 'remove' && <ExceptionRemovePanel key={removeInitialView} initialView={removeInitialView} exitPeople={removePeople} noticePeople={noticePeople} onClose={() => setActiveException(null)} />}

    {reportQuery.isLoading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div>}
    {reportQuery.isError && <QueryError message="Dashboard data is unavailable right now." />}
    {report && <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-rise">
      <KpiCard label="Instructor Department" value={formatKpi(report.kpis.department_total_count)} meta="Instructors + Mentors + Ops team" icon={<Building2 size={17} />} tone="saffron" breakdown={report.access_breakdown?.department} active={activeAccessCard === 'department'} onClick={() => toggleAccessCard('department')} />
      <KpiCard label="Instructors" value={formatKpi(report.kpis.total_instructor_count)} meta="Matched with Darwin + payroll" icon={<UsersRound size={17} />} tone="navy" breakdown={report.access_breakdown?.instructors} active={activeAccessCard === 'instructors'} onClick={() => toggleAccessCard('instructors')} />
      <KpiCard label="Mentors" value={formatKpi(report.kpis.mentors_count)} meta="Darwin — Mentors department" icon={<GraduationCap size={17} />} tone="teal" breakdown={report.access_breakdown?.mentors} active={activeAccessCard === 'mentors'} onClick={() => toggleAccessCard('mentors')} />
      <KpiCard label="Operations team" value={formatKpi(report.kpis.ops_team_count)} meta="Darwin — Delivery Support (Ops)" icon={<Briefcase size={17} />} tone="coral" breakdown={report.access_breakdown?.ops_team} active={activeAccessCard === 'ops_team'} onClick={() => toggleAccessCard('ops_team')} />
    </section>}


    {report && <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 animate-rise" aria-label="Product mix, NIAT contribution, campuses and capability managers">
      <ProductMixCard people={departmentPeople} />
      <NiatContributionCard people={departmentPeople} />
      <TopCampusesCard people={instructorPeople} />
      <CapabilityManagersCard people={instructorPeople} />
    </section>}
    {report && <ExitedCard pendingPeople={pendingPeople} onViewApproved={() => { setRemoveInitialView('archive'); setActiveException('remove'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onViewPending={() => { setActiveException('pending'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}

    {report && activeAccessCard && <AccessDrilldown
      label={ACCESS_CARD_LABELS[activeAccessCard]}
      category={activeAccessCard}
      split={report.access_breakdown?.[activeAccessCard]}
      tab={activeAccessTab}
      onTabChange={setActiveAccessTab}
      onClose={() => setActiveAccessCard(null)}
    />}
  </div>;
}

// One third of the red Exceptions bar at the top of the Overview (2026-10-08, per request). Exception 1
// jumps straight to the Instructors tab's Exception list; 2 and 3 open their list below the bar.
function ExceptionSegment({ label, title, meta, count, icon, href, active = false, onClick, testId }: {
  label: string;
  title: string;
  meta: string;
  count: number;
  icon: React.ReactNode;
  href?: string;
  active?: boolean;
  onClick?: () => void;
  testId: string;
}) {
  // Coral while there is something to act on, teal when the count is 0 (2026-10-08, per request). Both tones are the
  // ones the Operations team / Mentors cards already use, so the bar sits in the page's own palette.
  const clear = count === 0;
  const body = <>
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${clear ? 'bg-[#c3e0d7]' : 'bg-[#ebc9bd]'}`}>{clear ? <Check size={16} /> : icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-mono-ui text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[22px] font-extrabold leading-tight tracking-[-0.03em]">{count.toLocaleString('en-IN')}</span>
        <span className="truncate text-[13px] font-bold">{title}</span>
      </span>
      <span className="block truncate text-[11px] opacity-80">{meta}</span>
    </span>
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold">Check <ArrowRight size={14} /></span>
  </>;
  const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${clear
    ? `text-[#256e65] hover:bg-[#d2e8e1] ${active ? 'bg-[#d2e8e1]' : 'bg-[#dff0eb]'}`
    : `text-[#9b4434] hover:bg-[#f0d6cd] ${active ? 'bg-[#f0d6cd]' : 'bg-[#f6e4de]'}`}`;
  if (href) return <Link href={href} data-testid={`link-${testId}`} className={cls}>{body}</Link>;
  return <button type="button" data-testid={`button-${testId}`} onClick={onClick} aria-pressed={active} className={cls}>{body}</button>;
}

// Exception 3: exit approval still pending. Read-only worklist for the HRBP.
function ExceptionPendingPanel({ people, onClose }: { people: InstructorSummary[]; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => people.filter((p) => matchesSearch(p, search)), [people, search]);
  const handleDownload = () => downloadCsv('exception-3-exit-approval-pending.csv', toCsv(['Name', 'Employee ID', 'Subject', 'Capability Manager', 'Manager (Darwin)', 'Payroll / Nxtwave', 'exit_status', 'exit_date', 'date_of_exit'], filtered.map((p) => [p.full_name, p.employee_id ?? '', p.dept_area ?? '', p.capability_manager ?? '', p.darwin_manager ?? '', payrollLabel(p), p.exit_flag_status ?? '', p.exit_flag_date ?? '', p.date_of_exit ?? ''])));
  return <section className="mb-4 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6 animate-rise">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Exception 3 — for the HRBP</p>
        <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Exit approval pending</h2>
        <p className="mt-1 max-w-[640px] text-[12px] text-muted-foreground">These people have raised an exit request that is still Pending With Approver in Darwinbox. Each one needs an approval decision. They leave this list once Darwinbox shows the decision.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {people.length > 0 && <TableSearchInput value={search} onChange={setSearch} placeholder="Search name or employee ID..." testId="input-search-exception-pending" />}
        <DownloadCsvButton onClick={handleDownload} disabled={filtered.length === 0} testId="button-download-exception-pending" />
        <button type="button" data-testid="button-close-exception-pending" onClick={onClose} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <X size={13} /> Close
        </button>
      </div>
    </div>
    <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Employee ID</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Capability Manager</th><th className="px-3 py-2">Manager (Darwin)</th><th className="px-3 py-2">Payroll / Nxtwave</th><th className="px-3 py-2">exit_status</th><th className="px-3 py-2">exit_date</th><th className="px-3 py-2">date_of_exit</th></tr>
        </thead>
        <tbody>
          {filtered.map((p) => <tr key={p.id} className="border-t border-border/70">
            <td className="px-3 py-2 font-semibold">{p.full_name}</td>
            <td className="px-3 py-2 font-mono-ui text-muted-foreground">{p.employee_id ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.dept_area ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.capability_manager ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.darwin_manager ?? '—'}</td>
            <td className="px-3 py-2"><PayrollBadge person={p} /></td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.exit_flag_status || '—'}</td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatExitDate(p.exit_flag_date)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatExitDate(p.date_of_exit)}</td>
          </tr>)}
          {filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{people.length === 0 ? 'No exit approvals are pending.' : 'No one matches this search.'}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

// Product bifurcation (2026-10-09, per request): a donut ("pie") chart of the Instructor Department by Product --
// the same productLabel() the Instructors tab's Product column and filter use, so the slices match it exactly.
const PRODUCT_COLORS: Record<string, string> = {
  'NIAT (Deployed)': '#27415f',
  'NIAT (Training)': '#4f86b8',
  Academy: '#e0a030',
  Intensive: '#2e8b7a',
  'IIT X DSA': '#c75b3f',
  Support: '#8a93a6',
};
function ProductMixCard({ people }: { people: InstructorSummary[] }) {
  const slices = useMemo(() => {
    const counts = new Map<string, number>(ALL_PRODUCTS.map((name) => [name, 0]));
    for (const person of people) {
      const label = productLabel(person);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [people]);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const [hover, setHover] = useState<string | null>(null);
  // Donut drawn as stacked circle strokes: with r = 100 / (2 * pi) the circumference is exactly 100,
  // so a slice's dash length is simply its percentage.
  const RADIUS = 100 / (2 * Math.PI);
  let offset = 25; // start at 12 o'clock
  const arcs = slices.filter((slice) => slice.count > 0).map((slice) => {
    const pct = total ? (slice.count / total) * 100 : 0;
    const arc = { ...slice, pct, dashOffset: offset };
    offset -= pct;
    return arc;
  });
  const active = hover ? slices.find((slice) => slice.name === hover) : null;
  return <div data-testid="card-product-mix" className="rounded-xl border border-border bg-card p-5 shadow-xs">
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-muted-foreground"><PieChart size={17} /></span>
      <div>
        <h2 className="text-[16px] font-extrabold tracking-[-0.03em]">Product mix</h2>
        <p className="text-[11px] text-muted-foreground">Instructor Department by Product</p>
      </div>
    </div>
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center xl:flex-col">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-0" role="img" aria-label="Instructor Department split by Product">
          <circle cx="21" cy="21" r={RADIUS} fill="none" strokeWidth="6" className="stroke-secondary" />
          {arcs.map((arc) => <circle key={arc.name} cx="21" cy="21" r={RADIUS} fill="none" strokeWidth={hover === arc.name ? 7 : 6} stroke={PRODUCT_COLORS[arc.name] ?? '#8a93a6'} strokeDasharray={`${Math.max(arc.pct - 0.4, 0)} ${100 - Math.max(arc.pct - 0.4, 0)}`} strokeDashoffset={arc.dashOffset} onMouseEnter={() => setHover(arc.name)} onMouseLeave={() => setHover(null)} data-testid={`slice-product-${slugify(arc.name)}`}><title>{`${arc.name}: ${arc.count} (${arc.pct.toFixed(1)}%)`}</title></circle>)}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[24px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{(active ? active.count : total).toLocaleString('en-IN')}</div>
            <div className="mt-1 max-w-[88px] text-[10px] leading-tight text-muted-foreground">{active ? active.name : 'in the department'}</div>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {slices.map((slice) => <li key={slice.name} onMouseEnter={() => setHover(slice.name)} onMouseLeave={() => setHover(null)} data-testid={`row-product-${slugify(slice.name)}`} className={`flex items-center gap-2.5 rounded-md px-2 py-1 transition-colors ${hover === slice.name ? 'bg-secondary' : ''}`}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PRODUCT_COLORS[slice.name] ?? '#8a93a6' }} />
          <span className="min-w-0 flex-1 truncate text-[13px]">{slice.name}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{total ? ((slice.count / total) * 100).toFixed(1) : '0.0'}%</span>
          <span className="w-10 text-right text-[13px] font-extrabold tabular-nums">{slice.count.toLocaleString('en-IN')}</span>
        </li>)}
      </ul>
    </div>
  </div>;
}

// Contribution of NIAT instructors (2026-10-09, per request: "beside the pie chart ... contribution of niat
// instructors"): how many NIAT instructors (Product NIAT Deployed or Training) are teaching each NIAT cohort. The
// cohort comes from the Contribution column (person.niat_cohorts: the cohort(s) of the batches they taught in the
// last 30 days, or the last 2 months when they had no session in the last 30 days, see instructorContribution.ts), so one instructor teaching two cohorts counts in both rows.
const NIAT_COHORT_ORDER = ['NIAT 2024', 'NIAT 2025', 'NIAT 2026'];
function NiatContributionCard({ people }: { people: InstructorSummary[] }) {
  const { rows, total } = useMemo(() => {
    const niat = people.filter((p) => productLabel(p).startsWith('NIAT'));
    const counts = new Map<string, number>(NIAT_COHORT_ORDER.map((name) => [name, 0]));
    for (const person of niat) {
      const cohorts = person.niat_cohorts ?? [];
      for (const cohort of cohorts) counts.set(cohort, (counts.get(cohort) ?? 0) + 1);
    }
    const ordered = [...counts.entries()].sort((a, b) => {
      const ia = NIAT_COHORT_ORDER.indexOf(a[0]);
      const ib = NIAT_COHORT_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a[0].localeCompare(b[0]);
    });
    return { rows: ordered, total: niat.length };
  }, [people]);
  const max = Math.max(1, ...rows.map(([, count]) => count));
  const bar = (count: number, color: string) => <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.max(count > 0 ? 2 : 0, (count / max) * 100)}%`, backgroundColor: color }} /></div>;
  return <div data-testid="card-niat-contribution" className="rounded-xl border border-border bg-card p-5 shadow-xs">
    <div className="mb-5 flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-muted-foreground"><GraduationCap size={17} /></span>
      <div>
        <h2 className="text-[16px] font-extrabold tracking-[-0.03em]">Contribution of NIAT instructors</h2>
        <p className="text-[11px] text-muted-foreground">Instructors teaching each NIAT cohort · last 30 days (last 2 months if none)</p>
      </div>
    </div>
    <div className="mb-5 flex items-baseline gap-2">
      <span className="text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums" data-testid="text-niat-instructor-total">{total.toLocaleString('en-IN')}</span>
      <span className="text-[12px] text-muted-foreground">NIAT instructors (Deployed + Training)</span>
    </div>
    <ul className="space-y-3.5">
      {rows.map(([cohort, count]) => <li key={cohort} data-testid={`row-niat-cohort-${slugify(cohort)}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px]">{cohort}</span>
          <span className="text-[14px] font-extrabold tabular-nums">{count.toLocaleString('en-IN')}</span>
        </div>
        {bar(count, '#4f86b8')}
      </li>)}
    </ul>
    <p className="mt-4 text-[11px] text-muted-foreground">An instructor teaching more than one cohort is counted in each.</p>
  </div>;
}

// Top 10 campuses (2026-10-08, per request): campus name + instructor head-count only -- the people themselves
// are in the Instructors tab. Training Institute is always pinned first and is counted by PRODUCT, not by the raw
// campus text: only people whose Product is "NIAT (Training)" are in it, so the Support (Operations) team, IIT X DSA
// and Academy people never inflate it even when their campus is blank. Every other campus is counted from the
// person's campus names (a person teaching at several campuses counts at each); Support people are left out.
const TRAINING_CAMPUS = 'Training Institute';
function RankedBarList({ rows, color, testPrefix }: { rows: [string, number][]; color: string; testPrefix: string }) {
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return <ol className="space-y-3.5">
    {rows.map(([name, count], index) => <li key={name} data-testid={`row-${testPrefix}-${slugify(name)}`} className="flex items-start gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary font-mono-ui text-[11px] font-bold text-muted-foreground">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[15px] text-foreground">{name}</span>
          <span className="shrink-0 text-[14px] font-extrabold tabular-nums">{count.toLocaleString('en-IN')}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (count / max) * 100)}%`, backgroundColor: color }} /></div>
      </div>
    </li>)}
  </ol>;
}

function TopCampusesCard({ people }: { people: InstructorSummary[] }) {
  const campuses = useMemo(() => {
    const counts = new Map<string, number>();
    const add = (campus: string) => counts.set(campus, (counts.get(campus) ?? 0) + 1);
    for (const person of people) {
      const product = productLabel(person);
      if (product === 'Support') continue;
      if (product === 'NIAT (Training)') add(TRAINING_CAMPUS);
      const names = new Set((person.institutes ?? []).map((name) => name.trim()).filter((name) => name && name !== TRAINING_CAMPUS));
      names.forEach(add);
    }
    const training = counts.get(TRAINING_CAMPUS) ?? 0;
    counts.delete(TRAINING_CAMPUS);
    const rest = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 9);
    return [[TRAINING_CAMPUS, training] as [string, number], ...rest];
  }, [people]);
  return <div data-testid="card-top-campuses" className="rounded-xl border border-border bg-card p-5 shadow-xs">
    <div className="mb-5 flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-muted-foreground"><Building2 size={17} /></span>
      <div>
        <h2 className="text-[16px] font-extrabold tracking-[-0.03em]">Top campuses</h2>
        <p className="text-[11px] text-muted-foreground">By headcount</p>
      </div>
    </div>
    <RankedBarList rows={campuses} color="#f26419" testPrefix="campus" />
  </div>;
}

// Capability Manager workload (2026-10-08, per request): each Capability Manager and how many instructors they
// handle -- names of the instructors are in the Instructors tab, not here. People with no Capability Manager are
// simply left out of this list (2026-10-08, per request).
function CapabilityManagersCard({ people }: { people: InstructorSummary[] }) {
  const managers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people) {
      const key = person.capability_manager?.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [people]);
  return <div data-testid="card-capability-managers" className="rounded-xl border border-border bg-card p-5 shadow-xs">
    <div className="mb-5 flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-muted-foreground"><UsersRound size={17} /></span>
      <div>
        <h2 className="text-[16px] font-extrabold tracking-[-0.03em]">Manager workload</h2>
        <p className="text-[11px] text-muted-foreground">Instructors per Capability Manager</p>
      </div>
    </div>
    <div className="max-h-[520px] overflow-auto pr-1"><RankedBarList rows={managers} color="#12b5cb" testPrefix="capability-manager" /></div>
  </div>;
}

// Exit data on the Overview (2026-10-08, per request): two lists side by side --
//   Approved: the approved exits recorded in the Instructor Archive (status Exited, exit record Approved).
//   Pending approval: exit requests still Pending With Approver (the same people as Exception 3).
// Each shows its total and the most recent few; "View all" opens the full list (Exception 2's "Exited (archive)"
// view, and Exception 3's panel).
function ExitedCard({ pendingPeople, onViewApproved, onViewPending }: { pendingPeople: InstructorSummary[]; onViewApproved: () => void; onViewPending: () => void }) {
  const archiveQuery = useQuery<{ people: ArchiveExitRow[] }>({
    queryKey: ['reports', 'instructor-archive'],
    queryFn: async () => {
      const response = await fetch('/api/reports/instructor-archive');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
  const approved = useMemo(() => (archiveQuery.data?.people ?? [])
    .filter(isApprovedExit)
    .sort((a, b) => (b.date_of_exit ?? '').localeCompare(a.date_of_exit ?? '') || a.full_name.localeCompare(b.full_name))
    .map((row) => ({ key: `a${row.id}`, name: row.full_name, date: row.date_of_exit })), [archiveQuery.data]);
  const pending = useMemo(() => [...pendingPeople]
    .sort((a, b) => (b.exit_flag_date ?? '').localeCompare(a.exit_flag_date ?? '') || a.full_name.localeCompare(b.full_name))
    .map((p) => ({ key: `p${p.id}`, name: p.full_name, date: p.date_of_exit ?? p.exit_flag_date ?? null })), [pendingPeople]);
  const column = (testId: string, title: string, subtitle: string, rows: { key: string; name: string; date: string | null }[], loading: boolean, onViewAll: () => void, empty: string) => <div data-testid={testId} className="min-w-0">
    <div className="mb-2 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-[14px] font-extrabold tracking-[-0.02em]">{title}</h3>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[24px] font-extrabold leading-none tracking-[-0.03em] tabular-nums" data-testid={`${testId}-count`}>{loading ? '…' : rows.length.toLocaleString('en-IN')}</span>
        <button type="button" onClick={onViewAll} data-testid={`${testId}-view-all`} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary">View all <ArrowRight size={13} /></button>
      </div>
    </div>
    <ul>
      {rows.slice(0, 8).map((row) => <li key={row.key} className="flex items-center justify-between gap-3 border-b border-border/60 py-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{row.name}</span>
        <span className="shrink-0 text-[12px] text-muted-foreground">{formatExitDate(row.date)}</span>
      </li>)}
      {!loading && rows.length === 0 && <li className="py-6 text-center text-[12px] text-muted-foreground">{empty}</li>}
    </ul>
  </div>;
  return <section data-testid="card-exited" className="mt-4 rounded-xl border border-border bg-card p-5 shadow-xs animate-rise">
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-muted-foreground"><LogOut size={17} /></span>
      <div>
        <h2 className="text-[16px] font-extrabold tracking-[-0.03em]">Exit data</h2>
        <p className="text-[11px] text-muted-foreground">Approved exits and exits waiting for approval</p>
      </div>
    </div>
    {archiveQuery.isError && <p className="mb-3 text-[12px] text-muted-foreground">The archive is unavailable right now, so approved exits cannot be shown.</p>}
    <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
      {column('exit-approved', 'Approved', 'Instructor Archive · exit date', approved, archiveQuery.isLoading, onViewApproved, 'No approved exits in the archive yet.')}
      {column('exit-pending', 'Pending approval', 'Waiting on the approver · date of exit', pending, false, onViewPending, 'No exit approvals are pending.')}
    </div>
  </section>;
}

function KpiCard({ label, value, meta, icon, tone, alert = false, breakdown, active = false, onClick }: {
  label: string;
  value: string;
  meta: string;
  icon: React.ReactNode;
  tone: 'navy' | 'teal' | 'saffron' | 'coral';
  alert?: boolean;
  breakdown?: AccessSplit;
  active?: boolean;
  onClick?: () => void;
}) {
  const tones = { navy: 'bg-primary text-primary-foreground', teal: 'bg-[#dff0eb] text-[#256e65]', saffron: 'bg-accent text-accent-foreground', coral: 'bg-[#f6e4de] text-[#9b4434]' };
  const onNavy = tone === 'navy';
  return <button
    type="button"
    data-testid={`button-kpi-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    onClick={onClick}
    aria-pressed={active}
    className={`relative w-full overflow-hidden rounded-xl border p-4 text-left shadow-xs transition-transform hover:-translate-y-0.5 sm:p-5 ${onNavy ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'} ${active ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
  >
    <div className="flex items-start justify-between">
      <p className={`text-[11px] font-bold ${onNavy ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{label}</p>
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span>
    </div>
    <p className="mt-5 text-[27px] font-extrabold tracking-[-0.06em]">{value}</p>
    <p className={`mt-1 font-mono-ui text-[10px] uppercase tracking-[0.1em] ${onNavy ? 'text-primary-foreground/55' : alert ? 'text-[#a36b00]' : 'text-muted-foreground'}`}>{meta}</p>
    {breakdown && <div className={`mt-4 grid grid-cols-3 gap-2 border-t pt-3 ${onNavy ? 'border-primary-foreground/15' : 'border-border/70'}`}>
      {CARD_BREAKDOWN_ORDER.map((t) => <div key={t.key} className="flex flex-col">
        {/* min-h + leading here is what keeps the number below lined up across
            all three columns (2026-09-07, per request) -- "Both" is short
            enough to never wrap, but "Darwin only" / "TeachOS only" can, on
            a narrow card, sit on two lines and would otherwise push their
            own number down while "Both"'s stayed put a line higher. */}
        <p className={`min-h-[23px] font-mono-ui text-[9px] leading-[1.3] uppercase tracking-[0.07em] ${onNavy ? 'text-primary-foreground/55' : 'text-muted-foreground'}`}>{t.label}</p>
        <p className="mt-1 text-[15px] font-bold tracking-[-0.02em]">{formatKpi(breakdown[t.key]?.count)}</p>
      </div>)}
    </div>}
    <p className={`mt-3 text-[10px] font-bold uppercase tracking-[0.08em] ${onNavy ? 'text-primary-foreground/70' : 'text-primary'}`}>{active ? 'Hide people list ▲' : 'View people list ▼'}</p>
  </button>;
}

function AccessDrilldown({ label, category, split, tab, onTabChange, onClose }: {
  label: string;
  category: AccessCardKey;
  split?: AccessSplit;
  tab: AccessTabKey;
  onTabChange: (tab: AccessTabKey) => void;
  onClose: () => void;
}) {
  // "All" (2026-09-07, per request) is the union of the three real buckets
  // -- darwin_only/both/teachos_only are mutually exclusive by construction
  // (see reports.ts's buildAccessSplit), so a plain concatenation is safe,
  // no id-dedup needed. Sorted by name since it's assembled from three
  // separately-ordered lists.
  const people: InstructorSummary[] = tab === 'all'
    ? [...(split?.darwin_only?.people ?? []), ...(split?.both?.people ?? []), ...(split?.teachos_only?.people ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name))
    : (split?.[tab]?.people ?? []);
  const tabCount = (key: AccessTabKey) => key === 'all'
    ? (split?.darwin_only?.count ?? 0) + (split?.both?.count ?? 0) + (split?.teachos_only?.count ?? 0)
    : split?.[key]?.count;
  // Search box (2026-09-24, per request: "where ever there are tables in
  // the application add search option to search for any person") -- matches
  // name or employee ID, same fields the Instructors tab's own search
  // already checks. Filters both what renders below AND what "Download CSV"
  // exports (same precedent as instructors.tsx's own search).
  const [search, setSearch] = useState('');
  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return people;
    return people.filter((p) => p.full_name.toLowerCase().includes(query) || (p.employee_id ?? '').toLowerCase().includes(query));
  }, [people, search]);
  // Designation (Darwin's "Designation" column, see reports.ts's
  // toApiInstructorSummary) used to be surfaced only for the Operations
  // team drill-down (2026-09-07). Now shown for every category (2026-09-09,
  // per request) -- kept as its own flag rather than inlined everywhere
  // below since the column is conditionally rendered in several places
  // (header, row, CSV headers, empty-state colSpan).
  const showDesignation = true;
  // Operations team shows a single "Department" column instead of a
  // "Subject" one -- ops roles aren't a teaching "subject" the way
  // instructor/mentor rows are (2026-09-09, per request). Every other
  // category now shows BOTH: Subject (dept_area, the derived teaching-area
  // taxonomy) and Department (Darwin's raw department field) as two
  // separate columns, mirroring instructors.tsx's own Subject/Department
  // split (2026-09-09, per follow-up request).
  const showDepartmentColumn = category !== 'ops_team';
  // Every card now shows two explicit manager columns instead of one
  // ambiguous "Manager" column that used to silently fall back between
  // the two (2026-09-07, per request; extended to Department, then to
  // Operations team and the underlying `manager` field removed entirely
  // 2026-09-08, per follow-up request): Capability Manager (TeachOS's own
  // instructor_manager assignment, strict -- no Darwin fallback) and
  // Manager (Darwin) (Darwin's own Direct Manager field, equally strict --
  // no TeachOS fallback). See capability_manager / darwin_manager in
  // reports.ts -- the old combined `manager` field no longer exists on
  // InstructorSummary at all.
  const handleDownload = () => {
    const headers = ['Name', ...(showDesignation ? ['Designation'] : []), 'Employee ID', category === 'ops_team' ? 'Department' : 'Subject', ...(showDepartmentColumn ? ['Department'] : []), 'Campus', 'Capability Manager', 'Manager (Darwin)'];
    const rows = filteredPeople.map((p) => [
      p.full_name,
      ...(showDesignation ? [p.designation ?? ''] : []),
      p.employee_id ?? '',
      category === 'ops_team' ? (p.department ?? '') : (p.dept_area ?? ''),
      ...(showDepartmentColumn ? [p.department ?? ''] : []),
      p.institutes?.join(', ') ?? '',
      p.capability_manager ?? '',
      p.darwin_manager ?? '',
    ]);
    downloadCsv(`${slugify(label)}-${tab.replaceAll('_', '-')}.csv`, toCsv(headers, rows));
  };

  return <section className="mt-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6 animate-rise">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">{label} — by data source</p>
        <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Who has access where</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {people.length > 0 && <TableSearchInput value={search} onChange={setSearch} testId="input-search-access-drilldown" />}
        <DownloadCsvButton onClick={handleDownload} disabled={filteredPeople.length === 0} testId="button-download-access-drilldown" />
        <button type="button" data-testid="button-close-access-drilldown" onClick={onClose} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <X size={13} /> Close
        </button>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      {ACCESS_TABS.map((t) => {
        const isActive = tab === t.key;
        return <button
          key={t.key}
          type="button"
          data-testid={`button-access-tab-${t.key}`}
          onClick={() => onTabChange(t.key)}
          className={`rounded-lg border px-3.5 py-2 text-[12px] font-bold transition-colors ${isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary text-foreground hover:bg-border/50'}`}
        >
          {t.label} <span className="ml-1 font-mono-ui opacity-75">{formatKpi(tabCount(t.key))}</span>
        </button>;
      })}
    </div>
    <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Name</th>
            {showDesignation && <th className="px-3 py-2">Designation</th>}
            <th className="px-3 py-2">Employee ID</th>
            <th className="px-3 py-2">{category === 'ops_team' ? 'Department' : 'Subject'}</th>
            {showDepartmentColumn && <th className="px-3 py-2">Department</th>}
            <th className="px-3 py-2">Campus</th>
            <th className="px-3 py-2">Capability Manager</th>
            <th className="px-3 py-2">Manager (Darwin)</th>
          </tr>
        </thead>
        <tbody>
          {filteredPeople.map((p) => <tr key={p.id} className="border-t border-border/70">
            <td className="px-3 py-2 font-semibold">{p.full_name}</td>
            {showDesignation && <td className="px-3 py-2 text-muted-foreground">{p.designation ?? '—'}</td>}
            <td className="px-3 py-2 font-mono-ui text-muted-foreground">{p.employee_id ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{category === 'ops_team' ? (p.department ?? '—') : (p.dept_area ?? '—')}</td>
            {showDepartmentColumn && <td className="px-3 py-2 text-muted-foreground">{p.department ?? '—'}</td>}
            <td className="px-3 py-2 text-muted-foreground">{p.institutes?.join(', ') || '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.capability_manager ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.darwin_manager ?? '—'}</td>
          </tr>)}
          {filteredPeople.length === 0 && <tr><td colSpan={6 + (showDesignation ? 1 : 0) + (showDepartmentColumn ? 1 : 0)} className="px-3 py-8 text-center text-muted-foreground">{people.length === 0 ? 'No one in this bucket.' : 'No one matches this search.'}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}


// Copy-to-clipboard helpers for Exception 2 (2026-10-06, per request: the
// user ID and Capability Manager details "should be shown in copyable state
// so they can copy the user_id and remove their details" from TeachOS).
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyValue({ value, mono = false, testId }: { value: string | null | undefined; mono?: boolean; testId: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  const onCopy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };
  return <span className="inline-flex items-center gap-1.5">
    <span className={mono ? 'font-mono-ui' : ''}>{value}</span>
    <button type="button" onClick={onCopy} data-testid={testId} aria-label={`Copy ${value}`} title={copied ? 'Copied' : 'Copy'} className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
      {copied ? <Check size={11} className="text-[#256e65]" /> : <Copy size={11} />}
    </button>
  </span>;
}

function matchesSearch(p: { full_name: string; employee_id?: string | null; teachos_user_id?: string | null }, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return p.full_name.toLowerCase().includes(q) || (p.employee_id ?? '').toLowerCase().includes(q) || (p.teachos_user_id ?? '').toLowerCase().includes(q);
}

// Payroll / Nxtwave bifurcation (2026-10-07, per request) for the Exception lists.
const payrollLabel = (p: { is_payroll?: boolean | null }) => (p.is_payroll ? 'Payroll' : 'Nxtwave');
function PayrollBadge({ person }: { person: { is_payroll?: boolean | null } }) {
  return person.is_payroll
    ? <span className="inline-flex rounded-full bg-[#e6e9fb] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#4a4fb0]">Payroll</span>
    : <span className="inline-flex rounded-full bg-secondary px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">Nxtwave</span>;
}

function formatExitDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Exception 2: the removal worklist. Everything a person needs to find and
// remove the record in TeachOS is one click from the clipboard.
// Row shape shared by the three views. The Exit/Serving-notice views come from the live Instructors report; the
// "Exited (archive)" view (2026-10-08, per request) comes from the Instructor Archive -- every archive row whose
// status is Exited, i.e. the approved exit records, whether or not the person is still in TeachOS.
type ExitRow = { id: string; full_name: string; employee_id: string | null; teachos_user_id: string | null; dept_area: string | null; capability_manager: string | null; is_payroll: boolean; date_of_exit: string | null; exit_flag_status: string | null; exit_flag_date: string | null };
type ArchiveExitRow = { id: number; full_name: string; employee_id: string | null; teachos_user_id: string | null; dept_area: string | null; capability_manager: string | null; is_payroll: boolean; date_of_exit: string | null; exit_status: string | null; exit_date: string | null; status: 'Active' | 'Exited' | 'SNP' };
// Approved exits only (2026-10-08, per request: "no pending for approval"): the archive also marks people Exited
// from a Pending With Approver record or a manually set exit date, so the Overview checks the exit record's own
// status. Pending ones stay in Exception 3; people exited by a manual date only are in the Archive tab.
const isApprovedExit = (row: ArchiveExitRow) => row.status === 'Exited' && (row.exit_status ?? '').trim().toLowerCase() === 'approved';
const toExitRow = (p: InstructorSummary): ExitRow => ({ id: String(p.id), full_name: p.full_name, employee_id: p.employee_id ?? null, teachos_user_id: p.teachos_user_id ?? null, dept_area: p.dept_area ?? null, capability_manager: p.capability_manager ?? null, is_payroll: !!p.is_payroll, date_of_exit: p.date_of_exit ?? null, exit_flag_status: p.exit_flag_status ?? null, exit_flag_date: p.exit_flag_date ?? null });

function ExceptionRemovePanel({ exitPeople, noticePeople, onClose, initialView = 'exit' }: { exitPeople: InstructorSummary[]; noticePeople: InstructorSummary[]; onClose: () => void; initialView?: 'exit' | 'notice' | 'archive' }) {
  const [view, setView] = useState<'exit' | 'notice' | 'archive'>(initialView);
  const archiveQuery = useQuery<{ people: ArchiveExitRow[] }>({
    queryKey: ['reports', 'instructor-archive'],
    queryFn: async () => {
      const response = await fetch('/api/reports/instructor-archive');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
  const archivePeople = useMemo<ExitRow[]>(() => (archiveQuery.data?.people ?? [])
    .filter(isApprovedExit)
    .map((row) => ({ id: `a${row.id}`, full_name: row.full_name, employee_id: row.employee_id, teachos_user_id: row.teachos_user_id, dept_area: row.dept_area, capability_manager: row.capability_manager, is_payroll: row.is_payroll, date_of_exit: row.date_of_exit, exit_flag_status: row.exit_status, exit_flag_date: row.exit_date }))
    .sort((a, b) => (b.date_of_exit ?? '').localeCompare(a.date_of_exit ?? '') || a.full_name.localeCompare(b.full_name)), [archiveQuery.data]);
  const liveExit = useMemo(() => exitPeople.map(toExitRow), [exitPeople]);
  const liveNotice = useMemo(() => noticePeople.map(toExitRow), [noticePeople]);
  const [search, setSearch] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const people = view === 'exit' ? liveExit : view === 'notice' ? liveNotice : archivePeople;
  const filtered = useMemo(() => people.filter((p) => matchesSearch(p, search)), [people, search]);
  const userIds = filtered.map((p) => p.teachos_user_id).filter((id): id is string => !!id);
  const copyAllIds = async () => {
    if (await copyText(userIds.join('\n'))) {
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1500);
    }
  };
  const handleDownload = () => downloadCsv(view === 'exit' ? 'exception-2-exit-remove-from-teachos.csv' : view === 'notice' ? 'exception-2-serving-notice-period.csv' : 'exited-approved-instructor-archive.csv', toCsv(['Name', 'Employee ID', 'TeachOS User ID', 'Subject', 'Capability Manager', 'Payroll / Nxtwave', 'date_of_exit', 'exit_status', 'exit_date'], filtered.map((p) => [p.full_name, p.employee_id ?? '', p.teachos_user_id ?? '', p.dept_area ?? '', p.capability_manager ?? '', payrollLabel(p), p.date_of_exit ?? '', p.exit_flag_status ?? '', p.exit_flag_date ?? ''])));
  const views: { key: 'exit' | 'notice' | 'archive'; label: string; count: number }[] = [
    { key: 'exit', label: 'Exit', count: exitPeople.length },
    { key: 'notice', label: 'Serving notice period', count: noticePeople.length },
    { key: 'archive', label: 'Exited (archive)', count: archivePeople.length },
  ];
  return <section className="mb-4 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6 animate-rise">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Exception 2 — TeachOS clean-up</p>
        <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">{view === 'exit' ? 'Exited — remove TeachOS access' : view === 'notice' ? 'Serving notice period' : 'Exited — approved exit records'}</h2>
        <p className="mt-1 max-w-[640px] text-[12px] text-muted-foreground">{view === 'exit'
          ? 'Instructors and Mentors who have exited (or whose notice period has ended) and still have a TeachOS record. Copy the user ID, remove the person in TeachOS, and they drop off this list after the next sync.'
          : view === 'notice'
            ? 'Instructors and Mentors serving their notice period. The day after their date of exit passes, they move to the Exit list automatically.'
            : 'Everyone in the Instructor Archive whose exit is Approved in Darwinbox (pending approvals are not included), newest exit first. This is the permanent record, so people stay here after they are removed from TeachOS.'}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {views.map((v) => <button key={v.key} type="button" data-testid={`button-exception-view-${v.key}`} onClick={() => setView(v.key)} className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${view === v.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'}`}>{v.label} ({v.count})</button>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {people.length > 0 && <TableSearchInput value={search} onChange={setSearch} placeholder="Search name, employee ID or user ID..." testId="input-search-exception-remove" />}
        <button type="button" onClick={copyAllIds} disabled={userIds.length === 0} data-testid="button-copy-all-user-ids" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50">
          {copiedAll ? <Check size={13} className="text-[#256e65]" /> : <Copy size={13} />} {copiedAll ? 'Copied' : `Copy all user IDs (${userIds.length})`}
        </button>
        <DownloadCsvButton onClick={handleDownload} disabled={filtered.length === 0} testId="button-download-exception-remove" />
        <button type="button" data-testid="button-close-exception-remove" onClick={onClose} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <X size={13} /> Close
        </button>
      </div>
    </div>
    <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Employee ID</th><th className="px-3 py-2">TeachOS user ID</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Capability Manager</th><th className="px-3 py-2">Payroll / Nxtwave</th><th className="px-3 py-2">date_of_exit</th><th className="px-3 py-2">exit_status</th><th className="px-3 py-2">exit_date</th></tr>
        </thead>
        <tbody>
          {filtered.map((p) => <tr key={p.id} className="border-t border-border/70">
            <td className="px-3 py-2 font-semibold"><CopyValue value={p.full_name} testId={`button-copy-name-${p.id}`} /></td>
            <td className="px-3 py-2 text-muted-foreground"><CopyValue value={p.employee_id} mono testId={`button-copy-employee-id-${p.id}`} /></td>
            <td className="px-3 py-2 text-muted-foreground"><CopyValue value={p.teachos_user_id} mono testId={`button-copy-user-id-${p.id}`} /></td>
            <td className="px-3 py-2 text-muted-foreground">{p.dept_area ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground"><CopyValue value={p.capability_manager} testId={`button-copy-capability-manager-${p.id}`} /></td>
            <td className="px-3 py-2" data-testid={`text-payroll-${p.id}`}><PayrollBadge person={p} /></td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" data-testid={`text-date-of-exit-${p.id}`}>{formatExitDate(p.date_of_exit)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" data-testid={`text-exit-status-${p.id}`}>{p.exit_flag_status || '—'}</td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" data-testid={`text-exit-record-date-${p.id}`}>{formatExitDate(p.exit_flag_date)}</td>
          </tr>)}
          {filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{people.length === 0 ? (view === 'exit' ? 'No one is waiting to be removed from TeachOS.' : view === 'notice' ? 'No one is serving a notice period.' : archiveQuery.isLoading ? 'Loading the archive...' : archiveQuery.isError ? 'The archive is unavailable right now.' : 'No exited records in the archive yet.') : 'No one matches this search.'}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
