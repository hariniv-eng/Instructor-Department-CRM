import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Database, GitBranch, ListChecks, RefreshCw, ShieldAlert, Users, UserX, Wallet } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock } from '@/components/ui-pieces';

type Candidate = {
  id: number;
  full_name: string;
  employee_id: string | null;
  teachos_category: string | null;
  department: string | null;
  designation: string | null;
  classification: string | null;
  classification_reason: string | null;
  notes: string | null;
};

type Bucket = { count: number; people: Candidate[] };

type TeachosBreakdown = {
  total_active: number;
  matched_with_darwin: Bucket;
  not_mapped: {
    total: number;
    other_department: Bucket;
    payroll_converted: Bucket;
    excluded: Bucket;
    needs_review: Bucket;
  };
};

const BREAKDOWN_QUERY_KEY = ['reports', 'teachos-breakdown'];

function useTeachosBreakdown() {
  return useQuery<TeachosBreakdown>({
    queryKey: BREAKDOWN_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/teachos-breakdown');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

function formatKpi(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

function pct(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : '—';
}

export default function TeachosBreakdownPage() {
  const queryClient = useQueryClient();
  const breakdownQuery = useTeachosBreakdown();
  const data = breakdownQuery.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: BREAKDOWN_QUERY_KEY });

  return <div className="mx-auto max-w-[1350px]">
    <PageIntro
      eyebrow="Standing rule / TeachOS reconciliation"
      title="TeachOS Breakdown"
      description="Every active TeachOS instructor, split by how they resolved against Darwin: a clean match, a match under a different department, a confirmed payroll conversion, an individual exclusion, or genuinely unresolved."
      action={<button type="button" data-testid="button-refresh-teachos-breakdown" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {breakdownQuery.isLoading && <div className="space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div><SkeletonBlock className="h-[420px]" /></div>}
    {breakdownQuery.isError && <QueryError message="TeachOS breakdown is unavailable right now." />}

    {data && <div className="space-y-5 animate-rise">
      {/* Headline KPI row */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <TopStat label="TeachOS active count" value={formatKpi(data.total_active)} meta="niat_instructor_details, ACTIVE" icon={<Database size={17} />} tone="navy" />
        <TopStat label="Correctly mapped with Darwin" value={formatKpi(data.matched_with_darwin.count)} meta={`${pct(data.matched_with_darwin.count, data.total_active)} of TeachOS active`} icon={<GitBranch size={17} />} tone="teal" />
        <TopStat label="Not mapped correctly" value={formatKpi(data.not_mapped.total)} meta={`${pct(data.not_mapped.total, data.total_active)} of TeachOS active`} icon={<ShieldAlert size={17} />} tone="saffron" alert />
      </section>

      {/* Not-mapped sub-breakdown */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Of the {formatKpi(data.not_mapped.total)} not correctly mapped</p>
            <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Where each one actually landed</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Other department" value={data.not_mapped.other_department.count} meta="Found in Darwin, wrong dept" tone="indigo" />
          <MiniStat label="Payroll converted" value={data.not_mapped.payroll_converted.count} meta="Confirmed via payroll list" tone="green" />
          <MiniStat label="Excluded" value={data.not_mapped.excluded.count} meta="Individually reviewed, not an instructor" tone="muted" />
          <MiniStat label="Needs review" value={data.not_mapped.needs_review.count} meta="Unresolved — no match anywhere" tone="amber" />
        </div>
      </section>

      {/* Detail panels */}
      <BucketPanel
        title="Matched with Darwin"
        subtitle="TeachOS active instructors who matched a Darwin Instructors-department record directly"
        icon={<Users size={18} />}
        bucket={data.matched_with_darwin}
        emptyLabel="No matches"
        columns={['name', 'employee_id', 'category', 'darwin_dept']}
        defaultOpen={false}
      />
      <BucketPanel
        title="Other department"
        subtitle="Do exist in Darwin's full 3,000+ roster — just filed under a department that isn't a teaching role"
        icon={<GitBranch size={18} />}
        bucket={data.not_mapped.other_department}
        emptyLabel="None found in another department"
        columns={['name', 'employee_id', 'category', 'darwin_dept', 'reason']}
        defaultOpen={true}
      />
      <BucketPanel
        title="Payroll converted"
        subtitle="No Darwin record, but confirmed against the Payroll Candidates reference file"
        icon={<Wallet size={18} />}
        bucket={data.not_mapped.payroll_converted}
        emptyLabel="No payroll-converted candidates"
        columns={['name', 'employee_id', 'category', 'reason']}
        defaultOpen={true}
      />
      <BucketPanel
        title="Excluded"
        subtitle="Individually reviewed and confirmed not to be a teaching/instructor role, despite appearing in TeachOS"
        icon={<UserX size={18} />}
        bucket={data.not_mapped.excluded}
        emptyLabel="No individual exclusions"
        columns={['name', 'employee_id', 'category', 'reason']}
        defaultOpen={true}
      />
      <BucketPanel
        title="Needs review"
        subtitle="No Darwin record anywhere, not on the payroll list, no exclusion override — genuinely unresolved"
        icon={<ListChecks size={18} />}
        bucket={data.not_mapped.needs_review}
        emptyLabel="Nothing left to review"
        columns={['name', 'employee_id', 'category']}
        defaultOpen={true}
      />

      {!data.total_active && <EmptyState title="No TeachOS data loaded" description="Upload or sync a TeachOS snapshot to see the reconciliation breakdown here." />}
    </div>}
  </div>;
}

function TopStat({ label, value, meta, icon, tone, alert = false }: { label: string; value: string; meta: string; icon: React.ReactNode; tone: 'navy' | 'teal' | 'saffron'; alert?: boolean }) {
  const tones = { navy: 'bg-primary text-primary-foreground', teal: 'bg-[#dff0eb] text-[#256e65]', saffron: 'bg-accent text-accent-foreground' };
  return <div className={`relative overflow-hidden rounded-xl border border-border p-4 shadow-xs transition-transform hover:-translate-y-0.5 sm:p-5 ${tone === 'navy' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>
    <div className="flex items-start justify-between">
      <p className={`text-[11px] font-bold ${tone === 'navy' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{label}</p>
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span>
    </div>
    <p className="mt-5 text-[27px] font-extrabold tracking-[-0.06em]">{value}</p>
    <p className={`mt-1 font-mono-ui text-[10px] uppercase tracking-[0.1em] ${tone === 'navy' ? 'text-primary-foreground/55' : alert ? 'text-[#a36b00]' : 'text-muted-foreground'}`}>{meta}</p>
  </div>;
}

function MiniStat({ label, value, meta, tone }: { label: string; value: number; meta: string; tone: 'indigo' | 'green' | 'muted' | 'amber' }) {
  const toneClass = tone === 'indigo' ? 'text-[#4a4fb0]' : tone === 'green' ? 'text-[#287469]' : tone === 'amber' ? 'text-[#8b6207]' : 'text-muted-foreground';
  return <div className="rounded-lg border border-border/70 bg-[#f8fafb] p-3.5">
    <p className="font-mono-ui text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    <p className={`mt-2 text-[22px] font-extrabold tracking-[-0.04em] ${toneClass}`}>{formatKpi(value)}</p>
    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{meta}</p>
  </div>;
}

type Column = 'name' | 'employee_id' | 'category' | 'darwin_dept' | 'reason';

const COLUMN_LABELS: Record<Column, string> = {
  name: 'Name',
  employee_id: 'Employee ID',
  category: 'TeachOS category',
  darwin_dept: 'Darwin department',
  reason: 'Reason',
};

function BucketPanel({ title, subtitle, icon, bucket, emptyLabel, columns, defaultOpen }: { title: string; subtitle: string; icon: React.ReactNode; bucket: Bucket; emptyLabel: string; columns: Column[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen && bucket.count > 0);

  return <section className="rounded-xl border border-border bg-card shadow-xs">
    <button
      type="button"
      data-testid={`button-toggle-${title.toLowerCase().replaceAll(' ', '-')}`}
      onClick={() => setOpen((value) => !value)}
      className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">{icon}</span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-extrabold tracking-[-0.03em]">{title}</h2>
            <span className="font-mono-ui rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-foreground">{formatKpi(bucket.count)}</span>
          </div>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {open ? <ChevronUp size={18} className="shrink-0 text-muted-foreground" /> : <ChevronDown size={18} className="shrink-0 text-muted-foreground" />}
    </button>
    {open && <div className="border-t border-border px-5 pb-5 sm:px-6 sm:pb-6">
      {!bucket.people.length
        ? <div className="pt-5"><EmptyState title={emptyLabel} description="Nothing in this bucket right now." /></div>
        : <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>{columns.map((column) => <th key={column} className="px-3 py-2">{COLUMN_LABELS[column]}</th>)}</tr>
            </thead>
            <tbody>
              {bucket.people.map((person) => <tr key={person.id} data-testid={`row-candidate-${person.id}`} className="border-t border-border/70">
                {columns.map((column) => <td key={column} className={column === 'name' ? 'px-3 py-2.5 font-semibold' : column === 'reason' ? 'px-3 py-2.5 text-muted-foreground' : 'px-3 py-2.5 font-mono-ui text-muted-foreground'}>
                  {column === 'name' && person.full_name}
                  {column === 'employee_id' && (person.employee_id ?? '—')}
                  {column === 'category' && (person.teachos_category ?? '—')}
                  {column === 'darwin_dept' && (person.department ?? '—')}
                  {column === 'reason' && (person.classification_reason ?? person.notes ?? '—')}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>}
    </div>}
  </section>;
}
