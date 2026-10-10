import { AlertTriangle, ArrowRight, Briefcase, Building2, Check, Clock, Copy, GraduationCap, LogOut, PieChart, RefreshCw, Trash2, UsersRound, X } from 'lucide-react';
import { Link } from 'wouter';
import { useMemo, useState } from 'react';
import { useGetReportsInstructors, getGetReportsInstructorsQueryKey, type AccessSplit, type InstructorSummary } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageIntro, QueryError, SkeletonBlock, DownloadCsvButton, TableSearchInput } from '@/components/ui-pieces';
import { downloadCsv, slugify, toCsv } from '@/lib/csv';
import { ALL_PRODUCTS, productLabel } from './instructors';
import { NiatMapCard } from '@/components/niat-map';
import { ActionTakenCell, MOVEMENT_TYPES, currentMovements, movementLabel, useMovementsByInstructor, type Movement } from '@/components/movement-tracker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function formatKpi(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

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
  const [removeInitialView, setRemoveInitialView] = useState<'exit' | 'give' | 'notice' | 'movements'>('exit');
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
  // Mentors card population, each person once -- added to the instructors on the India map pins (2026-10-09).
  const mentorSplit = report?.access_breakdown?.mentors;
  const mentorPeople = useMemo(() => {
    const seen = new Set<number>();
    return [...(mentorSplit?.both?.people ?? []), ...(mentorSplit?.darwin_only?.people ?? []), ...(mentorSplit?.teachos_only?.people ?? [])]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [mentorSplit]);
  // Whole Instructor Department (instructors + mentors + Operations team), each person once -- the population
  // the Product pie chart splits (Operations team rows are the Support product).
  const departmentSplit = report?.access_breakdown?.department;
  const departmentPeople = useMemo(() => {
    const seen = new Set<number>();
    return [...(departmentSplit?.both?.people ?? []), ...(departmentSplit?.darwin_only?.people ?? []), ...(departmentSplit?.teachos_only?.people ?? [])]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [departmentSplit]);
  // Movement Tracker action items (2026-10-10, per request): logged movements are action items, so Exception 2 lists
  // them too. One row per instructor with a current (not yet cleared) movement group.
  const movementsByInstructor = useMovementsByInstructor();
  // Open action items = changes whose Action Taken is not Yes yet (Yes ones stay visible in the table for 24 hours, but
  // they are done, so they are not counted).
  const openMovementChanges = useMemo(() => [...movementsByInstructor.values()].flatMap((list) => currentMovements(list)).filter((movement) => movement.action_taken !== 'yes'), [movementsByInstructor]);
  const movementTypeCounts = useMemo(() => MOVEMENT_TYPES.map((type) => ({ label: type.label, count: openMovementChanges.filter((movement) => movement.movement_type === type.value).length })).filter((row) => row.count > 0), [openMovementChanges]);
  // Exception 2 now has three buckets (2026-10-10, per request): remove TeachOS access (exited), give TeachOS access
  // (Darwin-only instructors + mentors, not Support / IIT X DSA) and Movement Tracker changes.
  // Everyone who may be on their way out (2026-10-10, per request): marked Exited, Absconded or Serving Notice Period by a
  // Capability Manager, whatever the approval status -- the Remove-access, Serving-notice and Pending lists together,
  // each person once. Payroll candidates are not included. The Exit card drops the ones already counted as approved.
  const exitCandidates = useMemo(() => {
    const seen = new Set<number>();
    return [...removePeople, ...noticePeople, ...pendingPeople]
      .filter((person) => !person.is_payroll && person.exit_verification !== 'payroll_converted' && ['exited', 'absconded', 'serving_notice_period'].includes(person.exit_verification ?? ''))
      .filter((person) => (seen.has(person.id) ? false : (seen.add(person.id), true)));
  }, [removePeople, noticePeople, pendingPeople]);
  const removeCount = removePeople.length;
  // Give TeachOS access (rule set 2026-10-10): instructors + mentors who are in Darwin only (no TeachOS record yet),
  // leaving out the Support and IIT X DSA products. Each person once.
  const givePeople = useMemo(() => {
    const seen = new Set<number>();
    return [...(instructorSplit?.darwin_only?.people ?? []), ...(mentorSplit?.darwin_only?.people ?? [])]
      .filter((person) => !['Support', 'IIT X DSA'].includes(productLabel(person)))
      // Leaving anyway (2026-10-10, per request): anyone with an exit record that is Approved or still Pending With
      // Approver needs no access, whether or not a Capability Manager has reviewed it; so does anyone a Capability
      // Manager marked Exited or Absconded. Revoked / Rejected exit records do not count.
      .filter((person) => {
        const status = (person.exit_flag_status ?? '').trim().toLowerCase();
        const liveExit = !!person.exit_flag && (status === 'approved' || status.startsWith('pending'));
        const markedExit = person.exit_verification === 'exited' || person.exit_verification === 'absconded';
        return !liveExit && !markedExit;
      })
      .filter((person) => (seen.has(person.id) ? false : (seen.add(person.id), true)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [instructorSplit, mentorSplit]);
  const giveMentorCount = useMemo(() => { const ids = new Set((mentorSplit?.darwin_only?.people ?? []).map((person) => person.id)); return givePeople.filter((person) => ids.has(person.id)).length; }, [givePeople, mentorSplit]);
  const giveCount = givePeople.length;
  const movementCount = openMovementChanges.length;
  const exception2Total = removeCount + giveCount + movementCount;
  const [exception2Open, setException2Open] = useState(false);
  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      title="Faculty Command Center (FCC)"
      action={<button type="button" data-testid="button-refresh-dashboard" onClick={() => queryClient.invalidateQueries({ queryKey: getGetReportsInstructorsQueryKey() })} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh data</button>}
    />

    {report && <section aria-label="Exceptions" data-testid="banner-exceptions" className="mb-4 grid grid-cols-1 gap-3 animate-rise sm:grid-cols-3">
      <ExceptionSegment label="CM actions" title="Needs review" meta="Exit record not reviewed yet — Capability Managers" count={reviewPeople.length} icon={<AlertTriangle size={16} />} href="/instructors?category=exception" testId="exception-1" />
      <ExceptionSegment label="Admin team actions" title="TeachOS access actions" meta={`${removeCount} remove · ${giveCount} give · ${movementCount} movement changes`} count={exception2Total} icon={<Trash2 size={16} />} active={activeException === 'remove'} onClick={() => setException2Open(true)} testId="exception-2" />
      <ExceptionSegment label="HRBP actions" title="Approval pending" meta="Exit approval pending — HRBP action" count={pendingPeople.length} icon={<Clock size={16} />} active={activeException === 'pending'} onClick={() => setActiveException(activeException === 'pending' ? null : 'pending')} testId="exception-3" />
    </section>}
    {report && activeException === 'pending' && <ExceptionPendingPanel people={pendingPeople} onClose={() => setActiveException(null)} />}
    <Dialog open={exception2Open} onOpenChange={setException2Open}>
      <DialogContent className="max-w-lg" data-testid="dialog-exception-2">
        <DialogHeader>
          <DialogTitle>Admin team actions — {exception2Total} {exception2Total === 1 ? 'action' : 'actions'} to do</DialogTitle>
          <DialogDescription>What needs doing in TeachOS right now. Open a list to work through it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {([
            { key: 'exit' as const, title: 'Remove TeachOS access', note: 'Exited instructors and mentors who still have a TeachOS record.', count: removeCount, detail: null as string | null },
            { key: 'give' as const, title: 'Give TeachOS access', note: 'Instructors and mentors who are in Darwin only, so TeachOS access has to be given (Support, IIT X DSA and anyone with an approved or pending exit left out).', count: giveCount, detail: giveCount > 0 ? `${giveCount - giveMentorCount} Instructors · ${giveMentorCount} Mentors` : null },
            { key: 'movements' as const, title: 'Movement Tracker changes', note: 'Changes logged on the Instructors tab that still need action.', count: movementCount, detail: movementTypeCounts.map((row) => `${row.count} ${row.label}`).join(' · ') || null },
          ]).map((row) => <button key={row.key} type="button" data-testid={`exception-2-bucket-${row.key}`} onClick={() => { setRemoveInitialView(row.key); setActiveException('remove'); setException2Open(false); }} className="flex w-full items-start justify-between gap-4 rounded-lg border border-border p-3 text-left transition-colors hover:bg-secondary">
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold">{row.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{row.note}</p>
              {row.detail && <p className="mt-1 text-[11px] font-semibold text-primary">{row.detail}</p>}
            </div>
            <span className="shrink-0 text-[24px] font-extrabold leading-none tabular-nums" data-testid={`exception-2-count-${row.key}`}>{row.count.toLocaleString('en-IN')}</span>
          </button>)}
          <button type="button" data-testid="exception-2-bucket-notice" onClick={() => { setRemoveInitialView('notice'); setActiveException('remove'); setException2Open(false); }} className="w-full rounded-md px-1 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground">
            Also serving notice (not counted above): <span className="font-bold tabular-nums">{noticePeople.length}</span> — view list
          </button>
        </div>
      </DialogContent>
    </Dialog>
    {report && activeException === 'remove' && <ExceptionRemovePanel key={removeInitialView} initialView={removeInitialView} exitPeople={removePeople} noticePeople={noticePeople} givePeople={givePeople} movementsByInstructor={movementsByInstructor} onClose={() => setActiveException(null)} />}

    {reportQuery.isLoading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div>}
    {reportQuery.isError && <QueryError message="Dashboard data is unavailable right now." />}
    {report && <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 animate-rise">
      <KpiCard label="Instructor Department" value={formatKpi(report.kpis.department_total_count)} meta="Instructors + Mentors + Ops team" icon={<Building2 size={12} />} tone="saffron" />
      <KpiCard label="Instructors" value={formatKpi(report.kpis.total_instructor_count)} meta="Matched with Darwin + payroll" icon={<UsersRound size={12} />} tone="navy" />
      <KpiCard label="Mentors" value={formatKpi(report.kpis.mentors_count)} meta="Darwin — Mentors department" icon={<GraduationCap size={12} />} tone="teal" />
      <KpiCard label="Operations team" value={formatKpi(report.kpis.ops_team_count)} meta="Darwin — Delivery Support (Ops)" icon={<Briefcase size={12} />} tone="coral" />
      <ExitKpiCard exitCandidates={exitCandidates} />
    </section>}


    {report && <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-stretch animate-rise" aria-label="Product mix, NIAT contribution and exit data">
      <ProductMixCard people={departmentPeople} />
      <NiatContributionCard people={departmentPeople} />
    </section>}
    {report && <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 animate-rise" aria-label="Campuses, capability managers and NIAT university map">
      <div className="flex min-w-0 flex-col gap-3">
        <TopCampusesCard instructors={instructorPeople} mentors={mentorPeople} />
        <CapabilityManagersCard people={departmentPeople} />
      </div>
      <NiatMapCard instructorInstitutes={instructorPeople.filter((person) => productLabel(person) !== 'Support').map((person) => person.institutes)} mentorInstitutes={mentorPeople.filter((person) => productLabel(person) !== 'Support').map((person) => person.institutes)} />
    </section>}
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
      <span className="block truncate text-[11px] opacity-80" title={meta}>{meta}</span>
    </span>
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold">Check <ArrowRight size={14} /></span>
  </>;
  // Each exception is its own card with a gap between them (2026-10-10, per request), not one joined bar.
  const cls = `flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left shadow-sm transition-colors ${clear
    ? `border-[#c3e0d7] text-[#256e65] hover:bg-[#d2e8e1] ${active ? 'bg-[#d2e8e1]' : 'bg-[#dff0eb]'}`
    : `border-[#ebc9bd] text-[#9b4434] hover:bg-[#f0d6cd] ${active ? 'bg-[#f0d6cd]' : 'bg-[#f6e4de]'}`}`;
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
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">HRBP actions</p>
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
  // Subject filter (2026-10-10, per request): the Subject list on the left narrows the donut and the product list to one
  // subject -- the centre shows how many people teach it, the product rows show how many of them are in each product.
  const [subject, setSubject] = useState<string | null>(null);
  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people) if (person.dept_area) counts.set(person.dept_area, (counts.get(person.dept_area) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [people]);
  const scoped = useMemo(() => (subject ? people.filter((person) => person.dept_area === subject) : people), [people, subject]);
  const slices = useMemo(() => {
    const counts = new Map<string, number>(ALL_PRODUCTS.map((name) => [name, 0]));
    for (const person of scoped) {
      const label = productLabel(person);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [scoped]);
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
  return <div data-testid="card-product-mix" className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-muted-foreground"><PieChart size={14} /></span>
      <div>
        <h2 className="text-[12px] font-extrabold tracking-[-0.03em]">Product mix</h2>
        <p className="text-[10px] text-muted-foreground">{subject ? `${subject} · by Product` : 'Instructor Department by Product'}</p>
      </div>
    </div>
    <div className="flex flex-1 flex-col items-center justify-center gap-5 lg:flex-row lg:items-center lg:gap-8">
      <div className="w-full shrink-0 lg:w-[190px]" data-testid="product-mix-subjects">
        <p className="mb-1 px-2 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Subject</p>
        <ul className="space-y-0.5">
          {[{ name: null as string | null, label: 'All subjects', count: people.length }, ...subjects.map(([name, count]) => ({ name: name as string | null, label: name, count }))].map((row) => <li key={row.label}>
            <button type="button" onClick={() => setSubject(row.name === subject ? null : row.name)} aria-pressed={row.name === subject} data-testid={`button-subject-${slugify(row.label)}`} className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors ${row.name === subject ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
              <span className="min-w-0 flex-1 truncate" title={row.label}>{row.label}</span>
              <span className="shrink-0 font-extrabold tabular-nums">{row.count.toLocaleString('en-IN')}</span>
            </button>
          </li>)}
        </ul>
      </div>
      <div className="relative h-[210px] w-[210px] shrink-0 lg:h-[250px] lg:w-[250px]">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-0" role="img" aria-label="Instructor Department split by Product">
          <circle cx="21" cy="21" r={RADIUS} fill="none" strokeWidth="6" className="stroke-secondary" />
          {arcs.map((arc) => <circle key={arc.name} cx="21" cy="21" r={RADIUS} fill="none" strokeWidth={hover === arc.name ? 7 : 6} stroke={PRODUCT_COLORS[arc.name] ?? '#8a93a6'} strokeDasharray={`${Math.max(arc.pct - 0.4, 0)} ${100 - Math.max(arc.pct - 0.4, 0)}`} strokeDashoffset={arc.dashOffset} onMouseEnter={() => setHover(arc.name)} onMouseLeave={() => setHover(null)} data-testid={`slice-product-${slugify(arc.name)}`}><title>{`${arc.name}: ${arc.count}`}</title></circle>)}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[28px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{(active ? active.count : total).toLocaleString('en-IN')}</div>
            <div className="mt-1 max-w-[120px] text-[12px] leading-tight text-muted-foreground">{active ? active.name : (subject ?? 'total')}</div>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 max-w-[260px] space-y-1">
        {slices.map((slice) => <li key={slice.name} onMouseEnter={() => setHover(slice.name)} onMouseLeave={() => setHover(null)} data-testid={`row-product-${slugify(slice.name)}`} className={`flex items-center gap-2.5 rounded-md px-2 py-0.5 transition-colors ${hover === slice.name ? 'bg-secondary' : ''}`}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PRODUCT_COLORS[slice.name] ?? '#8a93a6' }} />
          <span className="min-w-0 flex-1 truncate text-[12px]">{slice.name}</span>
          <span className="min-w-10 text-right text-[12px] font-extrabold tabular-nums">{slice.count.toLocaleString('en-IN')}</span>
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
  // One flat list (2026-10-09, per request): every row is the exact cohort(s) an instructor teaches, in the order
  // 2024, 2024 + 2025, 2025, 2025 + 2026, 2026 -- no separate "only one cohort" / "combination" sections. Each
  // instructor is counted once, under exactly the cohort(s) they teach, so the rows add up to the NIAT total.
  const { rows, total } = useMemo(() => {
    const niat = people.filter((p) => productLabel(p).startsWith('NIAT'));
    const rank = (name: string) => { const i = NIAT_COHORT_ORDER.indexOf(name); return i === -1 ? 99 : i; };
    const labelOf = (cohorts: string[]) => cohorts.map((name, i) => (i === 0 ? name : name.replace(/^NIAT\s+/, ''))).join(' + ');
    const groups = new Map<string, { cohorts: string[]; count: number }>();
    for (const name of NIAT_COHORT_ORDER) groups.set(name, { cohorts: [name], count: 0 });
    for (const person of niat) {
      const cohorts = [...new Set(person.niat_cohorts ?? [])].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
      if (cohorts.length === 0) continue;
      const key = cohorts.join(' + ');
      const entry = groups.get(key) ?? { cohorts, count: 0 };
      entry.count += 1;
      groups.set(key, entry);
    }
    const ordered = [...groups.values()]
      .sort((x, y) => rank(x.cohorts[0]) - rank(y.cohorts[0]) || x.cohorts.length - y.cohorts.length || labelOf(x.cohorts).localeCompare(labelOf(y.cohorts)))
      .map((entry) => ({ label: labelOf(entry.cohorts), count: entry.count }));
    return { rows: ordered, total: niat.length };
  }, [people]);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const bar = (count: number) => <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.max(count > 0 ? 2 : 0, (count / max) * 100)}%`, backgroundColor: '#4f86b8' }} /></div>;
  return <div data-testid="card-niat-contribution" className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><GraduationCap size={14} /></span>
      <div>
        <h2 className="text-[12px] font-extrabold tracking-[-0.03em]">Contribution of NIAT instructors</h2>
        <p className="text-[10px] text-muted-foreground">Instructors teaching each NIAT cohort · last 30 days (last 2 months if none)</p>
      </div>
    </div>
    <div className="mb-3 flex items-baseline gap-2">
      <span className="text-[18px] font-extrabold leading-none tracking-[-0.03em] tabular-nums" data-testid="text-niat-instructor-total">{total.toLocaleString('en-IN')}</span>
      <span className="text-[12px] text-muted-foreground">NIAT instructors (Deployed + Training)</span>
    </div>
    <ul className="flex flex-1 flex-col justify-between gap-2">
      {rows.map((row) => <li key={row.label} data-testid={`row-niat-cohort-${slugify(row.label)}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px]">{row.label}</span>
          <span className="text-[12px] font-extrabold tabular-nums">{row.count.toLocaleString('en-IN')}</span>
        </div>
        {bar(row.count)}
      </li>)}
    </ul>
    <p className="mt-3 text-[10px] text-muted-foreground">Each instructor is counted once, under the exact cohort(s) they teach.</p>
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
  return <ol className="space-y-2">
    {rows.map(([name, count], index) => <li key={name} data-testid={`row-${testPrefix}-${slugify(name)}`} className="flex items-start gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-secondary font-mono-ui text-[10px] font-bold text-muted-foreground">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[12px] text-foreground">{name}</span>
          <span className="shrink-0 text-[12px] font-extrabold tabular-nums">{count.toLocaleString('en-IN')}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (count / max) * 100)}%`, backgroundColor: color }} /></div>
      </div>
    </li>)}
  </ol>;
}

// Plain two-column list, row by row (2026-10-09, per layout sketch): name on the left, count on the right.
function CompactCountList({ rows, testPrefix }: { rows: [string, number][]; testPrefix: string }) {
  return <ol className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
    {rows.map(([name, count]) => <li key={name} data-testid={`row-${testPrefix}-${slugify(name)}`} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
      <span className="min-w-0 truncate text-[12px] text-foreground" title={name}>{name}</span>
      <span className="shrink-0 text-[12px] font-extrabold tabular-nums">{count.toLocaleString('en-IN')}</span>
    </li>)}
  </ol>;
}

function TopCampusesCard({ instructors, mentors }: { instructors: InstructorSummary[]; mentors: InstructorSummary[] }) {
  // Training Institute is left out of this chart (2026-10-09, per request): the 10 biggest real campuses only.
  // 2026-10-09, per request: each bar counts instructors + mentors and shows the split (a mentor who is also on the
  // instructors list is counted once, as an instructor).
  const campuses = useMemo(() => {
    const counts = new Map<string, { instructors: number; mentors: number }>();
    const instructorIds = new Set(instructors.map((person) => person.id));
    const add = (people: InstructorSummary[], kind: 'instructors' | 'mentors') => {
      for (const person of people) {
        if (productLabel(person) === 'Support') continue;
        const names = new Set((person.institutes ?? []).map((name) => name.trim()).filter((name) => name && name !== TRAINING_CAMPUS && !/st\.?\s*mary/i.test(name)));
        names.forEach((name) => {
          const entry = counts.get(name) ?? { instructors: 0, mentors: 0 };
          entry[kind] += 1;
          counts.set(name, entry);
        });
      }
    };
    add(instructors, 'instructors');
    add(mentors.filter((person) => !instructorIds.has(person.id)), 'mentors');
    return [...counts.entries()]
      .map(([name, c]) => ({ name, ...c, total: c.instructors + c.mentors }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .slice(0, 10);
  }, [instructors, mentors]);
  const max = Math.max(1, ...campuses.map((campus) => campus.total));
  return <div data-testid="card-top-campuses" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="text-[12px] font-extrabold tracking-[-0.02em]">Top campuses by instructors + mentors</h2>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#4f86b8]" />Instructors</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#2e8b7a]" />Mentors</span>
      </div>
    </div>
    <div className="flex h-[160px] items-end justify-between gap-2 border-b border-border px-1">
      {campuses.map((campus) => <div key={campus.name} data-testid={`row-campus-${slugify(campus.name)}`} title={`${campus.name}: ${campus.total} (${campus.instructors} instructors + ${campus.mentors} mentors)`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
        <span className="text-[11px] font-extrabold tabular-nums">{campus.total.toLocaleString('en-IN')}</span>
        <span className="text-[9px] leading-none tabular-nums text-muted-foreground">{campus.instructors}+{campus.mentors}</span>
        <div className="flex w-full max-w-[36px] flex-col justify-end overflow-hidden rounded-t-md" style={{ height: `${Math.max(campus.total > 0 ? 3 : 0, (campus.total / max) * 100)}%`, maxHeight: 'calc(100% - 30px)' }}>
          <div className="bg-[#2e8b7a]" style={{ flexGrow: campus.mentors, flexBasis: 0 }} />
          <div className="bg-[#4f86b8]" style={{ flexGrow: campus.instructors, flexBasis: 0 }} />
        </div>
      </div>)}
    </div>
    <div className="flex justify-between gap-2 px-1 pt-1.5">
      {campuses.map((campus) => <span key={campus.name} title={campus.name} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground">{campus.name}</span>)}
    </div>
  </div>;
}

// Capability Manager workload (2026-10-08, per request): each Capability Manager and how many people report to
// them. 2026-10-09, per request: counts the whole department (instructors + mentors + Operations team), not just
// instructors -- the caller passes departmentPeople. Names are in the Instructors tab, not here. People with no Capability Manager are
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
  return <div data-testid="card-capability-managers" className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-muted-foreground"><UsersRound size={14} /></span>
      <div>
        <h2 className="text-[12px] font-extrabold tracking-[-0.03em]">Manager workload</h2>
        <p className="text-[10px] text-muted-foreground">Everyone reporting to each Capability Manager · Instructors + Mentors + Ops</p>
      </div>
    </div>
    <div className="max-h-[340px] overflow-auto pr-1"><CompactCountList rows={managers} testPrefix="capability-manager" /></div>
  </div>;
}

// Exit data tile in the KPI row (2026-10-09, per request): the big number is the approved exits recorded so far
// (Instructor Archive: status Exited, exit record Approved). Clicking it opens a pop-up with every approved name and
// every name still pending approval (Exception 3's list), so the counts can be checked against real people.
const REVIEW_LABELS: Record<string, string> = { exited: 'Exited', absconded: 'Absconded', serving_notice_period: 'Serving notice', payroll_converted: 'Payroll converted' };
function ExitKpiCard({ exitCandidates }: { exitCandidates: InstructorSummary[] }) {
  const [open, setOpen] = useState(false);
  const archiveQuery = useQuery<{ people: ArchiveExitRow[] }>({
    queryKey: ['reports', 'instructor-archive'],
    queryFn: async () => {
      const response = await fetch('/api/reports/instructor-archive');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
  // Payroll candidates are never shown here (2026-10-09, per request) -- they are handled in the Exceptions.
  const approved = useMemo(() => (archiveQuery.data?.people ?? [])
    .filter((row) => isApprovedExit(row) && !row.is_payroll)
    .sort((a, b) => (b.date_of_exit ?? '').localeCompare(a.date_of_exit ?? '') || a.full_name.localeCompare(b.full_name)), [archiveQuery.data]);
  // Upcoming exits (2026-10-10, per request): everyone a Capability Manager marked Exited, Absconded or Serving Notice
  // Period (payroll candidates excluded), even while the exit is still pending approval -- except people already
  // counted in the approved list above.
  const upcoming = useMemo(() => {
    const approvedIds = new Set(approved.map((row) => row.employee_id).filter((id): id is string => !!id));
    return exitCandidates
      .filter((person) => !(person.employee_id && approvedIds.has(person.employee_id)))
      .sort((a, b) => (b.date_of_exit ?? b.exit_flag_date ?? '').localeCompare(a.date_of_exit ?? a.exit_flag_date ?? '') || a.full_name.localeCompare(b.full_name));
  }, [exitCandidates, approved]);
  // One combined list (2026-10-10, per request): approved exits and upcoming exits together, newest date first.
  const combined = useMemo(() => {
    const rows = [
      ...approved.map((row) => ({ key: `a${row.id}`, name: row.full_name, employeeId: row.employee_id, subject: row.dept_area, manager: row.capability_manager, markedAs: 'Exited', approval: 'Approved', date: row.date_of_exit, dateIsRaised: false })),
      ...upcoming.map((person) => ({ key: `u${person.id}`, name: person.full_name, employeeId: person.employee_id ?? null, subject: person.dept_area ?? null, manager: person.capability_manager ?? null, markedAs: REVIEW_LABELS[person.exit_verification ?? ''] ?? (person.exit_verification ?? '—'), approval: person.exit_flag_status ?? 'Pending', date: person.date_of_exit ?? person.exit_flag_date ?? null, dateIsRaised: !person.date_of_exit && !!person.exit_flag_date })),
    ];
    return rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.name.localeCompare(b.name));
  }, [approved, upcoming]);
  const value = archiveQuery.isLoading ? '…' : archiveQuery.isError ? '—' : approved.length.toLocaleString('en-IN');
  const chip = (text: string, tone: 'amber' | 'blue') => <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone === 'amber' ? 'bg-[#fbeed3] text-[#8a5a0b]' : 'bg-[#e1eaf1] text-primary'}`}>{text}</span>;
  return <>
    {/* Deliberately unlike the four live-headcount tiles: a filled card, two counts side by side, and a clear call to open the names (2026-10-09, per request). */}
    <button type="button" data-testid="button-kpi-card-exit-data" onClick={() => setOpen(true)} className="group relative flex w-full flex-col justify-between overflow-hidden rounded-xl border border-primary bg-primary p-4 text-left text-primary-foreground shadow-md transition-transform hover:-translate-y-0.5">
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary-foreground/10" />
      <span aria-hidden className="pointer-events-none absolute -bottom-8 right-8 h-16 w-16 rounded-full bg-primary-foreground/5" />
      <div className="relative flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-foreground/15"><LogOut size={12} /></span>
        <span className="font-mono-ui text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground/75">Exit data</span>
      </div>
      <div className="relative mt-3">
        <p className="text-[28px] font-extrabold leading-none tracking-[-0.04em]" data-testid="exit-approved-count">{value}</p>
        <p className="mt-1 text-[10px] font-semibold text-primary-foreground/75">Approved exits</p>
      </div>
      <p className="relative mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary-foreground/90">{archiveQuery.isError ? 'Archive unavailable right now' : 'View exit details'} <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" /></p>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl" data-testid="dialog-exit-data">
        <DialogHeader>
          <DialogTitle>Exit data</DialogTitle>
          <DialogDescription>
            {approved.length} approved · {upcoming.length} upcoming. Upcoming = marked Exited, Absconded or Serving notice by the Capability Manager, including exits still pending approval (payroll candidates not included).
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border" data-testid="exit-dialog-combined">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Employee ID</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Capability Manager</th><th className="px-3 py-2">Marked as</th><th className="px-3 py-2">Approval</th><th className="px-3 py-2">Date of exit</th></tr>
            </thead>
            <tbody>
              {combined.map((row) => <tr key={row.key} className="border-t border-border/70" data-testid={`exit-row-${row.key}`}>
                <td className="px-3 py-2 font-semibold">{row.name}</td>
                <td className="px-3 py-2 font-mono-ui text-muted-foreground">{row.employeeId ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.subject ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.manager ?? '—'}</td>
                <td className="px-3 py-2">{chip(row.markedAs, 'amber')}</td>
                <td className="px-3 py-2">{chip(row.approval, row.approval === 'Approved' ? 'blue' : 'amber')}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" title={row.dateIsRaised ? 'Date the exit was raised (no date of exit on the record)' : undefined}>{row.date ? (row.dateIsRaised ? `Raised ${formatExitDate(row.date)}` : formatExitDate(row.date)) : '—'}</td>
              </tr>)}
              {!archiveQuery.isLoading && combined.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No exits yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function KpiCard({ label, value, meta, icon, tone, alert = false }: {
  label: string;
  value: string;
  meta: string;
  icon: React.ReactNode;
  tone: 'navy' | 'teal' | 'saffron' | 'coral';
  alert?: boolean;
}) {
  // Centred tile with a coloured edge (2026-10-09, per request: dashboard-style Overview). Numbers only
  // (2026-10-09, per request): no Darwin / TeachOS access split and no people list on the Overview.
  const tones = { navy: 'bg-primary text-primary-foreground', teal: 'bg-[#dff0eb] text-[#256e65]', saffron: 'bg-[#fbeed3] text-[#8a5a0b]', coral: 'bg-[#f6e4de] text-[#9b4434]' };
  const edges = { navy: '#4f86b8', teal: '#2e8b7a', saffron: '#1f3a5f', coral: '#c75b3f' };
  return <div
    data-testid={`card-kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}
    className="relative w-full overflow-hidden rounded-xl border border-border bg-card py-5 pl-5 pr-4 text-center shadow-sm"
  >
    <span aria-hidden className="absolute bottom-3 left-0 top-3 w-1.5 rounded-r-full" style={{ backgroundColor: edges[tone] }} />
    <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-muted-foreground"><span className={`grid h-5 w-5 place-items-center rounded-md ${tones[tone]}`}>{icon}</span>{label}</p>
    <p className="mt-2 text-[28px] font-extrabold leading-none tracking-[-0.04em]">{value}</p>
    <p className={`mt-1.5 text-[10px] ${alert ? 'text-[#a36b00]' : 'text-muted-foreground'}`}>{meta}</p>
  </div>;
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

function ExceptionRemovePanel({ exitPeople, noticePeople, givePeople, movementsByInstructor, onClose, initialView = 'exit' }: { exitPeople: InstructorSummary[]; noticePeople: InstructorSummary[]; givePeople: InstructorSummary[]; movementsByInstructor: Map<number, Movement[]>; onClose: () => void; initialView?: 'exit' | 'give' | 'notice' | 'movements' }) {
  // Exception 2 is only the two worklists (2026-10-09, per request): who must be removed from TeachOS, and who is
  // serving notice. The approved-exit records live on the Overview's Exit data card, not here.
  const [view, setView] = useState<'exit' | 'give' | 'notice' | 'movements'>(initialView);
  // Movement action items: one row per instructor, with every change in their latest group and its Action Taken.
  const movementRows = useMemo(() => [...movementsByInstructor.entries()]
    .map(([instructorId, list]) => ({ instructorId, group: currentMovements(list) }))
    .filter((row) => row.group.length > 0)
    .sort((a, b) => b.group[0].requested_at.localeCompare(a.group[0].requested_at) || a.group[0].full_name.localeCompare(b.group[0].full_name)), [movementsByInstructor]);
  const liveExit = useMemo(() => exitPeople.map(toExitRow), [exitPeople]);
  const liveNotice = useMemo(() => noticePeople.map(toExitRow), [noticePeople]);
  const [search, setSearch] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const people = view === 'exit' ? liveExit : liveNotice;
  const filteredGive = useMemo(() => givePeople.filter((person) => matchesSearch(person, search)), [givePeople, search]);
  const filteredMovementRows = useMemo(() => movementRows.filter((row) => matchesSearch({ full_name: row.group[0].full_name, employee_id: row.group[0].employee_id }, search)), [movementRows, search]);
  const filtered = useMemo(() => people.filter((p) => matchesSearch(p, search)), [people, search]);
  const userIds = filtered.map((p) => p.teachos_user_id).filter((id): id is string => !!id);
  const copyAllIds = async () => {
    if (await copyText(userIds.join('\n'))) {
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1500);
    }
  };
  const handleGiveDownload = () => downloadCsv('exception-2-give-teachos-access.csv', toCsv(['Name', 'Employee ID', 'Email', 'Subject', 'Product', 'Darwin manager', 'Date of joining'], filteredGive.map((p) => [p.full_name, p.employee_id ?? '', p.org_email ?? '', p.dept_area ?? '', productLabel(p), p.darwin_manager ?? '', p.date_of_joining ?? ''])));
  const handleMovementDownload = () => downloadCsv('exception-2-movement-actions.csv', toCsv(['Name', 'Employee ID', 'Movement', 'Remark', 'Logged on', 'Action Taken'], filteredMovementRows.flatMap((row) => row.group.map((movement) => [movement.full_name, movement.employee_id ?? '', movementLabel(movement.movement_type), movement.remark, movement.requested_at.slice(0, 10), movement.action_taken === 'yes' ? 'Yes' : movement.action_taken === 'no' ? 'No' : '']))));
  const handleDownload = () => downloadCsv(view === 'exit' ? 'exception-2-exit-remove-from-teachos.csv' : 'exception-2-serving-notice-period.csv', toCsv(['Name', 'Employee ID', 'TeachOS User ID', 'Subject', 'Capability Manager', 'Payroll / Nxtwave', 'date_of_exit', 'exit_status', 'exit_date'], filtered.map((p) => [p.full_name, p.employee_id ?? '', p.teachos_user_id ?? '', p.dept_area ?? '', p.capability_manager ?? '', payrollLabel(p), p.date_of_exit ?? '', p.exit_flag_status ?? '', p.exit_flag_date ?? ''])));
  const views: { key: 'exit' | 'give' | 'notice' | 'movements'; label: string; count: number }[] = [
    { key: 'exit', label: 'Remove access', count: exitPeople.length },
    { key: 'give', label: 'Give access', count: givePeople.length },
    { key: 'movements', label: 'Movement actions', count: movementRows.length },
    { key: 'notice', label: 'Serving notice period', count: noticePeople.length },
  ];
  return <section className="mb-4 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6 animate-rise">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Admin team actions — TeachOS</p>
        <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">{view === 'exit' ? 'Exited — remove TeachOS access' : view === 'give' ? 'Darwin only — give TeachOS access' : view === 'notice' ? 'Serving notice period' : 'Movement actions'}</h2>
        <p className="mt-1 max-w-[640px] text-[12px] text-muted-foreground">{view === 'exit'
          ? 'Instructors and Mentors who have exited (or whose notice period has ended) and still have a TeachOS record. Copy the user ID, remove the person in TeachOS, and they drop off this list after the next sync.'
          : view === 'give'
            ? 'Instructors and mentors who are in Darwin only (no TeachOS record yet), leaving out the Support and IIT X DSA products and anyone with an approved or pending exit record. Give them TeachOS access; they drop off this list once they appear in TeachOS after the next sync.'
            : view === 'notice'
            ? 'Instructors and Mentors serving their notice period. The day after their date of exit passes, they move to the Exit list automatically.'
            : 'Changes logged in the Movement Tracker on the Instructors tab (CM change, team and product moves, deployments, recalls). Set Action Taken to Yes once it is done; the row clears 24 hours later.'}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {views.map((v) => <button key={v.key} type="button" data-testid={`button-exception-view-${v.key}`} onClick={() => setView(v.key)} className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${view === v.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'}`}>{v.label} ({v.count})</button>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view === 'movements' || view === 'give'
          ? (view === 'give' ? givePeople.length : movementRows.length) > 0 && <TableSearchInput value={search} onChange={setSearch} placeholder="Search name or employee ID..." testId="input-search-exception-movements" />
          : people.length > 0 && <TableSearchInput value={search} onChange={setSearch} placeholder="Search name, employee ID or user ID..." testId="input-search-exception-remove" />}
        {view !== 'movements' && view !== 'give' && <button type="button" onClick={copyAllIds} disabled={userIds.length === 0} data-testid="button-copy-all-user-ids" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50">
          {copiedAll ? <Check size={13} className="text-[#256e65]" /> : <Copy size={13} />} {copiedAll ? 'Copied' : `Copy all user IDs (${userIds.length})`}
        </button>}
        <DownloadCsvButton onClick={view === 'give' ? handleGiveDownload : view === 'movements' ? handleMovementDownload : handleDownload} disabled={(view === 'give' ? filteredGive.length : view === 'movements' ? filteredMovementRows.length : filtered.length) === 0} testId="button-download-exception-remove" />
        <button type="button" data-testid="button-close-exception-remove" onClick={onClose} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <X size={13} /> Close
        </button>
      </div>
    </div>
    {view === 'give' ? <div className="max-h-[420px] overflow-auto rounded-lg border border-border" data-testid="exception-give-access">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Employee ID</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Darwin manager</th><th className="px-3 py-2">Date of joining</th></tr>
        </thead>
        <tbody>
          {filteredGive.map((p) => <tr key={p.id} className="border-t border-border/70">
            <td className="px-3 py-2 font-semibold"><CopyValue value={p.full_name} testId={`button-copy-give-name-${p.id}`} /></td>
            <td className="px-3 py-2 text-muted-foreground"><CopyValue value={p.employee_id} mono testId={`button-copy-give-employee-id-${p.id}`} /></td>
            <td className="px-3 py-2 text-muted-foreground"><CopyValue value={p.org_email} testId={`button-copy-give-email-${p.id}`} /></td>
            <td className="px-3 py-2 text-muted-foreground">{p.dept_area ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{productLabel(p)}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.darwin_manager ?? '—'}</td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatExitDate(p.date_of_joining)}</td>
          </tr>)}
          {filteredGive.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{givePeople.length === 0 ? 'No one is waiting for TeachOS access.' : 'No one matches this search.'}</td></tr>}
        </tbody>
      </table>
    </div> : view === 'movements' ? <div className="max-h-[420px] overflow-auto rounded-lg border border-border" data-testid="exception-movement-actions">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Employee ID</th><th className="px-3 py-2">Changes</th><th className="px-3 py-2">Logged on</th><th className="w-[130px] px-3 py-2">Action Taken</th></tr>
        </thead>
        <tbody>
          {filteredMovementRows.map((row) => <tr key={row.instructorId} className="border-t border-border/70 align-top">
            <td className="px-3 py-2 font-semibold">{row.group[0].full_name}</td>
            <td className="px-3 py-2 font-mono-ui text-muted-foreground">{row.group[0].employee_id ?? '—'}</td>
            <td className="px-3 py-2">
              <ul className="space-y-1">
                {row.group.map((movement) => <li key={movement.id}><span className="font-bold">{movementLabel(movement.movement_type)}</span><span className="text-muted-foreground"> — {movement.remark}</span></li>)}
              </ul>
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatExitDate(row.group[0].requested_at)}</td>
            <td className="px-3 py-2"><ActionTakenCell movements={movementsByInstructor.get(row.instructorId) ?? []} /></td>
          </tr>)}
          {filteredMovementRows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{movementRows.length === 0 ? 'No movement actions are open.' : 'No one matches this search.'}</td></tr>}
        </tbody>
      </table>
    </div> : <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
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
          {filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{people.length === 0 ? (view === 'exit' ? 'No one is waiting to be removed from TeachOS.' : 'No one is serving a notice period.') : 'No one matches this search.'}</td></tr>}
        </tbody>
      </table>
    </div>}
  </section>;
}
