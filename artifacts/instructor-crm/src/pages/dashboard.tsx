import { AlertTriangle, Briefcase, Building2, Check, Copy, ExternalLink, GraduationCap, RefreshCw, Trash2, UsersRound, X } from 'lucide-react';
import { Link } from 'wouter';
import { useMemo, useState } from 'react';
import { useGetReportsInstructors, getGetReportsInstructorsQueryKey, type AccessSplit, type InstructorSummary } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageIntro, QueryError, SkeletonBlock, DownloadCsvButton, TableSearchInput } from '@/components/ui-pieces';
import { downloadCsv, slugify, toCsv } from '@/lib/csv';

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
  const [activeException, setActiveException] = useState<'review' | 'remove' | null>(null);
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

    {reportQuery.isLoading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div>}
    {reportQuery.isError && <QueryError message="Dashboard data is unavailable right now." />}
    {report && <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-rise">
      <KpiCard label="Instructor Department" value={formatKpi(report.kpis.department_total_count)} meta="Instructors + Mentors + Ops team" icon={<Building2 size={17} />} tone="saffron" breakdown={report.access_breakdown?.department} active={activeAccessCard === 'department'} onClick={() => toggleAccessCard('department')} />
      <KpiCard label="Instructors" value={formatKpi(report.kpis.total_instructor_count)} meta="Matched with Darwin + payroll" icon={<UsersRound size={17} />} tone="navy" breakdown={report.access_breakdown?.instructors} active={activeAccessCard === 'instructors'} onClick={() => toggleAccessCard('instructors')} />
      <KpiCard label="Mentors" value={formatKpi(report.kpis.mentors_count)} meta="Darwin — Mentors department" icon={<GraduationCap size={17} />} tone="teal" breakdown={report.access_breakdown?.mentors} active={activeAccessCard === 'mentors'} onClick={() => toggleAccessCard('mentors')} />
      <KpiCard label="Operations team" value={formatKpi(report.kpis.ops_team_count)} meta="Darwin — Delivery Support (Ops)" icon={<Briefcase size={17} />} tone="coral" breakdown={report.access_breakdown?.ops_team} active={activeAccessCard === 'ops_team'} onClick={() => toggleAccessCard('ops_team')} />
    </section>}

    {report && <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-rise" aria-label="Exceptions">
      <KpiCard label="Exception 1 — Needs review" value={formatKpi(reviewPeople.length)} meta="Exit record, not reviewed yet" icon={<AlertTriangle size={17} />} tone="saffron" active={activeException === 'review'} onClick={() => setActiveException(activeException === 'review' ? null : 'review')} />
      <KpiCard label="Exception 2 — Remove from TeachOS" value={formatKpi(removePeople.length)} meta={`Exit list · ${noticePeople.length} serving notice`} icon={<Trash2 size={17} />} tone="coral" active={activeException === 'remove'} onClick={() => setActiveException(activeException === 'remove' ? null : 'remove')} />
    </section>}

    {report && activeException === 'review' && <ExceptionReviewPanel people={reviewPeople} onClose={() => setActiveException(null)} />}
    {report && activeException === 'remove' && <ExceptionRemovePanel exitPeople={removePeople} noticePeople={noticePeople} onClose={() => setActiveException(null)} />}

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

function matchesSearch(p: InstructorSummary, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return p.full_name.toLowerCase().includes(q) || (p.employee_id ?? '').toLowerCase().includes(q) || (p.teachos_user_id ?? '').toLowerCase().includes(q);
}

