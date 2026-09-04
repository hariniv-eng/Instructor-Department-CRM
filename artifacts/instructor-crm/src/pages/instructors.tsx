import { useMemo, useState } from 'react';
import { Briefcase, GraduationCap, Plus, Search, UsersRound, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateInstructor, useGetReportsInstructors, getGetReportsInstructorsQueryKey } from '@workspace/api-client-react';
import type { AccessSplit, InstructorInput, InstructorSummary } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { PageIntro, EmptyState, QueryError, SkeletonBlock } from '@/components/ui-pieces';

type CategoryKey = 'instructors' | 'mentors' | 'ops_team';

// Each tab's people list is the same union of darwin_only + both + teachos_only
// that backs the matching Overview KPI card's count -- so "165 Instructors" here
// always agrees with the "Instructors" number on the Overview tab. See
// artifacts/api-server/src/routes/reports.ts's accessBreakdown for the source.
const CATEGORY_TABS: { key: CategoryKey; label: string; icon: typeof UsersRound; description: string }[] = [
  { key: 'instructors', label: 'Instructors', icon: UsersRound, description: 'Everyone counted toward the TeachOS instructor count.' },
  { key: 'mentors', label: 'Mentors', icon: GraduationCap, description: 'Darwin — Mentors department.' },
  { key: 'ops_team', label: 'Operations team', icon: Briefcase, description: 'Darwin — Delivery Support (Ops), filed under Operations rather than Instructor or Mentor.' },
];

function formatCount(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

function mergedPeople(split: AccessSplit | undefined): InstructorSummary[] {
  if (!split) return [];
  const merged = [...(split.darwin_only?.people ?? []), ...(split.both?.people ?? []), ...(split.teachos_only?.people ?? [])];
  return merged.sort((a, b) => a.full_name.localeCompare(b.full_name));
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('');
}

export default function InstructorsPage() {
  const queryClient = useQueryClient();
  const reportQuery = useGetReportsInstructors();
  const report = reportQuery.data;
  const [category, setCategory] = useState<CategoryKey>('instructors');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const split = report?.access_breakdown?.[category];
  const allPeople = useMemo(() => mergedPeople(split), [split]);
  const people = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allPeople;
    return allPeople.filter((person) => person.full_name.toLowerCase().includes(query) || (person.employee_id ?? '').toLowerCase().includes(query) || (person.teachos_user_id ?? '').toLowerCase().includes(query));
  }, [allPeople, search]);

  const activeTab = CATEGORY_TABS.find((tab) => tab.key === category)!;

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="Workforce register / Darwin + TeachOS"
      title="Instructor records"
      description="Instructors, Mentors, and the Operations team -- each list is exactly who the matching Overview card counts."
      action={<button type="button" data-testid="button-add-instructor" onClick={() => setCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"><Plus size={15} /> Add instructor</button>}
    />

    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs lg:flex-row lg:items-center">
      <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Filter by category">
        {CATEGORY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = category === tab.key;
          return <button key={tab.key} type="button" data-testid={`button-category-${tab.key}`} onClick={() => setCategory(tab.key)} aria-pressed={isActive} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold transition-colors ${isActive ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon size={14} /> {tab.label}
            <span className="ml-1 font-mono-ui text-[10px] opacity-70">{formatCount(report?.kpis[tab.key === 'instructors' ? 'total_instructor_count' : tab.key === 'mentors' ? 'mentors_count' : 'ops_team_count'])}</span>
          </button>;
        })}
      </div>
      <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, employee ID, or TeachOS user ID..." data-testid="input-search-instructors" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/25" /></div>
    </div>

    <div className="mb-4 flex flex-col gap-1">
      <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><span data-testid="text-instructor-count">{people.length}</span> {activeTab.label.toLowerCase()} in view</p>
      <p className="text-[11px] text-muted-foreground">{activeTab.description}</p>
    </div>

    {reportQuery.isLoading && <div className="overflow-hidden rounded-xl border border-border bg-card"><div className="space-y-3 p-4">{[1, 2, 3, 4, 5].map((item) => <SkeletonBlock key={item} className="h-12" />)}</div></div>}
    {reportQuery.isError && <QueryError message="The instructor register could not be loaded." />}
    {!reportQuery.isLoading && !reportQuery.isError && people.length === 0 && <EmptyState title={`No ${activeTab.label.toLowerCase()} match this search`} description="Try a broader search or clear the search box." />}
    {!reportQuery.isLoading && !reportQuery.isError && people.length > 0 && <CategoryTable category={category} people={people} />}

    {createOpen && <CreateInstructorDialog onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: getGetReportsInstructorsQueryKey() }); }} />}
  </div>;
}

// Column set is per-category: Instructors get Subject + Payroll (the two
// things the user singled out for this bucket); Mentors get Subject instead
// of Payroll; Operations team gets Department in place of a subject, since
// ops rows aren't teaching one. Campus (the institutes list) is common to all three.
// Rows are Links (for click-through to the instructor detail page), so this
// uses a CSS grid rather than a real <table> -- an <a> can't be a direct
// child of <tbody> -- matching the grid-row pattern this page already used.
// Tailwind's build-time scanner only picks up class names it can find as
// complete literal text in the source, so each category's grid template is
// spelled out in full below rather than assembled from interpolated pieces
// -- a dynamically-built arbitrary-value class silently gets no CSS at all.
function gridColsClass(category: CategoryKey): string {
  if (category === 'instructors') return 'lg:grid-cols-[minmax(220px,1.6fr)_minmax(110px,.8fr)_minmax(140px,.9fr)_minmax(110px,.8fr)_minmax(160px,1.1fr)_minmax(90px,.7fr)]';
  if (category === 'mentors') return 'lg:grid-cols-[minmax(220px,1.6fr)_minmax(110px,.8fr)_minmax(140px,.9fr)_minmax(110px,.8fr)_minmax(200px,1.3fr)]';
  return 'lg:grid-cols-[minmax(220px,1.6fr)_minmax(110px,.8fr)_minmax(140px,.9fr)_minmax(170px,1fr)_minmax(200px,1.3fr)]';
}

