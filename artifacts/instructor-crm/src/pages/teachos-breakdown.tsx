import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, GitBranch, ListChecks, RefreshCw, ShieldAlert, Users, UserX, Wallet } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, MiniStat, BucketPanel, formatKpi, pct, type Bucket } from '@/components/ui-pieces';

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
