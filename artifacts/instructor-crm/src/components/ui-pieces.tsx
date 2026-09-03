import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, CircleCheck, LoaderCircle } from 'lucide-react';

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
    <div>
      <p className="font-mono-ui mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <h1 className="text-[28px] font-extrabold tracking-[-0.045em] text-foreground sm:text-[34px]">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">{description}</p>}
    </div>
    {action}
  </div>;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-secondary ${className}`} />;
}

export function QueryError({ message = 'We could not load this view.' }: { message?: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-[#e8b4aa] bg-[#fff6f3] p-8 text-center">
    <span className="grid h-10 w-10 place-items-center rounded-full bg-[#f8ded7] text-[#a94334]"><AlertTriangle size={18} /></span>
    <p className="mt-3 text-[14px] font-bold text-[#71342b]">{message}</p>
    <p className="mt-1 text-[12px] text-[#9b6258]">Try refreshing or check the source connection.</p>
  </div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-8 text-center">
    <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-muted-foreground"><CircleCheck size={18} /></span>
    <p className="mt-3 text-[14px] font-bold">{title}</p>
    <p className="mt-1 max-w-sm text-[12px] leading-5 text-muted-foreground">{description}</p>
  </div>;
}

export function SaveButton({ pending, children = 'Save changes' }: { pending: boolean; children?: React.ReactNode }) {
  return <button type="submit" disabled={pending} data-testid="button-save-changes" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-70">
    {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{children}
  </button>;
}

// --- Shared "breakdown" pieces (TeachOS Breakdown / Darwin tabs) ---------
//
// Both /api/reports/teachos-breakdown and /api/reports/darwin-breakdown
// return people via the same toApiCandidate() shape (reports.ts), so a
// single Candidate/Bucket type and a single set of KPI-tile + collapsible-
// table components serve either dashboard tab.

export function formatKpi(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

export function pct(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : '—';
}

export type Candidate = {
  id: number;
  full_name: string;
  employee_id: string | null;
  teachos_category: string | null;
  department: string | null;
  designation: string | null;
  dept_bucket: string | null;
  dept_area: string | null;
  classification: string | null;
  classification_reason: string | null;
  notes: string | null;
};

export type Bucket = { count: number; people: Candidate[] };

export type StatTone = 'navy' | 'teal' | 'saffron' | 'indigo' | 'green' | 'muted' | 'amber';

export function TopStat({ label, value, meta, icon, tone, alert = false }: { label: string; value: string; meta: string; icon: React.ReactNode; tone: StatTone; alert?: boolean }) {
  const tones: Record<StatTone, string> = {
    navy: 'bg-primary text-primary-foreground',
    teal: 'bg-[#dff0eb] text-[#256e65]',
    saffron: 'bg-accent text-accent-foreground',
    indigo: 'bg-[#e3e4fa] text-[#4a4fb0]',
    green: 'bg-[#dcf0ea] text-[#287469]',
    muted: 'bg-secondary text-muted-foreground',
    amber: 'bg-[#f7e9cf] text-[#8b6207]',
  };
  return <div className={`relative overflow-hidden rounded-xl border border-border p-4 shadow-xs transition-transform hover:-translate-y-0.5 sm:p-5 ${tone === 'navy' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>
    <div className="flex items-start justify-between">
      <p className={`text-[11px] font-bold ${tone === 'navy' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{label}</p>
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span>
    </div>
    <p className="mt-5 text-[27px] font-extrabold tracking-[-0.06em]">{value}</p>
    <p className={`mt-1 font-mono-ui text-[10px] uppercase tracking-[0.1em] ${tone === 'navy' ? 'text-primary-foreground/55' : alert ? 'text-[#a36b00]' : 'text-muted-foreground'}`}>{meta}</p>
  </div>;
}

export function MiniStat({ label, value, meta, tone }: { label: string; value: number; meta: string; tone: StatTone }) {
  const toneTextClass: Record<StatTone, string> = {
    navy: 'text-primary',
    teal: 'text-[#256e65]',
    saffron: 'text-accent-foreground',
    indigo: 'text-[#4a4fb0]',
    green: 'text-[#287469]',
    muted: 'text-muted-foreground',
    amber: 'text-[#8b6207]',
  };
  return <div className="rounded-lg border border-border/70 bg-[#f8fafb] p-3.5">
    <p className="font-mono-ui text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    <p className={`mt-2 text-[22px] font-extrabold tracking-[-0.04em] ${toneTextClass[tone]}`}>{formatKpi(value)}</p>
    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{meta}</p>
  </div>;
}

export type CandidateColumn = 'name' | 'employee_id' | 'category' | 'darwin_dept' | 'designation' | 'dept_area' | 'reason';

const COLUMN_LABELS: Record<CandidateColumn, string> = {
  name: 'Name',
  employee_id: 'Employee ID',
  category: 'TeachOS category',
  darwin_dept: 'Darwin department',
  designation: 'Designation',
  dept_area: 'Area',
  reason: 'Reason',
};

export function BucketPanel({ title, subtitle, icon, bucket, emptyLabel, columns, defaultOpen }: { title: string; subtitle: string; icon: React.ReactNode; bucket: Bucket; emptyLabel: string; columns: CandidateColumn[]; defaultOpen: boolean }) {
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
                  {column === 'designation' && (person.designation ?? '—')}
                  {column === 'dept_area' && (person.dept_area ?? '—')}
                  {column === 'reason' && (person.classification_reason ?? person.notes ?? '—')}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>}
    </div>}
  </section>;
}
