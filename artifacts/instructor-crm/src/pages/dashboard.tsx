import { Briefcase, GraduationCap, RefreshCw, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { useGetReportsInstructors, getGetReportsInstructorsQueryKey, type AccessSplit, type InstructorSummary } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageIntro, QueryError, SkeletonBlock } from '@/components/ui-pieces';

function formatKpi(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

type AccessCardKey = 'instructors' | 'mentors' | 'ops_team';
type AccessTabKey = 'darwin_only' | 'both' | 'teachos_only';

const ACCESS_CARD_LABELS: Record<AccessCardKey, string> = {
  instructors: 'Instructors',
  mentors: 'Mentors',
  ops_team: 'Operations team',
};

const ACCESS_TABS: { key: AccessTabKey; label: string }[] = [
  { key: 'darwin_only', label: 'Only Darwin' },
  { key: 'both', label: 'Both' },
  { key: 'teachos_only', label: 'Only TeachOS' },
];

// The Overview tab is deliberately just these 3 cards (2026-09-04, per
// request -- everything else that used to live here, the standing-rule
// banner, source-match table, classification/role-mix glance row, and the
// movement/sub-department charts, was removed): Instructors (matched with
// Darwin directly, plus confirmed payroll-converted), Mentors (Darwin's
// "Mentors" department), Operations team (Darwin's "Delivery Support (Ops
// and Central Managers)" department, individual Ops overrides included).
// Clicking a card opens an access drill-down below it: three buttons --
// Only Darwin / Both / Only TeachOS -- each showing that bucket's actual
// people (see access_breakdown in reports.ts /reports/instructors).
export default function DashboardPage() {
  const queryClient = useQueryClient();
  const reportQuery = useGetReportsInstructors();
  const report = reportQuery.data;
  const [activeAccessCard, setActiveAccessCard] = useState<AccessCardKey | null>(null);
  const [activeAccessTab, setActiveAccessTab] = useState<AccessTabKey>('both');
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
      description="Instructors, Mentors, and Operations team -- each broken down by which system actually has access: Darwin only, TeachOS only, or both."
      action={<button type="button" data-testid="button-refresh-dashboard" onClick={() => queryClient.invalidateQueries({ queryKey: getGetReportsInstructorsQueryKey() })} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh data</button>}
    />

    {reportQuery.isLoading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-[126px]" />)}</div>}
    {reportQuery.isError && <QueryError message="Dashboard data is unavailable right now." />}
    {report && <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 animate-rise">
      <KpiCard label="Instructors" value={formatKpi(report.kpis.total_instructor_count)} meta="Matched with Darwin + payroll" icon={<UsersRound size={17} />} tone="navy" breakdown={report.access_breakdown?.instructors} active={activeAccessCard === 'instructors'} onClick={() => toggleAccessCard('instructors')} />
      <KpiCard label="Mentors" value={formatKpi(report.kpis.mentors_count)} meta="Darwin — Mentors department" icon={<GraduationCap size={17} />} tone="teal" breakdown={report.access_breakdown?.mentors} active={activeAccessCard === 'mentors'} onClick={() => toggleAccessCard('mentors')} />
      <KpiCard label="Operations team" value={formatKpi(report.kpis.ops_team_count)} meta="Darwin — Delivery Support (Ops)" icon={<Briefcase size={17} />} tone="coral" breakdown={report.access_breakdown?.ops_team} active={activeAccessCard === 'ops_team'} onClick={() => toggleAccessCard('ops_team')} />
    </section>}

    {report && activeAccessCard && <AccessDrilldown
      label={ACCESS_CARD_LABELS[activeAccessCard]}
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
      <div><p className={`font-mono-ui text-[9px] uppercase tracking-[0.07em] ${onNavy ? 'text-primary-foreground/55' : 'text-muted-foreground'}`}>Darwin only</p><p className="mt-1 text-[15px] font-bold tracking-[-0.02em]">{formatKpi(breakdown.darwin_only?.count)}</p></div>
      <div><p className={`font-mono-ui text-[9px] uppercase tracking-[0.07em] ${onNavy ? 'text-primary-foreground/55' : 'text-muted-foreground'}`}>Both</p><p className="mt-1 text-[15px] font-bold tracking-[-0.02em]">{formatKpi(breakdown.both?.count)}</p></div>
      <div><p className={`font-mono-ui text-[9px] uppercase tracking-[0.07em] ${onNavy ? 'text-primary-foreground/55' : 'text-muted-foreground'}`}>TeachOS only</p><p className="mt-1 text-[15px] font-bold tracking-[-0.02em]">{formatKpi(breakdown.teachos_only?.count)}</p></div>
    </div>}
    <p className={`mt-3 text-[10px] font-bold uppercase tracking-[0.08em] ${onNavy ? 'text-primary-foreground/70' : 'text-primary'}`}>{active ? 'Hide people list ▲' : 'View people list ▼'}</p>
  </button>;
}

function AccessDrilldown({ label, split, tab, onTabChange, onClose }: {
  label: string;
  split?: AccessSplit;
  tab: AccessTabKey;
  onTabChange: (tab: AccessTabKey) => void;
  onClose: () => void;
}) {
  const bucket = split?.[tab];
  const people: InstructorSummary[] = bucket?.people ?? [];
  return <section className="mt-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6 animate-rise">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">{label} — by data source</p>
        <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.03em]">Who has access where</h2>
      </div>
      <button type="button" data-testid="button-close-access-drilldown" onClick={onClose} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
        <X size={13} /> Close
      </button>
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
          {t.label} <span className="ml-1 font-mono-ui opacity-75">{formatKpi(split?.[t.key]?.count)}</span>
        </button>;
      })}
    </div>
    <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-secondary font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Employee ID</th>
            <th className="px-3 py-2">Department</th>
            <th className="px-3 py-2">Campus</th>
            <th className="px-3 py-2">Manager</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => <tr key={p.id} className="border-t border-border/70">
            <td className="px-3 py-2 font-semibold">{p.full_name}</td>
            <td className="px-3 py-2 font-mono-ui text-muted-foreground">{p.employee_id ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.dept_area ?? p.department ?? '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.institutes?.join(', ') || '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.manager ?? '—'}</td>
          </tr>)}
          {people.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No one in this bucket.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