// Exception 1: details only. Reviewing happens in the Instructors tab's
// Exception view (that is where the Exit dropdown lives).
function ExceptionReviewPanel({ people, onClose }: { people: InstructorSummary[]; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => people.filter((p) => matchesSearch(p, search)), [people, search]);
  const handleDownload = () => downloadCsv('exception-1-needs-review.csv', toCsv(['Name', 'Employee ID', 'Capability Manager', 'Subject', 'Payroll / Nxtwave'], filtered.map((p) => [p.full_name, p.employee_id ?? '', p.capability_manager ?? '', p.dept_area ?? '', payrollLabel(p)])));
  return <section className="mt-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6 animate-rise">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Exception 1 — for Capability Managers</p>
        <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Exit records waiting for review</h2>
        <p className="mt-1 max-w-[640px] text-[12px] text-muted-foreground">These people have an Approved or Pending exit record and nobody has reviewed it yet. Reviewing is done in the Instructors tab, under Exception, not here.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {people.length > 0 && <TableSearchInput value={search} onChange={setSearch} testId="input-search-exception-review" />}
        <DownloadCsvButton onClick={handleDownload} disabled={filtered.length === 0} testId="button-download-exception-review" />
        <Link href="/instructors?category=exception" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary" data-testid="link-open-exception-instructors">
          <ExternalLink size={13} /> Review in Instructors tab
        </Link>
        <button type="button" data-testid="button-close-exception-review" onClick={onClose} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <X size={13} /> Close
        </button>
      </div>
    </div>
    <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Employee ID</th><th className="px-3 py-2">Capability Manager</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Payroll / Nxtwave</th></tr>
        </thead>
        <tbody>
          {filtered.map((p) => <tr key={p.id} className="border-t border-border/70">
            <td className="px-3 py-2 font-semibold">{p.full_name}</td>
            <td className="px-3 py-2 font-mono-ui text-muted-foreground">{p.employee_id ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.capability_manager ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.dept_area ?? '—'}</td>
            <td className="px-3 py-2"><PayrollBadge person={p} /></td>
          </tr>)}
          {filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{people.length === 0 ? 'Nothing is waiting for review.' : 'No one matches this search.'}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

// Payroll / Nxtwave bifurcation (2026-10-07, per request) for the Exception lists.
const payrollLabel = (p: InstructorSummary) => (p.is_payroll ? 'Payroll' : 'Nxtwave');
function PayrollBadge({ person }: { person: InstructorSummary }) {
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
function ExceptionRemovePanel({ exitPeople, noticePeople, onClose }: { exitPeople: InstructorSummary[]; noticePeople: InstructorSummary[]; onClose: () => void }) {
  const [view, setView] = useState<'exit' | 'notice'>('exit');
  const [search, setSearch] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const people = view === 'exit' ? exitPeople : noticePeople;
  const filtered = useMemo(() => people.filter((p) => matchesSearch(p, search)), [people, search]);
  const userIds = filtered.map((p) => p.teachos_user_id).filter((id): id is string => !!id);
  const copyAllIds = async () => {
    if (await copyText(userIds.join('\n'))) {
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1500);
    }
  };
  const handleDownload = () => downloadCsv(view === 'exit' ? 'exception-2-exit-remove-from-teachos.csv' : 'exception-2-serving-notice-period.csv', toCsv(['Name', 'Employee ID', 'TeachOS User ID', 'Subject', 'Capability Manager', 'Payroll / Nxtwave', 'date_of_exit', 'exit_status', 'exit_date'], filtered.map((p) => [p.full_name, p.employee_id ?? '', p.teachos_user_id ?? '', p.dept_area ?? '', p.capability_manager ?? '', payrollLabel(p), p.date_of_exit ?? '', p.exit_flag_status ?? '', p.exit_flag_date ?? ''])));
  const views: { key: 'exit' | 'notice'; label: string; count: number }[] = [
    { key: 'exit', label: 'Exit', count: exitPeople.length },
    { key: 'notice', label: 'Serving notice period', count: noticePeople.length },
  ];
  return <section className="mt-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6 animate-rise">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Exception 2 — TeachOS clean-up</p>
        <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">{view === 'exit' ? 'Exited — remove TeachOS access' : 'Serving notice period'}</h2>
        <p className="mt-1 max-w-[640px] text-[12px] text-muted-foreground">{view === 'exit'
          ? 'Instructors and Mentors who have exited (or whose notice period has ended) and still have a TeachOS record. Copy the user ID, remove the person in TeachOS, and they drop off this list after the next sync.'
          : 'Instructors and Mentors serving their notice period. The day after their date of exit passes, they move to the Exit list automatically.'}</p>
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
          {filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{people.length === 0 ? (view === 'exit' ? 'No one is waiting to be removed from TeachOS.' : 'No one is serving a notice period.') : 'No one matches this search.'}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
