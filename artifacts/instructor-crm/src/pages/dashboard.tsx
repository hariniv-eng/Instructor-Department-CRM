import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleAlert, RefreshCw, UsersRound } from 'lucide-react';
import { useGetDashboard, getGetDashboardQueryKey, useGetReportsInstructors } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { PageIntro, QueryError, SkeletonBlock } from '@/components/ui-pieces';

function formatKpi(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const dashboardQuery = useGetDashboard();
  const reportQuery = useGetReportsInstructors();
  const report = reportQuery.data;
  const dashboard = dashboardQuery.data;
  const kpis = dashboard?.kpis ?? {};
  const total = kpis.total_instructors ?? kpis.total ?? kpis.headcount;
  const active = kpis.active ?? kpis.active_instructors;
  const exceptions = kpis.exceptions ?? kpis.exception_count ?? kpis.mismatches;
  const exits = kpis.exits ?? kpis.exits_this_month;
  const maxTrend = Math.max(...(dashboard?.monthly_trend ?? []).flatMap((item) => [item.joiners, item.exits]), 1);
  const maxDept = Math.max(...(dashboard?.sub_departments ?? []).map((item) => item.count), 1);

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro eyebrow="Command center / 09:42 IST" title="Good morning, Aarav." description="A clear read on the instructor workforce, source integrity, and the exceptions worth your attention." action={<button type="button" data-testid="button-refresh-dashboard" onClick={() => queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() })} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh data</button>} />

    <section className="mb-5 rounded-xl border border-primary bg-primary p-6 text-primary-foreground shadow-xs sm:p-7">
      <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-primary-foreground/65">Standing rule / TeachOS instructor count</p>
      {reportQuery.isLoading && <div className="mt-3 h-12 w-40 animate-pulse rounded bg-primary-foreground/15" />}
      {reportQuery.isError && <p className="mt-3 text-[13px] text-primary-foreground/80">Total instructor count is unavailable right now.</p>}
      {report && <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[44px] font-extrabold leading-none tracking-[-0.05em]">{formatKpi(report.kpis.total_instructor_count)}</p>
          <p className="mt-2 text-[13px] font-semibold text-primary-foreground/75">Total instructor count — TeachOS instructors mapped &amp; classified against Darwin</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-[12px]">
          <div><p className="font-mono-ui uppercase tracking-[0.1em] text-primary-foreground/55">Matched — instructor dept</p><p className="mt-1 text-[17px] font-bold">{formatKpi(report.darwin_match?.matched_primary)}</p></div>
          <div><p className="font-mono-ui uppercase tracking-[0.1em] text-primary-foreground/55">Matched — full roster</p><p className="mt-1 text-[17px] font-bold">{formatKpi(report.darwin_match?.matched_full_roster_fallback)}</p></div>
          <div><p className="font-mono-ui uppercase tracking-[0.1em] text-primary-foreground/55">Payroll converted</p><p className="mt-1 text-[17px] font-bold">{formatKpi(report.kpis.payroll_count)}</p></div>
          <div><p className="font-mono-ui uppercase tracking-[0.1em] text-primary-foreground/55">Mentors (separate)</p><p className="mt-1 text-[17px] font-bold">{formatKpi(report.kpis.mentors_count)}</p></div>
        </div>
      </div>}
    </section>

    {dashboardQuery.isLoading && <div className="space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div><div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><SkeletonBlock className="h-[340px]" /><SkeletonBlock className="h-[340px]" /></div></div>}
    {dashboardQuery.isError && <QueryError message="Dashboard data is unavailable right now." />}
    {dashboard && <div className="space-y-5 animate-rise">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total instructors" value={formatKpi(total)} meta="Current register" icon={<UsersRound size={17} />} tone="navy" />
        <KpiCard label="Active in TeachOS" value={formatKpi(active)} meta="Access confirmed" icon={<CircleAlert size={17} />} tone="teal" />
        <KpiCard label="Exceptions" value={formatKpi(exceptions)} meta="Needs review" icon={<CircleAlert size={17} />} tone="saffron" alert />
        <KpiCard label="Exits this month" value={formatKpi(exits)} meta="Exit list signal" icon={<CalendarDays size={17} />} tone="coral" />
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="mb-5 flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Standing rule / TeachOS instructor count</p><h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Classification breakdown</h2></div></div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <ClassificationStat label="Counted as instructors" value={formatKpi(kpis.counted_as_instructors)} />
          <ClassificationStat label="Active, no exit record" value={formatKpi(kpis.active_no_exit_record)} />
          <ClassificationStat label="Exit-flagged" value={formatKpi(kpis.exit_flagged)} tone="amber" />
          <ClassificationStat label="Payroll converted" value={formatKpi(kpis.payroll_converted)} tone="indigo" />
          <ClassificationStat label="Excluded (other dept)" value={formatKpi(kpis.excluded)} tone="muted" />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
          <div className="mb-7 flex items-start justify-between">
            <div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Movement / 6 months</p><h2 className="mt-1 text-[17px] font-extrabold tracking-[-0.03em]">Headcount movement</h2></div>
            <div className="flex gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-primary" /> Joiners</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" /> Exits</span></div>
          </div>
          {dashboard.monthly_trend.length ? <div className="flex h-[230px] items-end gap-2 border-b border-border/70 pb-0 sm:gap-5">
            {dashboard.monthly_trend.map((item, index) => <div key={`${item.month}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-3">
              <div className="flex h-full w-full items-end justify-center gap-1 sm:gap-2">
                <div title={`${item.joiners} joiners`} className="w-3 rounded-t-sm bg-primary transition-all hover:opacity-80 sm:w-5" style={{ height: `${Math.max((item.joiners / maxTrend) * 86, item.joiners ? 5 : 1)}%` }} />
                <div title={`${item.exits} exits`} className="w-3 rounded-t-sm bg-accent transition-all hover:opacity-80 sm:w-5" style={{ height: `${Math.max((item.exits / maxTrend) * 86, item.exits ? 5 : 1)}%` }} />
              </div>
              <span className="font-mono-ui mb-2 text-[10px] text-muted-foreground">{item.month}</span>
            </div>)}
          </div> : <div className="grid h-[230px] place-items-center text-[12px] text-muted-foreground">No movement recorded yet.</div>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
          <div className="mb-6 flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Distribution</p><h2 className="mt-1 text-[17px] font-extrabold tracking-[-0.03em]">By sub-department</h2></div><Link href="/instructors" data-testid="link-view-instructors-distribution" className="text-muted-foreground hover:text-foreground"><ArrowUpRight size={17} /></Link></div>
          <div className="space-y-5">{dashboard.sub_departments.slice(0, 5).map((item, index) => <div key={item.name}><div className="mb-2 flex justify-between text-[12px]"><span className="font-semibold">{item.name}</span><span className="font-mono-ui text-muted-foreground">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${index === 0 ? 'bg-primary' : index === 1 ? 'bg-[#5a9b9a]' : index === 2 ? 'bg-accent' : 'bg-[#9fb4c9]'}`} style={{ width: `${(item.count / maxDept) * 100}%` }} /></div></div>)}</div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-xl border border-border bg-[#e9f0f5] p-5 sm:p-6">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-primary/65">System posture</p>
          <h2 className="mt-1 text-[17px] font-extrabold tracking-[-0.03em]">Reconciliation is steady.</h2>
          <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-lg border border-[#d4e1ea] bg-card/70 p-3"><p className="font-mono-ui text-[10px] text-muted-foreground">DARWIN</p><p className="mt-2 text-lg font-extrabold">Live</p><span className="mt-1 block text-[11px] text-[#398473]">Connected</span></div><div className="rounded-lg border border-[#d4e1ea] bg-card/70 p-3"><p className="font-mono-ui text-[10px] text-muted-foreground">TEACHOS</p><p className="mt-2 text-lg font-extrabold">Live</p><span className="mt-1 block text-[11px] text-[#398473]">Connected</span></div></div>
          <Link href="/uploads" data-testid="link-open-uploads" className="mt-5 inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline">Inspect source history <ArrowUpRight size={14} /></Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
          <div className="mb-5 flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Role mix</p><h2 className="mt-1 text-[17px] font-extrabold tracking-[-0.03em]">Most represented designations</h2></div><ArrowDownRight size={17} className="text-muted-foreground" /></div>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{dashboard.designations.slice(0, 6).map((item) => <div key={item.name} className="flex items-center justify-between border-b border-border/70 pb-3 text-[12px]"><span className="font-semibold">{item.name}</span><span className="font-mono-ui text-muted-foreground">{item.count}</span></div>)}</div>
        </div>
      </section>
    </div>}
  </div>;
}

function ClassificationStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'amber' | 'indigo' | 'muted' }) {
  const toneClass = tone === 'amber' ? 'text-[#8b6207]' : tone === 'indigo' ? 'text-[#4a4fb0]' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return <div className="rounded-lg border border-border/70 bg-[#f8fafb] p-3"><p className="font-mono-ui text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className={`mt-2 text-[20px] font-extrabold tracking-[-0.04em] ${toneClass}`}>{value}</p></div>;
}

function KpiCard({ label, value, meta, icon, tone, alert = false }: { label: string; value: string; meta: string; icon: React.ReactNode; tone: 'navy' | 'teal' | 'saffron' | 'coral'; alert?: boolean }) {
  const tones = { navy: 'bg-primary text-primary-foreground', teal: 'bg-[#dff0eb] text-[#256e65]', saffron: 'bg-accent text-accent-foreground', coral: 'bg-[#f6e4de] text-[#9b4434]' };
  return <div className={`relative overflow-hidden rounded-xl border border-border p-4 shadow-xs transition-transform hover:-translate-y-0.5 sm:p-5 ${tone === 'navy' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}><div className="flex items-start justify-between"><p className={`text-[11px] font-bold ${tone === 'navy' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{label}</p><span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span></div><p className="mt-5 text-[27px] font-extrabold tracking-[-0.06em]">{value}</p><p className={`mt-1 font-mono-ui text-[10px] uppercase tracking-[0.1em] ${tone === 'navy' ? 'text-primary-foreground/55' : alert ? 'text-[#a36b00]' : 'text-muted-foreground'}`}>{meta}</p></div>;
}