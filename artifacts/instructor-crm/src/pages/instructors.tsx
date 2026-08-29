import { useMemo, useState } from 'react';
import { AlertTriangle, Filter, Mail, Plus, Search, ShieldOff, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListInstructorsQueryKey, useCreateInstructor, useListInstructors } from '@workspace/api-client-react';
import type { Instructor, InstructorInput } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { PageIntro, EmptyState, QueryError, SkeletonBlock } from '@/components/ui-pieces';

const statusOptions = ['All statuses', 'Active', 'Exception', 'Exited', 'Pending'];

// TeachOS instructor-count classification filter — see
// artifacts/api-server/src/data/classificationOverrides.ts and
// TEACHOS_INSTRUCTOR_COUNT_RULES.md. Values match instructorsTable.classification exactly.
const classificationOptions: Array<{ value: string; label: string }> = [
  { value: 'All classifications', label: 'All classifications' },
  { value: 'excluded_other_department', label: 'Excluded — other department' },
  { value: 'excluded_non_department_team', label: 'Excluded — non-department team' },
  { value: 'payroll_converted', label: 'Payroll converted instructor' },
];

function statusLabel(instructor: Instructor) {
  return instructor.manual_status || instructor.computed_status || 'Pending';
}

function statusStyle(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('excluded')) return 'bg-secondary text-muted-foreground line-through decoration-2';
  if (normalized === 'payroll_converted' || normalized.includes('payroll')) return 'bg-[#e6e9fb] text-[#4a4fb0]';
  if (normalized.includes('active') || normalized.includes('match')) return 'bg-[#dff0eb] text-[#287469]';
  if (normalized.includes('exit') || normalized.includes('inactive')) return 'bg-[#f6e4de] text-[#9b4434]';
  if (normalized.includes('exception') || normalized.includes('mismatch')) return 'bg-[#fff1c9] text-[#8b6207]';
  return 'bg-secondary text-muted-foreground';
}