function CategoryTable({ category, people }: { category: CategoryKey; people: InstructorSummary[] }) {
  const columns = gridColsClass(category);
  return <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
    <div className={`hidden gap-4 border-b border-border bg-[#f4f7f9] px-5 py-3.5 text-left font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground lg:grid ${columns}`}>
      <span>{category === 'ops_team' ? 'Team member' : category === 'mentors' ? 'Mentor' : 'Instructor'}</span>
      <span>Employee ID</span>
      <span>TeachOS User ID</span>
      <span>{category === 'ops_team' ? 'Department' : 'Subject'}</span>
      <span>Campus</span>
      {category === 'instructors' && <span>Payroll</span>}
    </div>
    <div>{people.map((person) => <PersonRow key={person.id} category={category} person={person} columns={columns} />)}</div>
  </div>;
}

function PersonRow({ category, person, columns }: { category: CategoryKey; person: InstructorSummary; columns: string }) {
  const campus = person.institutes && person.institutes.length > 0 ? person.institutes.join(', ') : '—';
  return <Link href={`/instructors/${person.id}`} data-testid={`link-instructor-${person.id}`} className={`group grid gap-3 border-b border-border/70 px-4 py-4 transition-colors last:border-0 hover:bg-[#f8fafb] lg:items-center lg:gap-4 lg:px-5 ${columns}`}>
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e1eaf1] text-[11px] font-extrabold text-primary">{initials(person.full_name)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-foreground">{person.full_name}</span>
        {person.designation && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{person.designation}</span>}
      </span>
    </div>
    <div className="font-mono-ui text-[11px] text-muted-foreground"><span className="text-muted-foreground/70 lg:hidden">Employee ID </span>{person.employee_id || '—'}</div>
    <div className="font-mono-ui text-[11px] text-muted-foreground"><span className="text-muted-foreground/70 lg:hidden">TeachOS User ID </span>{person.teachos_user_id || ''}</div>
    <div className="text-[12px] text-muted-foreground">{category === 'ops_team' ? (person.department || '—') : (person.dept_area || '—')}</div>
    <div className="text-[12px] text-muted-foreground">{campus}</div>
    {category === 'instructors' && <div>{person.is_payroll ? <span className="inline-flex rounded-full bg-[#e6e9fb] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#4a4fb0]">Payroll</span> : <span className="text-muted-foreground">—</span>}</div>}
  </Link>;
}

function CreateInstructorDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createInstructor = useCreateInstructor();
  const [form, setForm] = useState<InstructorInput>({ full_name: '', employee_id: '', org_email: '', sub_department: '', designation: '' });
  const setField = (field: keyof InstructorInput, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.full_name.trim()) return;
    createInstructor.mutate({ data: form }, { onSuccess: onCreated });
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#142238]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="create-instructor-title">
    <form onSubmit={submit} className="w-full max-w-[520px] rounded-2xl border border-border bg-card p-6 shadow-2xl animate-rise">
      <div className="flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">New record</p><h2 id="create-instructor-title" className="mt-1 text-[20px] font-extrabold tracking-[-0.04em]">Add instructor</h2></div><button type="button" aria-label="Close add instructor dialog" data-testid="button-close-create-instructor" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><X size={17} /></button></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required value={form.full_name} onChange={(value) => setField('full_name', value)} testId="input-new-full-name" />
        <Field label="Employee ID" value={form.employee_id || ''} onChange={(value) => setField('employee_id', value)} testId="input-new-employee-id" />
        <Field label="Work email" type="email" value={form.org_email || ''} onChange={(value) => setField('org_email', value)} testId="input-new-email" />
        <Field label="Sub-department" value={form.sub_department || ''} onChange={(value) => setField('sub_department', value)} testId="input-new-sub-department" />
        <Field label="Designation" value={form.designation || ''} onChange={(value) => setField('designation', value)} testId="input-new-designation" />
      </div>
      {createInstructor.isError && <p data-testid="status-create-error" className="mt-4 rounded-lg bg-[#fff0ec] px-3 py-2 text-[12px] font-semibold text-[#9b4434]">Could not create this record. Please try again.</p>}
      <div className="mt-7 flex justify-end gap-2"><button type="button" data-testid="button-cancel-create" onClick={onClose} className="rounded-lg px-4 py-2.5 text-[12px] font-bold text-muted-foreground hover:bg-secondary">Cancel</button><button type="submit" disabled={createInstructor.isPending} data-testid="button-submit-create" className="rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground disabled:opacity-60">{createInstructor.isPending ? 'Creating…' : 'Create record'}</button></div>
    </form>
  </div>;
}

function Field({ label, value, onChange, testId, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; testId: string; type?: string; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-foreground/75">{label}{required && <span className="ml-1 text-[#c34d39]">*</span>}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} data-testid={testId} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" /></label>;
}
