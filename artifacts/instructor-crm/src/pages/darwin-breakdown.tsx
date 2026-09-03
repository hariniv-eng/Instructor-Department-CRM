import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, GraduationCap, RefreshCw, ShieldQuestion, ShieldX, UserCog, Users, Wallet } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, MiniStat, BucketPanel, formatKpi, pct, type Bucket } from '@/components/ui-pieces';

type DarwinBreakdown = {
  total_darwin_instructors_dept: number;
  instructors: { count: number; by_area: Record<string, number>; people: Bucket['people'] };
  mentors: Bucket;
  others: {
    total: number;
    ops_delivery_support: Bucket;
    excluded: Bucket;
    payroll_edge_case: Bucket;
    uncategorized: Bucket;
  };
};

const BREAKDOWN_QUERY_KEY = ['reports', 'darwin-breakdown'];

function useDarwinBreakdown() {
  return useQuery<DarwinBreakdown>({
    queryKey: BREAKDOWN_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/darwin-breakdown');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

export default function DarwinBreakdownPage() {
  const queryClient = useQueryClient();
  const breakdownQuery = useDarwinBreakdown();
  const data = breakdownQuery.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: BREAKDOWN_QUERY_KEY });

  const areaEntries = data ? Object.entries(data.instructors.by_area).sort((a, b) => b[1] - a[1]) : [];

  return <div className="mx-auto max-w-[1350px]">
    <PageIntro
      eyebrow="Standing rule / Darwinbox reconciliation"
      title="Darwin Breakdown"
      description="Everyone Darwinbox lists in the Instructors department, split by who's actually teaching and who the department also carries: mentors, Delivery Support ops/central managers, and individually reviewed exclusions."
      action={<button type="button" data-testid="button-refresh-darwin-breakdown" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {breakdownQuery.isLoading && <div className="space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div><SkeletonBlock className="h-[420px]" /></div>}
    {breakdownQuery.isError && <QueryError message="Darwin breakdown is unavailable right now." />}

    {data && <div className="space-y-5 animate-rise">
      {/* Headline KPI row */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TopStat label="Darwin Instructors dept" value={formatKpi(data.total_darwin_instructors_dept)} meta="Darwinbox, department = Instructors – ..." icon={<Building2 size={17} />} tone="navy" />
        <TopStat label="Actual instructors" value={formatKpi(data.instructors.count)} meta={`${pct(data.instructors.count, data.total_darwin_instructors_dept)} of the department`} icon={<GraduationCap size={17} />} tone="teal" />
        <TopStat label="Mentors" value={formatKpi(data.mentors.count)} meta={`${pct(data.mentors.count, data.total_darwin_instructors_dept)} of the department`} icon={<Users size={17} />} tone="indigo" />
        <TopStat label="Others" value={formatKpi(data.others.total)} meta={`${pct(data.others.total, data.total_darwin_instructors_dept)} of the department`} icon={<ShieldQuestion size={17} />} tone="saffron" alert />
      </section>

      {/* Others sub-breakdown */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Of the {formatKpi(data.others.total)} who aren't counted as instructors</p>
            <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Who else the department carries</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Ops / Delivery Support" value={data.others.ops_delivery_support.count} meta="Central managers, not teaching" tone="muted" />
          <MiniStat label="Excluded" value={data.others.excluded.count} meta="Individually reviewed, not an instructor" tone="amber" />
          <MiniStat label="Payroll edge case" value={data.others.payroll_edge_case.count} meta="Payroll-converted despite a Darwin match" tone="green" />
          <MiniStat label="Uncategorized" value={data.others.uncategorized.count} meta="Left over, needs a look" tone="saffron" />
        </div>
      </section>

      {/* Instructor area breakdown */}
      {areaEntries.length > 0 && <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="mb-4">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Of the {formatKpi(data.instructors.count)} actual instructors</p>
          <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">By department area</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {areaEntries.map(([area, count]) => <div key={area} className="rounded-lg border border-border/70 bg-[#f8fafb] p-3.5">
            <p className="text-[11px] leading-4 text-muted-foreground">{area}</p>
            <p className="mt-2 text-[20px] font-extrabold tracking-[-0.04em]">{formatKpi(count)}</p>
          </div>)}
        </div>
      </section>}

      {/* Detail panels */}
      <BucketPanel
        title="Actual instructors"
        subtitle="Instructors-department people with a real teaching designation, bucketed tech or non-tech"
        icon={<Users size={18} />}
        bucket={data.instructors}
        emptyLabel="No instructors"
        columns={['name', 'employee_id', 'darwin_dept', 'designation', 'dept_area']}
        defaultOpen={false}
      />
      <BucketPanel
        title="Mentors"
        subtitle="Mentors department, or a Mentor-titled person embedded in a tech/non-tech sub-department"
        icon={<GraduationCap size={18} />}
        bucket={data.mentors}
        emptyLabel="No mentors"
        columns={['name', 'employee_id', 'darwin_dept', 'designation']}
        defaultOpen={false}
      />
      <BucketPanel
        title="Ops / Delivery Support"
        subtitle="Delivery Support (Ops and Central Managers) department, or a non-teaching designation inside a tech/non-tech sub-department"
        icon={<UserCog size={18} />}
        bucket={data.others.ops_delivery_support}
        emptyLabel="No ops/central managers"
        columns={['name', 'employee_id', 'darwin_dept', 'designation']}
        defaultOpen={true}
      />
      <BucketPanel
        title="Excluded"
        subtitle="Individually reviewed and confirmed not to be a teaching/instructor role, despite sitting in this department"
        icon={<ShieldX size={18} />}
        bucket={data.others.excluded}
        emptyLabel="No individual exclusions"
        columns={['name', 'employee_id', 'darwin_dept', 'designation', 'reason']}
        defaultOpen={true}
      />
      <BucketPanel
        title="Payroll edge case"
        subtitle="Flagged payroll-converted despite also having a direct Darwin Instructors-department match — worth a manual look"
        icon={<Wallet size={18} />}
        bucket={data.others.payroll_edge_case}
        emptyLabel="None — payroll conversions normally have no Darwin match"
        columns={['name', 'employee_id', 'darwin_dept', 'designation', 'reason']}
        defaultOpen={true}
      />
      <BucketPanel
        title="Uncategorized"
        subtitle="In the Instructors department, but didn't land in any bucket above — needs a manual look"
        icon={<ShieldQuestion size={18} />}
        bucket={data.others.uncategorized}
        emptyLabel="Nothing left uncategorized"
        columns={['name', 'employee_id', 'darwin_dept', 'designation']}
        defaultOpen={true}
      />

      {!data.total_darwin_instructors_dept && <EmptyState title="No Darwin data loaded" description="Upload or sync a Darwinbox snapshot to see the reconciliation breakdown here." />}
    </div>}
  </div>;
}
