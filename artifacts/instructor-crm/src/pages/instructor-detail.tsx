import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldOff } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetInstructorQueryKey, getListInstructorsQueryKey, useGetInstructor, useUpdateInstructor } from '@workspace/api-client-react';
import type { InstructorUpdate } from '@workspace/api-client-react';
import { Link, useParams } from 'wouter';
import { QueryError, SaveButton, SkeletonBlock } from '@/components/ui-pieces';
import { useAuth } from '@/hooks/use-auth';
import { COURSE_SEMESTER, SUBJECT_TRACK, subjectCompletion, type CourseStatus, type TrainingCourseDef, type TrainingStatsRow } from './training-stats';

// Instructor profile page (2026-10-16, per request: "showcase all the data we know about that instructor", design A of the three
// options on the design canvas -- a dark header band, four headline cards, then Teaching / Training by semester / Evaluations on the
// left and Profile / Systems / Admin review on the right). The identity fields and the admin form come from GET /instructors/:id as
// before; every figure comes from GET /reports/instructor-profile/:id (routes/reports.ts), worked out the same way as the Contribution
// and Training Stats tabs so the numbers match theirs.

type InstructorProfile = {
  id: number;
  subject_area: string | null;
  product: string;
  role: 'Instructor' | 'Mentor';
  is_payroll: boolean;
  gender: string | null;
  institutes: string[];
  date_of_joining: string | null;
  date_of_joining_source: string | null;
  date_of_exit: string | null;
  experience_years: number | null;
  deployment_date: string | null;
  training_days: number | null;
  teaching: {
    has_data: boolean;
    lecture_hours: number; practice_hours: number; other_hours: number; total_hours: number;
    lecture_sessions: number; practice_sessions: number; other_sessions: number; sessions_completed: number; session_days: number;
    all_batches: string[]; recent_batches: string[]; niat_cohorts: string[];
  };
  learning: { hours: number; days: number };
  evaluations: {
    demo_hours: number; demo_count: number; demo_avg_hours: number | null; demo_avg_score: number | null;
    ai_hours: number; ai_count: number; ai_avg_hours: number | null; ai_avg_score: number | null;
  };
  workload: { total: number | null; hours_per_day: number | null; learning_per_day: number | null; eval_avg_hours: number | null };
  training: { has_data: boolean; taxonomy: TrainingCourseDef[]; courses: Record<string, CourseStatus>; course_progress: Record<string, number> };
};