export default function InstructorsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [department, setDepartment] = useState('All departments');
  const [classification, setClassification] = useState('All classifications');
  const [exitFlaggedOnly, setExitFlaggedOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const params = useMemo(() => ({
    search: search || undefined,
    status: status === 'All statuses' ? undefined : status,
    sub_department: department === 'All departments' ? undefined : department,
    classification: classification === 'All classifications' ? undefined : classification,
    exit_flag: exitFlaggedOnly ? 'true' : undefined,
  }), [search, status, department, classification, exitFlaggedOnly]);
  const instructorsQuery = useListInstructors(params, { query: { queryKey: getListInstructorsQueryKey(params) } });
  const instructors = instructorsQuery.data ?? [];
  const departments = Array.from(new Set(instructors.map((item) => item.sub_department).filter(Boolean))) as string[];
  const filtersActive = search || status !== 'All statuses' || department !== 'All departments' || classification !== 'All classifications' || exitFlaggedOnly;

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro eyebrow="Workforce register / Darwin + TeachOS" title="Instructor records" description="Search the reconciled register, open a record, and resolve the small set of people who need a human decision." action={<button type="button" data-testid="button-add-instructor" onClick={() => setCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"><Plus size={15} /> Add instructor</button>} />

    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs lg:flex-row lg:items-center">
      <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, employee ID, email..." data-testid="input-search-instructors" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/25" /></div>
      <div className="flex flex-wrap gap-2">
        <div className="relative"><Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><select value={status} onChange={(event) => setStatus(event.target.value)} data-testid="select-filter-status" className="h-10 appearance-none rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] font-semibold outline-none focus:border-primary"><option>{statusOptions[0]}</option>{statusOptions.slice(1).map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="relative"><SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><select value={department} onChange={(event) => setDepartment(event.target.value)} data-testid="select-filter-department" className="h-10 max-w-[190px] appearance-none rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] font-semibold outline-none focus:border-primary"><option>All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="relative"><ShieldOff size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><select value={classification} onChange={(event) => setClassification(event.target.value)} data-testid="select-filter-classification" className="h-10 max-w-[220px] appearance-none rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] font-semibold outline-none focus:border-primary">{classificationOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <button type="button" data-testid="button-toggle-exit-flagged" onClick={() => setExitFlaggedOnly((current) => !current)} aria-pressed={exitFlaggedOnly} className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-bold transition-colors ${exitFlaggedOnly ? 'border-[#c99a3a] bg-[#fff7db] text-[#79601a]' : 'border-border bg-background text-muted-foreground hover:bg-secondary'}`}><AlertTriangle size={14} /> Exit-flagged only</button>
      </div>
      {filtersActive && <button type="button" data-testid="button-clear-filters" onClick={() => { setSearch(''); setStatus('All statuses'); setDepartment('All departments'); setClassification('All classifications'); setExitFlaggedOnly(false); }} className="inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-[12px] font-bold text-muted-foreground hover:bg-secondary hover:text-foreground"><X size={14} /> Clear</button>}
    </div>

    <div className="mb-4 flex items-center justify-between"><p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><span data-testid="text-instructor-count">{instructors.length}</span> records in view</p><span className="font-mono-ui text-[10px] text-muted-foreground">SORTED BY · NAME</span></div>

    {instructorsQuery.isLoading && <div className="overflow-hidden rounded-xl border border-border bg-card"><div className="space-y-3 p-4">{[1, 2, 3, 4, 5].map((item) => <SkeletonBlock key={item} className="h-12" />)}</div></div>}
    {instructorsQuery.isError && <QueryError message="The instructor register could not be loaded." />}
    {!instructorsQuery.isLoading && !instructorsQuery.isError && instructors.length === 0 && <EmptyState title="No instructors match this view" description="Try a broader search or clear one of the register filters." />}
    {!instructorsQuery.isLoading && !instructorsQuery.isError && instructors.length > 0 && <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="hidden grid-cols-[minmax(230px,1.6fr)_minmax(120px,.8fr)_minmax(140px,1fr)_minmax(120px,.8fr)_minmax(150px,.9fr)_40px] gap-4 border-b border-border bg-[#f4f7f9] px-5 py-3.5 text-left font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground lg:grid"><span>Instructor</span><span>Employee ID</span><span>Department</span><span>TeachOS</span><span>Status</span><span /></div>
      <div>{instructors.map((instructor) => <InstructorRow key={instructor.id} instructor={instructor} />)}</div>
    </div>}
    {createOpen && <CreateInstructorDialog onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: getListInstructorsQueryKey(params) }); }} />}
  </div>;
}

function InstructorRow({ instructor }: { instructor: Instructor }) {
  const status = statusLabel(instructor);
  return <Link href={`/instructors/${instructor.id}`} data-testid={`link-instructor-${instructor.id}`} className="group grid gap-3 border-b border-border/70 px-4 py-4 transition-colors last:border-0 hover:bg-[#f8fafb] lg:grid-cols-[minmax(230px,1.6fr)_minmax(120px,.8fr)_minmax(140px,1fr)_minmax(120px,.8fr)_minmax(150px,.9fr)_40px] lg:items-center lg:gap-4 lg:px-5">
    <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e1eaf1] text-[11px] font-extrabold text-primary">{instructor.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="min-w-0"><span className="block truncate text-[13px] font-bold text-foreground">{instructor.full_name}</span><span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground"><Mail size={11} /> {instructor.org_email || 'No email recorded'}</span></span></div>
    <div className="hidden font-mono-ui text-[11px] text-muted-foreground lg:block">{instructor.employee_id || '—'}</div>
    <div className="hidden text-[12px] text-muted-foreground lg:block">{instructor.sub_department || instructor.department || 'Unassigned'}</div>
    <div className="flex items-center gap-2 text-[12px] lg:block">{instructor.in_teachos ? <span className="inline-flex items-center gap-1.5 font-semibold text-[#287469]"><i className="h-1.5 w-1.5 rounded-full bg-[#4ab19a]" /> Active</span> : <span className="text-muted-foreground">No access</span>}<span className="ml-2 text-[11px] text-muted-foreground lg:hidden">{instructor.employee_id || 'No employee ID'}</span></div>
    <div className="flex flex-wrap items-center gap-1.5">
      <span data-testid={`status-instructor-${instructor.id}`} className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${statusStyle(status)}`}>{status}</span>
      {instructor.exit_flag && <span title={instructor.exit_flag_status || 'Exit record on file'} className="inline-flex items-center gap-1 rounded-full bg-[#fff1c9] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.06em] text-[#8b6207]"><AlertTriangle size={10} /> {instructor.exit_flag_status || 'Exit flagged'}</span>}
    </div>
    <div className="hidden text-right text-muted-foreground transition-transform group-hover:translate-x-1 lg:block">→</div>
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
