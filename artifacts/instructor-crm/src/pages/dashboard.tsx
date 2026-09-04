import { ArrowDownRight, ArrowUpRight, Briefcase, ChevronDown, ChevronUp, GraduationCap, Download, RefreshCw, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useGetDashboard, getGetDashboardQueryKey, useGetReportsInstructors, getGetReportsInstructorsQueryKey } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { PageIntro, QueryError, SkeletonBlock } from '@/components/ui-pieces';

// Same query keys the Darwin/TeachOS Breakdown pages use for these two
// endpoints -- sharing the cache key means visiting either breakdown tab
// (or this one) reuses the same fetch instead of re-requesting it.
type TeachosBreakdownSummary = { total_active: number; matched_with_darwin: { count: number }; not_mapped: { payroll_converted: { count: number } } };
type DarwinBreakdownSummary = { total_darwin_instructors_dept: number };

function useTeachosBreakdownSummary() {
  return useQuery<TeachosBreakdownSummary>({
    queryKey: ['reports', 'teachos-breakdown'],
    queryFn: async () => {
      const response = await fetch('/api/reports/teachos-breakdown');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

function useDarwinBreakdownSummary() {
  return useQuery<DarwinBreakdownSummary>({
    queryKey: ['reports', 'darwin-breakdown'],
    queryFn: async () => {
      const response = await fetch('/api/reports/darwin-breakdown');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

function formatKpi(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

type ReportInstructor = { full_name: string; employee_id: string | null; is_payroll: boolean; department: string | null; dept_area: string | null; institutes: string[]; manager: string | null };

function downloadInstructorsCsv(instructors: ReportInstructor[]) {
  const headers = ['Full Name', 'Employee ID', 'Payroll?', 'Department', 'Area', 'Campus', 'Manager'];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = instructors.map((p) => [
    p.full_name,
    p.employee_id ?? '',
    p.is_payroll ? 'Payroll' : 'Nxtwave',
    p.department ?? '',
    p.dept_area ?? '',
    p.institutes.join('; '),
    p.manager ?? '',
  ]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `instructor_details_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const dashboardQuery = useGetDashboard();
  const reportQuery = useGetReportsInstructors();
  const teachosBreakdownQuery = useTeachosBreakdownSummary();
  const darwinBreakdownQuery = useDarwinBreakdownSummary();
  const report = reportQuery.data;
  const teachosSummary = teachosBreakdownQuery.data;
  const darwinSummary = darwinBreakdownQuery.data;
  const sourceCountsLoading = teachosBreakdownQuery.isLoading || darwinBreakdownQuery.isLoading;
  const sourceCountsError = teachosBreakdownQuery.isError || darwinBreakdownQuery.isError;
  const [showInstructorDetails, setShowInstructorDetails] = useState(false);
  const dashboard = dashboardQuery.data;
  const kpis = dashboard?.kpis ?? {};
  const maxTrend = Math.max(...(dashboard?.monthly_trend ?? []).flatMap((item) => [item.joiners, item.exits]), 1);
  const maxDept = Math.max(...(dashboard?.sub_departments ?? []).map((item) => item.count), 1);

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro eyebrow="Command center / 09:42 IST" title="Faculty Command Center (FCC)" description="A clear read on the instructor workforce, source integrity, and the exceptions worth your attention." action={<button type="button" data-testid="button-refresh-dashboard" onClick={() => { queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetReportsInstructorsQueryKey() }); }} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh data</button>} />

    {/* 1. KPI row — leads the page, ahead of the instructor-count banner.
        Three headline counts, each anchored on Darwin's own department data
        (see reports.ts /reports/instructors): Instructors (matched with
        Darwin directly, plus confirmed payroll-converted), Mentors (Darwin's
        "Mentors" department), Operations team (Darwin's "Delivery Support
        (Ops and Central Managers)" department). */}
    {reportQuery.isLoading && <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">{[1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div>}
    {reportQuery.isError && <div className="mb-5"><QueryError message="Dashboard data is unavailable right now." /></div>}
    {report && <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 animate-rise">
      <KpiCard label="Instructors" value={formatKpi(report.kpis.total_instructor_count)} meta="Matched with Darwin + payroll" icon={<UsersRound size={17} />} tone="navy" />
      <KpiCard label="Mentors" value={formatKpi(report.kpis.mentors_count)} meta="Darwin — Mentors department" icon={<GraduationCap size={17} />} tone="teal" />
      <KpiCard label="Operations team" value={formatKpi(report.kpis.ops_team_count)} meta="Darwin — Delivery Support (Ops)" icon={<Briefcase size={17} />} tone="coral" />
    </section>}

    {/* 2. Standing-rule banner — the instructor-count drill-down. */}
    <section className="mb-5 rounded-xl border border-primary bg-primary p-6 text-primary-foreground shadow-xs sm:p-7">
      <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-primary-foreground/65">Standing rule / TeachOS instructor count</p>
      {reportQuery.isLoading && <div className="mt-3 h-12 w-40 animate-pulse rounded bg-primary-foreground/15" />}
      {reportQuery.isError && <p className="mt-3 text-[13px] text-primary-foreground/80">Total instructor count is unavailable right now.</p>}
      {report && <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
        <button
          type="button"
          data-testid="button-toggle-instructor-details"
          onClick={() => setShowInstructorDetails((value) => !value)}
          className="group flex items-center gap-3 text-left"
        >
          <div>
            <p className="text-[44px] font-extrabold leading-none tracking-[-0.05em] underline decoration-primary-foreground/30 decoration-2 underline-offset-8 transition-colors group-hover:decoration-primary-foreground">{formatKpi(report.kpis.total_instructor_count)}</p>
            <p className="mt-2 text-[13px] font-semibold text-primary-foreground/75">Total instructor count — click to see instructor details</p>
          </div>
          {showInstructorDetails ? <ChevronUp size={22} className="text-primary-foreground/70" /> : <ChevronDown size={22} className="text-primary-foreground/70" />}
        </button>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-[12px]">
          <div><p className="font-mono-ui uppercase tracking-[0.1em] text-primary-foreground/55">Total instructor count</p><p className="mt-1 text-[17px] font-bold">{formatKpi(report.kpis.total_instructor_count)}</p></div>
          <div><p className="font-mono-ui uppercase tracking-[0.1em] text-primary-foreground/55">Total mentor count</p><p className="mt-1 text-[17px] font-bold">{formatKpi(report.kpis.mentors_count)}</p></div>
          <div><p className="font-mono-ui uppercase tracking-[0.1em] text-primary-foreground/55">Ops team (excluded)</p><p className="mt-1 text-[17px] font-bold">{formatKpi(report.kpis.excluded_count)}</p></div>
          <div><p className="font-mono-ui uppercase tracking-[0.1em] text-primary-foreground/55">Payroll converted</p><p className="mt-1 text-[17px] font-bold">{formatKpi(report.kpis.payroll_count)}</p></div>
        </div>
      </div>}

      {/* Source vs. match counts -- Darwin data, TeachOS data, how many of
          TeachOS matched Darwin directly, and how many resolved to payroll. */}
      <div className="mt-6 border-t border-primary-foreground/15 pt-5">
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.1em] text-primary-foreground/55">Source data &amp; matching</p>
        {sourceCountsLoading && <div className="mt-3 h-16 w-full animate-pulse rounded bg-primary-foreground/15" />}
        {sourceCountsError && <p className="mt-3 text-[13px] text-primary-foreground/80">Source counts are unavailable right now.</p>}
        {!sourceCountsLoading && !sourceCountsError && <div className="mt-3 overflow-x-auto rounded-lg border border-primary-foreground/20">
          <table className="w-full min-w-[480px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-primary-foreground/20 bg-primary-foreground/5">
                <th className="px-4 py-2.5 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/60">Darwin data</th>
                <th className="px-4 py-2.5 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/60">TeachOS data</th>
                <th className="px-4 py-2.5 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/60">Matching count</th>
                <th className="px-4 py-2.5 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/60">Payroll count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-3 text-[19px] font-extrabold tracking-[-0.03em]">{formatKpi(darwinSummary?.total_darwin_instructors_dept)}</td>
                <td className="px-4 py-3 text-[19px] font-extrabold tracking-[-0.03em]">{formatKpi(teachosSummary?.total_active)}</td>
                <td className="px-4 py-3 text-[19px] font-extrabold tracking-[-0.03em]">{formatKpi(teachosSummary?.matched_with_darwin.count)}</td>
                <td className="px-4 py-3 text-[19px] font-extrabold tracking-[-0.03em]">{formatKpi(teachosSummary?.not_mapped.payroll_converted.count)}</td>
              </tr>
            </tbody>
          </table>
        </div>}
      </div>
      {report && showInstructorDetails && <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-semibold text-primary-foreground/75">{formatKpi(report.instructors.length)} instructors</p>
          <button
            type="button"
            data-testid="button-download-instructor-details"
            onClick={() => downloadInstructorsCsv(report.instructors)}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary-foreground/30 bg-primary-foreground/10 px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground transition-colors hover:bg-primary-foreground/20"
          >
            <Download size={13} /> Download CSV
          </button>
        </div>
        <div className="max-h-[420px] overflow-auto rounded-lg border border-primary-foreground/20 bg-card">
        <table className="w-full text-left text-[12px] text-foreground">
          <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Employee ID</th>
              <th className="px-3 py-2">Payroll?</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Campus</th>
              <th className="px-3 py-2">Manager</th>
            </tr>
          </thead>
          <tbody>
            {report.instructors.map((person) => <tr key={person.id} className="border-t border-border/70">
              <td className="px-3 py-2 font-semibold">{person.full_name}</td>
              <td className="px-3 py-2 font-mono-ui text-muted-foreground">{person.employee_id ?? '—'}</td>
              <td className="px-3 py-2">{person.is_payroll ? 'Payroll' : 'Nxtwave'}</td>
              <td className="px-3 py-2 text-muted-foreground">{person.dept_area ?? person.department ?? '—'}</td>
              <td className="px-3 py-2 text-muted-foreground">{person.institutes.join(', ') || '—'}</td>
              <td className="px-3 py-2 text-muted-foreground">{person.manager ?? '—'}</td>
            </tr>)}
          </tbody>
        </table>
        </div>
      </div>}
    </section>

    {dashboardQuery.isLoading && <div className="space-y-5"><SkeletonBlock className="h-[260px]" /><div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><SkeletonBlock className="h-[340px]" /><SkeletonBlock className="h-[340px]" /></div></div>}
    {dashboard && <div className="space-y-5 animate-rise">
      {/* 3. Glance row — system posture, classification breakdown, and role mix grouped into one row instead of two separate two-column grids. */}
      <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr_1fr]">
        <div className="rounded-xl border border-border bg-[#e9f0f5] p-5 sm:p-6">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-primary/65">System posture</p>
          <h2 className="mt-1 text-[15px] font-extrabold tracking-[-0.03em]">Reconciliation is steady.</h2>
          <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-lg border border-[#d4e1ea] bg-card/70 p-3"><p className="font-mono-ui text-[10px] text-muted-foreground">DARWIN</p><p className="mt-2 text-lg font-extrabold">Live</p><span className="mt-1 block text-[11px] text-[#398473]">Connected</span></div><div className="rounded-lg border border-[#d4e1ea] bg-card/70 p-3"><p className="font-mono-ui text-[10px] text-muted-foreground">TEACHOS</p><p className="mt-2 text-lg font-extrabold">Live</p><span className="mt-1 block text-[11px] text-[#398473]">Connected</span></div></div>
          <Link href="/uploads" data-testid="link-open-uploads" className="mt-5 inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline">Inspect source history <ArrowUpRight size={14} /></Link>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
          <div className="mb-5 flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Standing rule / TeachOS instructor count</p><h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Classification breakdown</h2></div></div>
          <div className="grid grid-cols-2 gap-3">
            <ClassificationStat label="Counted as instructors" value={formatKpi(kpis.counted_as_instructors)} />
            <ClassificationStat label="Active, no exit record" value={formatKpi(kpis.active_no_exit_record)} />
            <ClassificationStat label="Exit-flagged" value={formatKpi(kpis.exit_flagged)} tone="amber" />
            <ClassificationStat label="Payroll converted" value={formatKpi(kpis.payroll_converted)} tone="indigo" />
            <ClassificationStat label="Excluded (other dept)" value={formatKpi(kpis.excluded)} tone="muted" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
          <div className="mb-5 flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Role mix &middot; by subject area</p><h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Instructors by subject</h2></div><ArrowDownRight size={17} className="text-muted-foreground" /></div>
          {/* Grouped by classified subject area (Frontend/Backend/GenAI/...,
              English/Aptitude/Math), not raw designation title — an
              "Instructor" and a "Faculty Trainee" in the same department are
              both counted instructors in the same area, and showing them as
              separate line items understated each area's real headcount.
              Source: report.department.{tech,non_tech}.areas (same
              classification the Subject filter on Instructor Details uses),
              not dashboard.designations. */}
          <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
            {[...(report?.department?.tech?.areas ?? []), ...(report?.department?.non_tech?.areas ?? [])]
              .sort((a, b) => b.count - a.count)
              .map((item) => <div key={item.area} className="flex items-center justify-between border-b border-border/70 pb-2.5 text-[12px]"><span className="font-semibold">{item.area}</span><span className="font-mono-ui text-muted-foreground">{item.count}</span></div>)}
          </div>
        </div>
      </section>

      {/* 4. Charts row — movement + sub-department, kept together as the two visual/chart blocks. */}
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
          <div className="mb-6 flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Distribution &middot; {dashboard.sub_departments.length} groups</p><h2 className="mt-1 text-[17px] font-extrabold tracking-[-0.03em]">By sub-department</h2></div><Link href="/instructors" data-testid="link-view-instructors-distribution" className="text-muted-foreground hover:text-foreground"><ArrowUpRight size={17} /></Link></div>
          <div className="max-h-[280px] space-y-5 overflow-y-auto pr-1">{dashboard.sub_departments.map((item, index) => <div key={item.name}><div className="mb-2 flex justify-between text-[12px]"><span className="font-semibold">{item.name}</span><span className="font-mono-ui text-muted-foreground">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${index === 0 ? 'bg-primary' : index === 1 ? 'bg-[#5a9b9a]' : index === 2 ? 'bg-accent' : 'bg-[#9fb4c9]'}`} style={{ width: `${(item.count / maxDept) * 100}%` }} /></div></div>)}</div>
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