function useInstructorProfile(id: number) {
  return useQuery<InstructorProfile>({
    queryKey: ['reports', 'instructor-profile', id],
    enabled: Number.isFinite(id),
    queryFn: async () => {
      const response = await fetch(`/api/reports/instructor-profile/${id}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

const CARD = 'rounded-xl bg-card p-4 shadow-[0_4px_16px_rgba(14,26,43,0.06)]';
const EYEBROW = 'font-mono-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5A6B80]';

export default function InstructorDetailPage() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  // Restores the Instructors tab's filters/search/category exactly as they were when this profile was opened (2026-09-28) -- PersonRow's
  // link encodes that state as a `back` query param; `cf:` prefix = opened from the Custom filter page (2026-10-07).
  const backParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('back') : null;
  const fromCustomFilter = !!backParam && backParam.startsWith('cf:');
  const customFilterQuery = fromCustomFilter ? backParam!.slice(3) : '';
  const backHref = fromCustomFilter
    ? `/instructors/custom-filter${customFilterQuery ? `?${customFilterQuery}` : ''}`
    : backParam ? `/instructors?${backParam}` : '/instructors';
  const backLabel = fromCustomFilter ? 'Custom filter' : 'Instructors';
  const queryClient = useQueryClient();
  const instructorQuery = useGetInstructor(id, { query: { queryKey: getGetInstructorQueryKey(id), enabled: Number.isFinite(id) } });
  const profileQuery = useInstructorProfile(id);
  const updateInstructor = useUpdateInstructor();
  const instructor = instructorQuery.data;
  const profile = profileQuery.data;
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

  const training = useMemo(() => trainingView(profile), [profile]);

  if (instructorQuery.isLoading) return <div className="mx-auto max-w-[1400px]"><SkeletonBlock className="mb-4 h-24" /><div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]"><SkeletonBlock className="h-[450px]" /><SkeletonBlock className="h-[450px]" /></div></div>;
  if (instructorQuery.isError || !instructor) return <div className="mx-auto max-w-[1280px]"><QueryError message="This instructor record could not be loaded." /><Link href={backHref} data-testid="link-back-instructors-error" className="mt-4 inline-flex items-center gap-2 text-[12px] font-bold text-primary hover:underline"><ArrowLeft size={14} /> Back to register</Link></div>;

  const status = instructor.manual_status || instructor.computed_status || 'Pending';
  const subject = profile?.subject_area ?? null;
  const location = [instructor.current_city, instructor.current_state].filter(Boolean).join(', ') || instructor.work_location;
  const teaching = profile?.teaching;
  const wl = profile?.workload;

  // Compact layout (2026-10-16, per request: "decrease the font size and the element size ... the name, the workload, the teaching
  // should be at one page, and the profile in the sidebar"): a slim header, small headline cards, and a right sidebar (Profile, Systems,
  // Admin review) that starts at the top of the page beside everything else.
  return <div className="mx-auto max-w-[1400px] pb-8">
    <Link href={backHref} data-testid="link-back-instructors" className="mb-2 inline-flex min-h-[36px] items-center gap-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={14} /> {backLabel}</Link>
    <div className="flex flex-wrap items-start gap-4">
    <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
    {/* Header band */}
    <header className="rounded-xl bg-[#0E1A2B] px-4 py-3.5 text-white">
      <div className="flex flex-wrap items-center gap-3.5">
        <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#1E3350] text-[17px] font-bold text-[#7EE2C4]">{initials(instructor.full_name)}</div>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
          <h1 className="truncate text-[20px] font-extrabold leading-tight tracking-[-0.01em]">{instructor.full_name}</h1>
          <p className="truncate text-[12px] text-[#B8C6D8]">{[instructor.designation || 'Instructor', subject].filter(Boolean).join(' · ')}</p>
          <p className="font-mono-ui text-[10px] tracking-[0.1em] text-[#8FA3BD]">{[instructor.employee_id || `ID-${instructor.id}`, instructor.teachos_user_id ? `TEACHOS ${instructor.teachos_user_id.slice(0, 4)}…${instructor.teachos_user_id.slice(-4)}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span data-testid="status-detail-record" className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${darkStatusTone(status)}`}>{status}</span>
          {profile && <Chip>{profile.product}</Chip>}
          {profile && <Chip>{profile.role}</Chip>}
          {profile && <Chip>{profile.is_payroll ? 'Payroll' : 'Nxtwave'}</Chip>}
          {user && <a href="#admin-review" data-testid="link-edit-record" className="ml-1 inline-flex min-h-[32px] items-center rounded-lg bg-[#7EE2C4] px-3 text-[12px] font-bold text-[#0E1A2B] transition-opacity hover:opacity-90">Edit record</a>}
        </div>
      </div>
    </header>

    {/* Headline cards */}
    <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Workload" value={wl?.total != null ? wl.total.toFixed(2) : '—'} testId="kpi-workload">
        {wl?.total ? <>
          <div className="flex h-1.5 overflow-hidden rounded bg-[#EEF1F5]" aria-hidden="true">
            <div style={{ width: `${((wl.hours_per_day ?? 0) / wl.total) * 100}%` }} className="bg-[#2B59C3]" />
            <div style={{ width: `${((wl.learning_per_day ?? 0) / wl.total) * 100}%` }} className="bg-[#E59A2F]" />
            <div style={{ width: `${((wl.eval_avg_hours ?? 0) / wl.total) * 100}%` }} className="bg-[#7E57C2]" />
          </div>
          <p className="text-[11px] text-[#5A6B80]">{num1(wl.hours_per_day ?? 0)} teaching + {num1(wl.learning_per_day ?? 0)} learning + {(wl.eval_avg_hours ?? 0).toFixed(2)} eval hrs / day</p>
        </> : <p className="text-[11px] text-[#5A6B80]">No session, learning or evaluation data yet</p>}
      </Kpi>
      <Kpi label="Hours taught" value={teaching ? num1(teaching.total_hours) : '—'} testId="kpi-hours">
        <p className="text-[11px] text-[#5A6B80]">{teaching?.has_data ? `${count(teaching.sessions_completed)} sessions over ${count(teaching.session_days)} days` : 'No completed sessions yet'}</p>
      </Kpi>
      <Kpi label={`Training${training.track ? ` · ${training.track}` : ''}`} value={training.overall !== null ? `${num1(training.overall)}%` : '—'} testId="kpi-training">
        {training.overall !== null && <div className="h-1.5 rounded bg-[#EEF1F5]" aria-hidden="true"><div className="h-1.5 rounded bg-[#1F8A70]" style={{ width: `${Math.min(100, training.overall)}%` }} /></div>}
        <p className="text-[11px] text-[#5A6B80]">{training.message ?? `${training.completed} of ${training.resolved} courses completed`}</p>
      </Kpi>
      <Kpi label="Experience" value={profile?.experience_years != null ? `${num1(profile.experience_years)} yrs` : '—'} testId="kpi-experience">
        <p className="text-[11px] text-[#5A6B80]">{[profile?.date_of_joining ? `Joined ${formatDate(profile.date_of_joining)}` : 'No joining date', profile?.training_days != null ? `deployed after ${profile.training_days} days` : null].filter(Boolean).join(' · ')}</p>
      </Kpi>
    </section>

    {profileQuery.isError && <p className="rounded-lg bg-[#fff0ec] px-3 py-2 text-[12px] font-semibold text-[#9b4434] sm:mx-5">The teaching, training and evaluation figures could not be loaded right now.</p>}

    {(instructor.classification || instructor.exit_flag) && <div className="flex flex-col gap-2">
      {instructor.classification && <div data-testid="banner-classification" className="flex items-start gap-2.5 rounded-xl border border-[#d8dce4] bg-[#f4f5fa] px-3 py-2 text-[12px] leading-5 text-[#4a4fb0]"><ShieldOff size={16} className="mt-0.5 shrink-0" /><span><strong className="font-extrabold">{classificationLabel(instructor.classification)}.</strong>{instructor.classification_reason ? ` ${instructor.classification_reason}` : ''}</span></div>}
      {instructor.exit_flag && <div data-testid="banner-exit-flag" className="flex items-start gap-2.5 rounded-xl border border-[#f0dca0] bg-[#fff7db] px-3 py-2 text-[12px] leading-5 text-[#79601a]"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span><strong className="font-extrabold">Darwinbox exit record on file{instructor.exit_flag_status ? ` — ${instructor.exit_flag_status}` : ''}.</strong> Flagged for review, not automatically removed from the instructor count.</span></div>}
    </div>}

        {/* Teaching */}
        <section className={CARD}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-extrabold">Teaching</h2>
            <span className="text-[11px] text-[#5A6B80]">All-time{profile?.deployment_date ? ` · first session ${formatDate(profile.deployment_date)}` : ''}</span>
          </div>
          {teaching?.has_data ? <>
            <div className="mt-3 flex flex-col gap-2">
              <HourBar label="Lecture" hours={teaching.lecture_hours} sessions={teaching.lecture_sessions} total={teaching.total_hours} color="bg-[#2B59C3]" />
              <HourBar label="Practice" hours={teaching.practice_hours} sessions={teaching.practice_sessions} total={teaching.total_hours} color="bg-[#5B85E0]" />
              <HourBar label="Other" hours={teaching.other_hours} sessions={teaching.other_sessions} total={teaching.total_hours} color="bg-[#A9BDEB]" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <MiniTile label="Avg sessions / day" value={teaching.session_days > 0 ? String(Math.round(teaching.sessions_completed / teaching.session_days)) : '—'} />
              <MiniTile label="Avg hrs / day" value={wl?.hours_per_day != null ? num1(wl.hours_per_day) : '—'} />
              <MiniTile label="Cohort" value={teaching.niat_cohorts.length ? teaching.niat_cohorts.join(', ') : '—'} />
            </div>
            {teaching.all_batches.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1">{teaching.all_batches.map((batch) => <span key={batch} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${teaching.recent_batches.includes(batch) ? 'bg-[#E6ECFA] text-[#2B4C9B]' : 'bg-[#F1F3F6] text-[#5A6B80]'}`}>{batch}</span>)}</div>}
          </> : <p className="mt-3 text-[12px] text-[#5A6B80]">{profile ? 'No completed sessions on file yet — this instructor may still be in training.' : 'Loading…'}</p>}
        </section>

        {/* Training by semester */}
        <section className={CARD}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-extrabold">Training by semester</h2>
            {training.track && <span className="text-[11px] text-[#5A6B80]">{training.track} track · {training.resolved} courses</span>}
          </div>
          {training.message
            ? <p className="mt-3 text-[12px] text-[#5A6B80]">{training.message}</p>
            : <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                {training.groups.map((group) => <div key={group.label} className="flex flex-col gap-1.5 rounded-lg border border-[#E2E7EE] p-3">
                  <div className="flex items-center justify-between"><strong className="text-[13px]">{group.label}</strong>{group.pct !== null && <span className={`font-mono-ui text-[12px] font-semibold ${pctTone(group.pct)}`}>{num1(group.pct)}%</span>}</div>
                  {group.courses.map((course) => <div key={course.key} className="flex items-center justify-between gap-3 text-[12px]"><span className="min-w-0 truncate">{course.label}</span><span className={`shrink-0 font-bold ${course.tone}`}>{course.text}</span></div>)}
                </div>)}
              </div>}
          {profile && <p className="mt-2.5 text-[11px] text-[#5A6B80]">Learning time: {profile.learning.days > 0 ? `${num1(profile.learning.hours)} h over ${count(profile.learning.days)} days · ${num1(wl?.learning_per_day ?? 0)} h / day` : 'none on file'}</p>}
        </section>

        {/* Evaluations */}
        <section className={CARD}>
          <h2 className="text-[15px] font-extrabold">Evaluations</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <EvalCard title="Demo" count={profile?.evaluations.demo_count ?? 0} hours={profile?.evaluations.demo_hours ?? 0} avgHours={profile?.evaluations.demo_avg_hours ?? null} score={profile?.evaluations.demo_avg_score ?? null} />
            <EvalCard title="AI assessment" count={profile?.evaluations.ai_count ?? 0} hours={profile?.evaluations.ai_hours ?? 0} avgHours={profile?.evaluations.ai_avg_hours ?? null} score={profile?.evaluations.ai_avg_score ?? null} />
          </div>
        </section>
    </div>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:sticky lg:top-4 lg:max-w-[340px]">
        {/* Profile */}
        <section className={CARD}>
          <h2 className="text-[14px] font-extrabold">Profile</h2>
          <dl className="mt-1.5">
            <Row label="Email" value={instructor.org_email} testId="text-detail-email" />
            <Row label="Mobile" value={instructor.mobile} testId="text-detail-mobile" />
            <Row label="Location" value={location} testId="text-detail-location" />
            <Row label="Campus" value={profile?.institutes.join(', ') || instructor.institutes?.join(', ')} testId="text-detail-institutes" />
            <Row label="Workspace" value={instructor.workspace} testId="text-detail-workspace" />
            <Row label="Capability Manager" value={instructor.teachos_manager} testId="text-detail-capability-manager" />
            <Row label="Darwin manager" value={instructor.direct_manager} testId="text-detail-darwin-manager" />
            <Row label="Date of joining" value={formatDate(profile?.date_of_joining ?? instructor.date_of_joining)} testId="text-detail-joining-date" />
            {profile?.date_of_exit && <Row label="Date of exit" value={formatDate(profile.date_of_exit)} testId="text-detail-date-of-exit" />}
            <Row label="Gender" value={profile?.gender} testId="text-detail-gender" />
          </dl>
        </section>

        {/* Systems */}
        <section className={CARD}>
          <h2 className="text-[14px] font-extrabold">Systems</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Signal label="Darwin" positive={instructor.in_darwin} />
            <Signal label="TeachOS" positive={instructor.in_teachos} />
          </div>
          <dl className="mt-1.5">
            <Row label="TeachOS role" value={instructor.teachos_role} testId="text-detail-teachos-role" />
            <Row label="Category" value={instructor.teachos_category} testId="text-detail-teachos-category" />
            <Row label="Darwin status" value={instructor.darwin_employee_status} testId="text-detail-darwin-status" />
            <Row label="Exit record" value={instructor.exit_flag ? `${instructor.exit_flag_status || 'On file'}${instructor.exit_flag_date ? ` · ${formatDate(instructor.exit_flag_date)}` : ''}` : 'None on file'} testId="text-detail-exit-flag-status" />
          </dl>
        </section>

        {/* Admin review */}
        {user
          ? <form id="admin-review" onSubmit={submit} className={`${CARD} scroll-mt-6`}>
              <h2 className="text-[14px] font-extrabold">Admin review</h2>
              <p className="mt-0.5 text-[11px] text-[#5A6B80]">Manual fields are kept alongside the source-derived status.</p>
              <div className="mt-3 flex flex-col gap-3">
                <label className="block"><span className="mb-1 block text-[11px] font-bold">Manual status</span><select value={form.manual_status || ''} onChange={(event) => setForm((current) => ({ ...current, manual_status: event.target.value }))} data-testid="select-manual-status" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"><option value="">Use computed status</option><option value="Active">Active</option><option value="Exception">Exception</option><option value="Exited">Exited</option><option value="Pending">Pending</option></select></label>
                <label className="block"><span className="mb-1 block text-[11px] font-bold">Exit date</span><input type="date" value={form.exit_date || ''} onChange={(event) => setForm((current) => ({ ...current, exit_date: event.target.value }))} data-testid="input-exit-date" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" /></label>
                <label className="block"><span className="mb-1 block text-[11px] font-bold">Converted university</span><input value={form.converted_university_name || ''} onChange={(event) => setForm((current) => ({ ...current, converted_university_name: event.target.value }))} data-testid="input-converted-university" placeholder="Add if this instructor has converted" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-ring/25" /></label>
                <label className="block"><span className="mb-1 block text-[11px] font-bold">Operator notes</span><textarea value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} data-testid="textarea-instructor-notes" rows={3} placeholder="Leave context for the next reviewer..." className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-[13px] leading-5 outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-ring/25" /></label>
              </div>
              {updateInstructor.isError && <p data-testid="status-update-error" className="mt-4 rounded-lg bg-[#fff0ec] px-3 py-2 text-[12px] font-semibold text-[#9b4434]">Save failed. The source record was not changed.</p>}
              {saved && <p data-testid="status-update-success" className="mt-4 flex items-center gap-2 rounded-lg bg-[#e5f3ed] px-3 py-2 text-[12px] font-semibold text-[#256e65]"><CheckCircle2 size={15} /> Changes saved.</p>}
              <div className="mt-3 flex justify-end"><SaveButton pending={updateInstructor.isPending} /></div>
            </form>
          // Manager view is read-only (no login) -- same four fields as plain text, since PATCH /instructors/:id is Admin-only.
          : <section className={CARD}>
              <h2 className="text-[14px] font-extrabold">Admin review</h2>
              <p className="mt-0.5 text-[11px] text-[#5A6B80]">Read-only in Manager view — sign in as Admin to edit.</p>
              <dl className="mt-1.5">
                <Row label="Manual status" value={form.manual_status} testId="text-detail-manual-status" />
                <Row label="Exit date" value={form.exit_date ? formatDate(form.exit_date) : null} testId="text-detail-form-exit-date" />
                <Row label="Converted university" value={form.converted_university_name} testId="text-detail-converted-university" />
                <Row label="Operator notes" value={form.notes} testId="text-detail-operator-notes" />
              </dl>
            </section>}
      </aside>
    </div>
  </div>;
}

