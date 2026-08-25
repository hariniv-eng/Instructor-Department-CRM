import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, FileText, Mail, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetInstructorQueryKey, getListInstructorsQueryKey, useGetInstructor, useUpdateInstructor } from '@workspace/api-client-react';
import type { InstructorUpdate } from '@workspace/api-client-react';
import { Link, useLocation, useParams } from 'wouter';
import { PageIntro, QueryError, SaveButton, SkeletonBlock } from '@/components/ui-pieces';

export default function InstructorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const instructorQuery = useGetInstructor(id, { query: { queryKey: getGetInstructorQueryKey(id), enabled: Number.isFinite(id) } });
  const updateInstructor = useUpdateInstructor();
  const instructor = instructorQuery.data;
  const [form, setForm] = useState<InstructorUpdate>({ manual_status: '', exit_date: '', converted_university_name: '', notes: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (instructor) setForm({ manual_status: instructor.manual_status || '', exit_date: instructor.exit_date || '', converted_university_name: instructor.converted_university_name || '', notes: instructor.notes || '' });
  }, [instructor]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    updateInstructor.mutate({ id, data: { manual_status: form.manual_status || null, exit_date: form.exit_date || null, converted_university_name: form.converted_university_name || null, notes: form.notes || null } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetInstructorQueryKey(id), updated);
        queryClient.invalidateQueries({ queryKey: getListInstructorsQueryKey() });
        setSaved(true);
      },
    });
  };

  if (instructorQuery.isLoading) return <div className="mx-auto max-w-[1200px]"><SkeletonBlock className="mb-7 h-28" /><div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><SkeletonBlock className="h-[450px]" /><SkeletonBlock className="h-[450px]" /></div></div>;
  if (instructorQuery.isError || !instructor) return <div className="mx-auto max-w-[1200px]"><QueryError message="This instructor record could not be loaded." /><Link href="/instructors" data-testid="link-back-instructors-error" className="mt-4 inline-flex items-center gap-2 text-[12px] font-bold text-primary hover:underline"><ArrowLeft size={14} /> Back to register</Link></div>;

  const status = instructor.manual_status || instructor.computed_status || 'Pending';
  return <div className="mx-auto max-w-[1200px]">
    <Link href="/instructors" data-testid="link-back-instructors" className="mb-6 inline-flex items-center gap-2 text-[12px] font-bold text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={14} /> Instructor register</Link>
    <PageIntro eyebrow={`Record / ${instructor.employee_id || `ID-${instructor.id}`}`} title={instructor.full_name} description={`${instructor.designation || 'Instructor'}${instructor.sub_department ? ` · ${instructor.sub_department}` : ''}`} action={<span data-testid="status-detail-record" className={`inline-flex w-fit rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${statusTone(status)}`}>{status}</span>} />
    <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
      <div className="space-y-5">
        <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e1eaf1] text-primary"><UserRound size={19} /></span><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Identity</p><h2 className="text-[16px] font-extrabold">Source record</h2></div></div>
          <div className="space-y-4"><InfoRow icon={<Mail size={14} />} label="Work email" value={instructor.org_email} testId="text-detail-email" /><InfoRow icon={<Phone size={14} />} label="Mobile" value={instructor.mobile} testId="text-detail-mobile" /><InfoRow icon={<CalendarDays size={14} />} label="Date of joining" value={formatDate(instructor.date_of_joining)} testId="text-detail-joining-date" /><InfoRow icon={<MapPin size={14} />} label="Location" value={[instructor.current_city, instructor.current_state].filter(Boolean).join(', ') || instructor.work_location} testId="text-detail-location" /><InfoRow icon={<Building2 size={14} />} label="Manager" value={instructor.direct_manager || instructor.teachos_manager} testId="text-detail-manager" /></div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
          <div className="mb-5 flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Access footprint</p><h2 className="text-[16px] font-extrabold">System signals</h2></div><ShieldCheck size={18} className="text-[#398473]" /></div>
          <div className="grid grid-cols-2 gap-3"><Signal label="Darwin" value={instructor.in_darwin ? 'Present' : 'Missing'} positive={instructor.in_darwin} /><Signal label="TeachOS" value={instructor.in_teachos ? 'Present' : 'Missing'} positive={instructor.in_teachos} /></div>
          <div className="mt-4 grid gap-3 text-[12px]"><InfoRow compact label="TeachOS role" value={instructor.teachos_role} testId="text-detail-teachos-role" /><InfoRow compact label="Category" value={instructor.teachos_category} testId="text-detail-teachos-category" /></div>
        </section>
      </div>
      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Operator review</p><h2 className="mt-1 text-[18px] font-extrabold tracking-[-0.03em]">Exception handling</h2><p className="mt-1 text-[12px] text-muted-foreground">Manual fields are preserved alongside source-derived status.</p></div><FileText size={18} className="text-muted-foreground" /></div>
        <div className="mt-7 space-y-5">
          <label className="block"><span className="mb-1.5 block text-[11px] font-bold">Manual status</span><select value={form.manual_status || ''} onChange={(event) => setForm((current) => ({ ...current, manual_status: event.target.value }))} data-testid="select-manual-status" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[12px] font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"><option value="">Use computed status</option><option value="Active">Active</option><option value="Exception">Exception</option><option value="Exited">Exited</option><option value="Pending">Pending</option></select></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-bold">Exit date</span><input type="date" value={form.exit_date || ''} onChange={(event) => setForm((current) => ({ ...current, exit_date: event.target.value }))} data-testid="input-exit-date" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" /></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-bold">Converted university</span><input value={form.converted_university_name || ''} onChange={(event) => setForm((current) => ({ ...current, converted_university_name: event.target.value }))} data-testid="input-converted-university" placeholder="Add if this instructor has converted" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[12px] outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-ring/25" /></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-bold">Operator notes</span><textarea value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} data-testid="textarea-instructor-notes" rows={7} placeholder="Leave context for the next reviewer..." className="w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-[12px] leading-5 outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-ring/25" /></label>
        </div>
        {updateInstructor.isError && <p data-testid="status-update-error" className="mt-5 rounded-lg bg-[#fff0ec] px-3 py-2 text-[12px] font-semibold text-[#9b4434]">Save failed. The source record was not changed.</p>}
        {saved && <p data-testid="status-update-success" className="mt-5 flex items-center gap-2 rounded-lg bg-[#e5f3ed] px-3 py-2 text-[12px] font-semibold text-[#287469]"><CheckCircle2 size={15} /> Changes saved to the operator layer.</p>}
        <div className="mt-7 flex justify-end"><SaveButton pending={updateInstructor.isPending} /></div>
      </form>
    </div>
    <section className="mt-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Additional context</p><div className="mt-4 grid gap-4 text-[12px] sm:grid-cols-3"><InfoRow compact label="Workspace" value={instructor.workspace} testId="text-detail-workspace" /><InfoRow compact label="Institutes" value={instructor.institutes?.join(', ')} testId="text-detail-institutes" /><InfoRow compact label="Darwin status" value={instructor.darwin_employee_status} testId="text-detail-darwin-status" /></div></section>
  </div>;
}