// Training view: the instructor's own track (SUBJECT_TRACK, as on the Training Stats tab), its courses grouped by semester
// (COURSE_SEMESTER; courses in no semester under "Other courses"), each semester's % and the overall % scored exactly like
// Subject completion % there (subjectCompletion).
function trainingView(profile: InstructorProfile | undefined) {
  const empty = { track: null as string | null, overall: null as number | null, completed: 0, resolved: 0, groups: [] as { label: string; pct: number | null; courses: { key: string; label: string; text: string; tone: string }[] }[], message: null as string | null };
  if (!profile) return { ...empty, message: 'Loading…' };
  const track = profile.subject_area ? SUBJECT_TRACK[profile.subject_area] ?? null : null;
  if (!track) return { ...empty, message: profile.subject_area ? `${profile.subject_area} has no training courses tracked yet.` : 'No subject set for this instructor, so no training track to show.' };
  const defs = profile.training.taxonomy.filter((def) => def.trackGroup === track);
  const resolvedDefs = defs.filter((def) => def.courseTitles.length > 0 || (def.courseIds?.length ?? 0) > 0);
  const row = { has_training_data: profile.training.has_data, courses: profile.training.courses, course_progress: profile.training.course_progress } as unknown as TrainingStatsRow;
  if (!profile.training.has_data) return { ...empty, track, resolved: resolvedDefs.length, message: 'No training data synced for this instructor yet.' };
  const courseView = (def: TrainingCourseDef) => {
    const status = profile.training.courses[def.key] ?? 'NO_DATA';
    const progress = profile.training.course_progress[def.key];
    if (status === 'COMPLETED') return { key: def.key, label: def.label, text: progress !== undefined ? `Completed (${Math.round(progress)}%)` : 'Completed', tone: 'text-[#1F8A70]' };
    if (status === 'IN_PROGRESS') return { key: def.key, label: def.label, text: progress !== undefined ? `${Math.round(progress)}%` : 'In progress', tone: 'text-[#A06A10]' };
    if (status === 'NOT_STARTED') return { key: def.key, label: def.label, text: 'Not started', tone: 'text-[#5A6B80]' };
    if (status === 'PENDING_MAPPING') return { key: def.key, label: def.label, text: 'Mapping pending', tone: 'text-[#8A96A6]' };
    return { key: def.key, label: def.label, text: 'No data', tone: 'text-[#8A96A6]' };
  };
  const sems = [...new Set(defs.map((def) => COURSE_SEMESTER[def.key]).filter((sem): sem is number => sem !== undefined))].sort((a, b) => a - b);
  const groups = sems.map((sem) => {
    const semDefs = defs.filter((def) => COURSE_SEMESTER[def.key] === sem);
    return { label: `Sem ${sem}`, pct: subjectCompletion(row, semDefs), courses: semDefs.map(courseView) };
  });
  const others = defs.filter((def) => COURSE_SEMESTER[def.key] === undefined);
  if (others.length) groups.push({ label: sems.length ? 'Other courses' : 'Courses', pct: sems.length ? subjectCompletion(row, others) : null, courses: others.map(courseView) });
  return {
    track,
    overall: subjectCompletion(row, defs),
    completed: resolvedDefs.filter((def) => profile.training.courses[def.key] === 'COMPLETED').length,
    resolved: resolvedDefs.length,
    groups,
    message: null,
  };
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[#1E3350] px-2.5 py-1 text-[11px] font-bold text-[#CFDAE8]">{children}</span>;
}

function Kpi({ label, value, testId, children }: { label: string; value: string; testId: string; children?: React.ReactNode }) {
  return <div data-testid={testId} className="flex flex-col gap-1.5 rounded-xl bg-card p-3.5 shadow-[0_4px_16px_rgba(14,26,43,0.06)]">
    <p className={EYEBROW}>{label}</p>
    <p className="text-[22px] font-extrabold leading-none tabular-nums">{value}</p>
    {children}
  </div>;
}

function HourBar({ label, hours, sessions, total, color }: { label: string; hours: number; sessions: number; total: number; color: string }) {
  return <div className="grid grid-cols-[64px_minmax(0,1fr)_104px] items-center gap-2.5">
    <span className="text-[12px] font-bold">{label}</span>
    <div className="h-2 rounded bg-[#EEF1F5]" aria-hidden="true"><div className={`h-2 rounded ${color}`} style={{ width: `${total > 0 ? (hours / total) * 100 : 0}%` }} /></div>
    <span className="text-right font-mono-ui text-[11px] tabular-nums">{num1(hours)} h · {count(sessions)}</span>
  </div>;
}

function MiniTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-[#F5F7FA] px-3 py-2"><p className="text-[11px] text-[#5A6B80]">{label}</p><p className="truncate text-[15px] font-extrabold tabular-nums">{value}</p></div>;
}

function EvalCard({ title, count: n, hours, avgHours, score }: { title: string; count: number; hours: number; avgHours: number | null; score: number | null }) {
  return <div className="flex flex-col gap-1 rounded-lg bg-[#F3EFFB] px-3 py-2.5">
    <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5E3FA0]">{title}</p>
    <p className="text-[15px] font-extrabold">{n > 0 ? `${count(n)} evaluation${n === 1 ? '' : 's'}` : 'None yet'}</p>
    {n > 0 && <p className="text-[12px] text-[#3F4B5C]">{num1(hours)} h recorded · avg {avgHours !== null ? avgHours.toFixed(2) : '—'} h each{score !== null ? ` · score ${num1(score)} / 10` : ''}</p>}
  </div>;
}

function Row({ label, value, testId }: { label: string; value?: string | null; testId: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-[#EEF1F5] py-1.5 text-[12px] last:border-0">
    <dt className="shrink-0 text-[#5A6B80]">{label}</dt>
    <dd data-testid={testId} className="min-w-0 break-words text-right font-semibold">{value || <span className="font-normal text-[#8A96A6]">Not recorded</span>}</dd>
  </div>;
}

function Signal({ label, positive }: { label: string; positive: boolean }) {
  return <div className={`rounded-lg px-3 py-2 ${positive ? 'bg-[#E6F5EF]' : 'bg-[#FDECE7]'}`}>
    <p className={`font-mono-ui text-[10px] font-semibold uppercase tracking-[0.12em] ${positive ? 'text-[#1F6B57]' : 'text-[#9b4434]'}`}>{label}</p>
    <p className={`text-[13px] font-extrabold ${positive ? 'text-[#14503F]' : 'text-[#9b4434]'}`}>{positive ? 'Present' : 'Missing'}</p>
  </div>;
}

function initials(name: string) {
  return name.replace(/[^A-Za-z\s.]/g, '').split(/[\s.]+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '?';
}
const num1 = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const count = (value: number) => value.toLocaleString('en-IN');
const pctTone = (value: number) => (value >= 100 ? 'text-[#1F8A70]' : value > 0 ? 'text-[#A06A10]' : 'text-[#5A6B80]');

function formatDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function classificationLabel(value: string) {
  if (value === 'excluded_other_department') return 'Excluded — other department';
  if (value === 'excluded_non_department_team') return 'Excluded — non-department team';
  if (value === 'payroll_converted') return 'Payroll converted instructor';
  return value;
}

// Status chip colours for the dark header band.
function darkStatusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes('active') || value.includes('match')) return 'bg-[#123E36] text-[#7EE2C4]';
  if (value.includes('exit') || value.includes('inactive')) return 'bg-[#4A2219] text-[#FFB4A1]';
  if (value.includes('exception') || value.includes('mismatch')) return 'bg-[#4A3A10] text-[#FFD873]';
  return 'bg-[#1E3350] text-[#CFDAE8]';
}