function InfoRow({ icon, label, value, testId, compact = false }: { icon?: React.ReactNode; label: string; value?: string | null; testId: string; compact?: boolean }) {
  return <div className={`flex ${compact ? 'items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0' : 'items-start gap-3'}`}><span className={`flex items-center gap-2 text-muted-foreground ${compact ? 'text-[11px]' : 'text-[12px]'}`}>{icon && <span className="text-muted-foreground/80">{icon}</span>}{label}</span><span data-testid={testId} className={`text-right font-semibold ${compact ? 'max-w-[62%] text-[11px]' : 'max-w-[65%] text-[12px]'}`}>{value || 'Not recorded'}</span></div>;
}

function Signal({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return <div className={`rounded-lg border p-3 ${positive ? 'border-[#b9dfd1] bg-[#eff8f4]' : 'border-[#ebcbc4] bg-[#fff5f2]'}`}><div className="flex items-center justify-between"><span className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span><span className={`h-2 w-2 rounded-full ${positive ? 'bg-[#4ab19a]' : 'bg-[#d45e47]'}`} /></div><p className={`mt-2 text-[13px] font-extrabold ${positive ? 'text-[#287469]' : 'text-[#9b4434]'}`}>{value}</p></div>;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes('active') || value.includes('match')) return 'bg-[#dff0eb] text-[#287469]';
  if (value.includes('exit') || value.includes('inactive')) return 'bg-[#f6e4de] text-[#9b4434]';
  if (value.includes('exception') || value.includes('mismatch')) return 'bg-[#fff1c9] text-[#8b6207]';
  return 'bg-secondary text-muted-foreground';
}