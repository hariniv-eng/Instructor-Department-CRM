import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { downloadCsv, toCsv } from '@/lib/csv';
import { MultiSelectFilter } from './instructors';

// "Deployed - Readiness" view of Training Stats (2026-11-25, per request: "a system for instructor readiness for the deployed instructors
// -- are they capable of taking the next semester or not", then "we need to add it to fcc now"). The in-training rules stay fixed; NIAT
// (Deployed) instructors are scored with them on the lectures and topin exams of the semester they teach NEXT (default) or NOW.
// One row per instructor x batch x subject: the subject(s) they teach that batch now, plus any other subject they have next-semester
// demos / AI assessments / topin exams for (blue chip, "other subject"). Expand a row for the course breakdown and the instructor's
// other subjects side by side. Show only. Server: GET /reports/deployed-readiness (connectors/deployedReadiness.ts).
type Colour = 'green' | 'yellow' | 'red' | 'none';
type Block = {
  has_lecture_list: boolean; lectures_total: number; demo_lectures: number; ai_lectures: number; both_lectures: number; complete: boolean;
  demo_avg: number | null; ai_avg: number | null; topn_avg: number | null; topn_exams: number;
  demo_colour: Colour; ai_colour: Colour; topn_colour: Colour; overall: 'green' | 'yellow' | 'red';
};
type Course = { key: string; title: string; semester: number | null; lectures_total: number; demo_lectures: number; ai_lectures: number; both_lectures: number; demo_avg: number | null; ai_avg: number | null };
type Source = 'teaching' | 'teaching (60 days)' | 'mapped subject' | 'other subject' | 'none';
type Row = {
  employee_id: string | null; full_name: string; capability_manager: string | null; role: 'Instructor' | 'Mentor' | 'No sessions'; role_days: number;
  // campuses / batches (2026-11-28): where they teach this semester; semester_from: the batches' current semester in the prod sequence, or the
  // NIAT cohort shortcut when they had no lectures; semester_end: the earliest end date of those batches' current semester.
  cohort: string; campuses: string[]; batches: string[]; semester_from: 'batch schedule' | 'cohort'; semester_end: string | null;
  current_sem: number; next_sem: number; subject: string; source: Source; evidence: string | null;
  lectures_30d: number; lectures_60d: number; current: Block | null; next: Block | null; courses: Course[];
};
type T = { green: number; yellow: number };
type Resp = { rows: Row[]; thresholds: { demo: T; ai: T; topn: T }; lecture_days: number; lecture_days_fallback: number; fetched_at: string };
type Which = 'next' | 'current';

const QUERY_KEY = ['reports', 'deployed-readiness'];
const NONE = '—';
const LABEL: Record<Colour, string> = { green: 'Green', yellow: 'Yellow', red: 'Red', none: 'No data' };
const CHIP: Record<Colour, string> = { green: 'bg-[#e5f3ed] text-[#256e65]', yellow: 'bg-[#fff5dc] text-[#8a6212]', red: 'bg-[#fff0ec] text-[#9b4434]', none: 'bg-secondary text-muted-foreground' };
const DOT: Record<Colour, string> = { green: 'bg-[#2f8f6b]', yellow: 'bg-[#d9a21b]', red: 'bg-[#c4553f]', none: 'bg-muted-foreground/40' };
const SOURCE_LABEL: Record<Source, string> = { teaching: 'Teaching now', 'teaching (60 days)': 'Teaching now', 'mapped subject': 'Mapped subject', 'other subject': 'Other subject', none: 'No subject' };
const th = 'whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
const td = 'whitespace-nowrap border-r border-border px-4 py-3 text-[12px]';
const f1 = (v: number | null, pct = false) => (v === null ? NONE : pct ? `${v.toFixed(1)}%` : v.toFixed(2));
const blockOf = (r: Row, w: Which) => (w === 'next' ? r.next : r.current);
const semOf = (r: Row, w: Which) => (w === 'next' ? r.next_sem : r.current_sem);
const catOf = (b: Block | null) => (b ? LABEL[b.overall] : 'Not scored');
const sourceLine = (r: Row, days: number, fallback: number) =>
  r.source === 'teaching' ? `teaching now · ${r.lectures_30d} lecture${r.lectures_30d === 1 ? '' : 's'} in ${days} days`
  : r.source === 'teaching (60 days)' ? `teaching · ${r.lectures_60d} lecture${r.lectures_60d === 1 ? '' : 's'} in ${fallback} days (none in ${days})`
  : r.source === 'other subject' ? `other subject · ${r.evidence ?? ''}`
  : r.source === 'mapped subject' ? `mapped subject (no lectures in ${fallback} days)` : 'no subject';

function Score({ v, c, sub, pct }: { v: number | null; c: Colour; sub: string; pct?: boolean }) {
  return <div className="mx-auto flex flex-col items-center gap-0.5">
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${CHIP[c]}`}>{f1(v, pct)}</span>
    <span className="text-[10px] text-muted-foreground">{sub}</span>
  </div>;
}
function Cat({ b, small }: { b: Block | null; small?: boolean }) {
  if (!b) return <span className={`rounded-full border border-border px-2 py-0.5 ${small ? 'text-[10px]' : 'text-[11px]'} font-semibold text-muted-foreground`} title="FCC has no lecture list for this subject in this semester">Not scored</span>;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${small ? 'text-[10px]' : 'text-[11px]'} font-bold ${CHIP[b.overall]}`}><span className={`h-2 w-2 rounded-full ${DOT[b.overall]}`} />{LABEL[b.overall]}</span>;
}
function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <div className="min-w-[110px]">
    <div className="flex justify-between text-[11px] tabular-nums"><span className="font-bold text-foreground">{done} / {total}</span><span className="text-muted-foreground">{pct}%</span></div>
    <div className="mt-1 h-1.5 rounded-full bg-secondary"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
  </div>;
}

function Rules({ t, days, fallback }: { t?: { demo: T; ai: T; topn: T }; days: number; fallback: number }) {
  const [open, setOpen] = useState(true);
  const d = t?.demo ?? { green: 7.5, yellow: 6.5 }, ai = t?.ai ?? { green: 8.5, yellow: 7.5 }, tn = t?.topn ?? { green: 75, yellow: 60 };
  const th = 'border-b border-border px-3 py-2 text-left text-[11px] font-bold';
  const td = 'border-b border-border/70 px-3 py-2 text-[12px] text-foreground';
  const rows: [string, string, string, string][] = [
    ['Demo QA score', `${d.green} or more`, `${d.yellow} to under ${d.green}`, `Under ${d.yellow} or none`],
    ['AI assessment score', `${ai.green} or more`, `${ai.yellow} to under ${ai.green}`, `Under ${ai.yellow} or none`],
    ['Top-N exam score', `${tn.green}% or more`, `${tn.yellow}% to under ${tn.green}%`, `Under ${tn.yellow}% or none`],
  ];
  return <div data-testid="deployed-readiness-rules" className="mb-6 rounded-xl border border-border bg-card p-4">
    <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-[13px] font-bold text-foreground" data-testid="button-deployed-readiness-rules">
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} How deployed readiness is scored
      <span className="ml-auto text-[11px] font-semibold text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
    </button>
    {open && <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="border-collapse">
          <thead><tr className="bg-[#f4f7f9]">
            <th className={`${th} text-muted-foreground`}>Score</th>
            <th className={`${th} text-[#256e65]`}>Green</th>
            <th className={`${th} text-[#8a6212]`}>Yellow</th>
            <th className={`${th} text-[#9b4434]`}>Red</th>
          </tr></thead>
          <tbody>{rows.map(([name, g, y, r]) => <tr key={name}>
            <td className={`${td} font-semibold`}>{name}</td>
            <td className={`${td} bg-[#f3faf6]`}>{g}</td>
            <td className={`${td} bg-[#fffaf0]`}>{y}</td>
            <td className={`${td} bg-[#fdf5f3]`}>{r}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <ul className="flex max-w-2xl list-disc flex-col gap-2 pl-5 text-[12px] leading-5 text-foreground">
        <li><b>Same rules as Training - Readiness.</b> Overall = the lowest of the three; a score with no data counts as Red.</li>
        <li><b>Semester tabs:</b> one per semester running now in some campus, taken from each batch's current semester in the prod sequence (e.g. CDU Batch-1 in Sem 4, KKH Batch-2 in Sem 6). An instructor is under the semester of the batches they taught lectures to in the last {fallback} days; with no lectures, their NIAT cohort decides (2026 = Sem 1, 2025 = Sem 3, 2024 = Sem 5). Use <i>Campus</i> to see one university.</li>
        <li><b>Next semester:</b> scored on the lectures and topin exams of the semester after the current one (Sem 1 → 2, Sem 3 → 4, Sem 4 → 5, Sem 6 → 7). Switch to <i>Current semester</i> to compare. Not scored = FCC has no lecture list for that next semester yet.</li>
        <li><b>Subjects:</b> what they teach that batch now (lectures in the last {days} days, else {fallback} days, else their mapped subject), <b>plus</b> any other subject they have recorded a demo or AI assessment, or taken a topin exam, for in the next semester.</li>
        <li><b>Aptitude:</b> the exam score comes from the learning portal (exams + classroom quizzes), as on Training - Readiness. No other learning-portal data is used.</li>
        <li className="text-muted-foreground">Every demo counts (in-training, after deployment, mock); demos under 10 minutes and pre-preparedness demos do not. Not scored = FCC has no lecture list for that subject in that semester.</li>
      </ul>
    </div>}
  </div>;
}

export function DeployedReadinessView() {
  const queryClient = useQueryClient();
  const [force, setForce] = useState(false);
  const query = useQuery<Resp>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch(`/api/reports/deployed-readiness${force ? '?refresh=1' : ''}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
  const apiRows = query.data?.rows ?? [];
  const days = query.data?.lecture_days ?? 30, fallback = query.data?.lecture_days_fallback ?? 60;
  const [which, setWhich] = useState<Which>('next');
  const sems = useMemo(() => [...new Set(apiRows.map((r) => r.current_sem))].sort((a, b) => a - b), [apiRows]);
  // Semester tabs (2026-11-28, per request): one per semester running NOW in some campus (from the batches' current semester), each showing
  // the readiness for the semester after it; the first one is open by default. "All" stays at the end.
  const [semPick, setSem] = useState<string | null>(null);
  const sem = semPick ?? (sems.length ? String(sems[0]) : 'all');
  const bySem = useMemo(() => (sem === 'all' ? apiRows : apiRows.filter((r) => String(r.current_sem) === sem)), [apiRows, sem]);
  // Campus filter (2026-11-28, per request): the campuses teaching this semester; picking one shows its instructors' readiness.
  const [campuses, setCampuses] = useState<string[]>([]);
  const campusOf = (r: Row) => (r.campuses.length ? r.campuses : ['(campus not known -- no lectures in 60 days)']);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => { setForce(true); queryClient.invalidateQueries({ queryKey: QUERY_KEY }); };

  const pass = (r: Row, skip: string) =>
    (skip === 'subject' || !subjects.length || subjects.includes(r.subject)) &&
    (skip === 'source' || !sources.length || sources.includes(SOURCE_LABEL[r.source])) &&
    (skip === 'cm' || !managers.length || managers.includes(r.capability_manager ?? NONE)) &&
    (skip === 'cat' || !cats.length || cats.includes(catOf(blockOf(r, which)))) &&
    (skip === 'role' || !roles.length || roles.includes(r.role)) &&
    (skip === 'campus' || !campuses.length || campusOf(r).some((c) => campuses.includes(c)));
  const campusOptions = () => {
    const counts = new Map<string, number>();
    for (const r of bySem) if (pass(r, 'campus')) for (const c of campusOf(r)) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => ({ key, label: key, count }));
  };
  const optionsFor = (skip: string, value: (r: Row) => string) => {
    const counts = new Map<string, number>();
    for (const r of bySem) if (pass(r, skip)) counts.set(value(r), (counts.get(value(r)) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => ({ key, label: key, count }));
  };
  const filtered = useMemo(() => bySem.filter((r) => pass(r, '')), [bySem, subjects, sources, managers, cats, roles, campuses, which]); // eslint-disable-line react-hooks/exhaustive-deps
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? filtered.filter((r) => r.full_name.toLowerCase().includes(q) || (r.employee_id ?? '').toLowerCase().includes(q)) : filtered;
  }, [filtered, search]);
  const pager = usePagedRows(searched, 50);
  const anyFilter = subjects.length + sources.length + managers.length + cats.length + roles.length + campuses.length > 0;
  const kpi = useMemo(() => {
    const c = (k: string) => searched.filter((r) => catOf(blockOf(r, which)) === k).length;
    return { people: new Set(searched.map((r) => r.employee_id ?? r.full_name)).size, rows: searched.length, green: c('Green'), yellow: c('Yellow'), red: c('Red'), notScored: c('Not scored'), other: searched.filter((r) => r.source === 'other subject').length };
  }, [searched, which]);
  const keyOf = (r: Row) => `${r.employee_id ?? r.full_name}|${r.cohort}|${r.subject}`;
  // Every subject row of the same instructor and batch (subject-wise view in the expanded row).
  const siblings = (r: Row) => apiRows.filter((x) => (x.employee_id ?? x.full_name) === (r.employee_id ?? r.full_name) && x.cohort === r.cohort);

  const downloadTable = () => {
    const headers = ['Name', 'Employee ID', 'Role by sessions', 'Role window (days)', 'Capability Manager', 'Campus', 'Batches', 'Semester from', 'Current semester ends', 'Current semester', 'Next semester', 'Subject', 'Subject from', 'Other-subject evidence', `Lectures in subject (${days}d)`, `Lectures in subject (${fallback}d)`,
      ...(['next', 'current'] as Which[]).flatMap((w) => { const p = w === 'next' ? 'Next sem' : 'Current sem'; return [`${p} lectures`, `${p} lectures with demo + AI`, `${p} % done`, `${p} demo avg`, `${p} lectures with demo`, `${p} demo colour`, `${p} AI avg`, `${p} lectures with AI`, `${p} AI colour`, `${p} Top-N %`, `${p} Top-N exams`, `${p} Top-N colour`, `${p} category`]; })];
    const rows = searched.map((r) => [r.full_name, r.employee_id ?? '', r.role, r.role_days, r.capability_manager ?? '', r.campuses.join('; '), r.batches.join('; ') || r.cohort, r.semester_from, r.semester_end ?? '', r.current_sem, r.next_sem, r.subject, SOURCE_LABEL[r.source], r.evidence ?? '', r.lectures_30d, r.lectures_60d,
      ...(['next', 'current'] as Which[]).flatMap((w) => { const b = blockOf(r, w); return b ? [b.lectures_total, b.both_lectures, b.lectures_total ? Math.round((b.both_lectures / b.lectures_total) * 100) : 0, b.demo_avg ?? '', b.demo_lectures, LABEL[b.demo_colour], b.ai_avg ?? '', b.ai_lectures, LABEL[b.ai_colour], b.topn_avg ?? '', b.topn_exams, LABEL[b.topn_colour], LABEL[b.overall]] : ['', '', '', '', '', '', '', '', '', '', '', '', 'Not scored']; })]);
    downloadCsv(`deployed-readiness-${sem === 'all' ? 'all' : `sem-${sem}`}.csv`, toCsv(headers, rows));
  };

  const card = (label: string, value: number, tone: string) => <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
    <div className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    <div className={`mt-1 text-[22px] font-bold tabular-nums ${tone}`}>{formatKpi(value)}</div>
  </div>;
  const other: Which = which === 'next' ? 'current' : 'next';

  return <div>
    <PageIntro
      eyebrow="BigQuery / QA ratings + topin exams + sessions, read live"
      title="Deployed - Readiness"
      description="NIAT (Deployed) instructors: are they ready for the semester their batch moves to next? Same rules as Training - Readiness, subject-wise."
      action={<button type="button" data-testid="button-refresh-deployed-readiness" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary"><RefreshCw size={14} /> Refresh</button>}
    />
    <Rules t={query.data?.thresholds} days={days} fallback={fallback} />
    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Deployed readiness data is unavailable right now." />}

    {query.data && (apiRows.length === 0 ? <EmptyState title="No deployed instructors" description="No NIAT (Deployed) instructors with a NIAT batch right now." /> : <>
      {/* Semester buttons (2026-11-28, per request): "Semester 1", "Semester 3" ... -- the semesters running now; each lists the instructors
          teaching it. Below, Current / Next semester picks whose readiness is shown (default Next). */}
      <div data-testid="deployed-readiness-semesters" className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <span className="mr-1 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Teaching now</span>
        {[...sems.map(String), 'all'].map((x) => {
          const count = new Set((x === 'all' ? apiRows : apiRows.filter((r) => String(r.current_sem) === x)).map((r) => r.employee_id ?? r.full_name)).size;
          return <button key={x} type="button" data-testid={`button-deployed-readiness-sem-${x}`} onClick={() => { setSem(x); setCampuses([]); }}
            title={x === 'all' ? 'Every semester' : `Instructors teaching Semester ${x} now`}
            className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${x === sem ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {x === 'all' ? 'All semesters' : `Semester ${x}`} <span className="ml-1 tabular-nums opacity-75">{formatKpi(count)}</span>
          </button>;
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Readiness for</span>
        <div data-testid="deployed-readiness-which" className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
          {(['current', 'next'] as Which[]).map((w) => <button key={w} type="button" data-testid={`button-deployed-readiness-${w}`} onClick={() => setWhich(w)}
            className={`rounded-md px-3.5 py-1.5 text-[12px] font-bold transition-colors ${which === w ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {w === 'next' ? `Next semester${sem !== 'all' ? ` (Sem ${Number(sem) + 1})` : ''}` : `Current semester${sem !== 'all' ? ` (Sem ${sem})` : ''}`}
          </button>)}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
        {card('Instructors', kpi.people, 'text-foreground')}
        {card('Green', kpi.green, 'text-[#256e65]')}
        {card('Yellow', kpi.yellow, 'text-[#8a6212]')}
        {card('Red', kpi.red, 'text-[#9b4434]')}
        {card('Not scored', kpi.notScored, 'text-muted-foreground')}
        {card('Other-subject rows', kpi.other, 'text-[#2b59c3]')}
      </div>

      <div data-testid="deployed-readiness-filters" className="relative z-30 mb-5 flex flex-wrap items-center gap-4">
        <MultiSelectFilter label="Campus" options={campusOptions()} selected={campuses} onChange={setCampuses} testId="select-deployed-readiness-campus" widthClass="max-w-[260px]" />
        <MultiSelectFilter label="Subject" options={optionsFor('subject', (r) => r.subject)} selected={subjects} onChange={setSubjects} testId="select-deployed-readiness-subject" />
        <MultiSelectFilter label="Subject from" options={optionsFor('source', (r) => SOURCE_LABEL[r.source])} selected={sources} onChange={setSources} testId="select-deployed-readiness-source" />
        <MultiSelectFilter label="Capability Manager" options={optionsFor('cm', (r) => r.capability_manager ?? NONE)} selected={managers} onChange={setManagers} testId="select-deployed-readiness-cm" />
        <MultiSelectFilter label={which === 'next' ? 'Next-sem category' : 'Current-sem category'} options={optionsFor('cat', (r) => catOf(blockOf(r, which)))} selected={cats} onChange={setCats} testId="select-deployed-readiness-cat" />
        <MultiSelectFilter label="Role by sessions" options={optionsFor('role', (r) => r.role)} selected={roles} onChange={setRoles} testId="select-deployed-readiness-role" />
        {anyFilter && <button type="button" onClick={() => { setSubjects([]); setSources([]); setManagers([]); setCats([]); setRoles([]); setCampuses([]); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary"><X size={13} /> Clear filters</button>}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">{formatKpi(searched.length)} instructor × subject rows · click a row for the course breakdown and all their subjects · read {new Date(query.data.fetched_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadCsvButton onClick={downloadTable} disabled={searched.length === 0} label={`Download CSV (${formatKpi(searched.length)})`} testId="button-download-deployed-readiness-csv" />
          <TableSearchInput value={search} onChange={setSearch} testId="input-search-deployed-readiness" />
        </div>
      </div>

      {searched.length === 0 ? <EmptyState title="No instructors match" description="Clear the filters or the search." />
        : <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-[#f4f7f9]">
                  <th className={`sticky left-0 z-10 bg-[#f4f7f9] ${th}`}>Name</th>
                  <th className={th}>Employee ID</th>
                  <th className={th}>Campus</th>
                  <th className={th}>Subject</th>
                  <th className={th}>Capability Manager</th>
                  <th className={th}>Lectures done (demo + AI)</th>
                  <th className={`${th} text-center`}>Demo score</th>
                  <th className={`${th} text-center`}>AI score</th>
                  <th className={`${th} text-center`}>Top-N</th>
                  <th className={th}>{which === 'next' ? 'Next semester' : 'Current semester'}</th>
                  <th className={th}>{other === 'next' ? 'Next semester' : 'Current semester'}</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((r) => {
                  const id = keyOf(r);
                  const isOpen = open === id;
                  const b = blockOf(r, which);
                  const s = semOf(r, which);
                  return <Fragment key={id}>
                    <tr onClick={() => setOpen(isOpen ? null : id)} className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                      <td className={`sticky left-0 z-10 bg-card font-semibold text-foreground ${td}`}><span className="inline-flex items-center gap-1.5">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{r.full_name}{r.role !== 'Instructor' && <span title={`By sessions, last ${r.role_days} days`} className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">{r.role}</span>}</span></td>
                      <td className={`${td} font-mono-ui text-[11px]`}>{r.employee_id || NONE}</td>
                      <td className={td} title={r.batches.length ? `Batches: ${r.batches.join(', ')}` : 'No lectures in 60 days -- semester from the NIAT cohort'}>
                        <div>{r.campuses.length ? r.campuses.join(', ') : r.cohort}</div>
                        <div className="text-[10px] text-muted-foreground">Sem {r.current_sem} → {r.next_sem}{r.semester_end ? ` · Sem ${r.current_sem} ends ${new Date(`${r.semester_end}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}{r.semester_from === 'cohort' ? ' · from cohort' : ''}</div>
                      </td>
                      <td className={td}>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.source === 'other subject' ? 'bg-[#e6f0fb] text-[#2b59c3]' : 'bg-secondary text-foreground'}`}>{r.subject}</span>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{sourceLine(r, days, fallback)}</div>
                      </td>
                      <td className={`${td} text-muted-foreground`}>{r.capability_manager || NONE}</td>
                      <td className={td}>{b ? <Progress done={b.both_lectures} total={b.lectures_total} /> : <span className="text-[11px] text-muted-foreground">No Sem {s} lecture list</span>}</td>
                      <td className={`${td} text-center`}>{b ? <Score v={b.demo_avg} c={b.demo_colour} sub={`${b.demo_lectures} lecture${b.demo_lectures === 1 ? '' : 's'}`} /> : NONE}</td>
                      <td className={`${td} text-center`}>{b ? <Score v={b.ai_avg} c={b.ai_colour} sub={`${b.ai_lectures} lecture${b.ai_lectures === 1 ? '' : 's'}`} /> : NONE}</td>
                      <td className={`${td} text-center`}>{b ? <Score v={b.topn_avg} c={b.topn_colour} sub={`${b.topn_exams} exam${b.topn_exams === 1 ? '' : 's'}`} pct /> : NONE}</td>
                      <td className={td}><Cat b={b} /></td>
                      <td className={td}><Cat b={blockOf(r, other)} small /></td>
                    </tr>
                    {isOpen && <tr className="border-b border-border bg-[#f8fafb]">
                      <td colSpan={11} className="px-6 py-4">
                        <div className="mb-4">
                          <div className="mb-1 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">All subjects for {r.cohort} (Sem {r.current_sem} → {r.next_sem})</div>
                          <table className="text-left"><thead><tr>{['Subject', 'From', `Sem ${r.current_sem} done`, `Sem ${r.current_sem}`, `Sem ${r.next_sem} done`, `Sem ${r.next_sem} demo`, `Sem ${r.next_sem} AI`, `Sem ${r.next_sem} Top-N`, `Sem ${r.next_sem}`].map((h) => <th key={h} className="px-3 py-1.5 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{h}</th>)}</tr></thead>
                            <tbody>{siblings(r).map((x) => <tr key={x.subject} className="text-[12px] tabular-nums">
                              <td className="px-3 py-1.5 font-semibold text-foreground">{x.subject}</td>
                              <td className="px-3 py-1.5 text-[11px] text-muted-foreground">{SOURCE_LABEL[x.source]}{x.evidence ? ` (${x.evidence})` : ''}</td>
                              <td className="px-3 py-1.5">{x.current ? `${x.current.both_lectures} / ${x.current.lectures_total}` : NONE}</td>
                              <td className="px-3 py-1.5"><Cat b={x.current} small /></td>
                              <td className="px-3 py-1.5">{x.next ? `${x.next.both_lectures} / ${x.next.lectures_total}` : NONE}</td>
                              <td className="px-3 py-1.5">{x.next ? <><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP[x.next.demo_colour]}`}>{f1(x.next.demo_avg)}</span> <span className="text-[10px] text-muted-foreground">{x.next.demo_lectures} lec</span></> : NONE}</td>
                              <td className="px-3 py-1.5">{x.next ? <><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP[x.next.ai_colour]}`}>{f1(x.next.ai_avg)}</span> <span className="text-[10px] text-muted-foreground">{x.next.ai_lectures} lec</span></> : NONE}</td>
                              <td className="px-3 py-1.5">{x.next ? <><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP[x.next.topn_colour]}`}>{f1(x.next.topn_avg, true)}</span> <span className="text-[10px] text-muted-foreground">{x.next.topn_exams} exams</span></> : NONE}</td>
                              <td className="px-3 py-1.5"><Cat b={x.next} small /></td>
                            </tr>)}</tbody></table>
                        </div>
                        {r.courses.filter((c) => c.semester === s).length === 0 ? <p className="text-[12px] text-muted-foreground">No Semester {s} lecture-list courses for {r.subject}.</p> :
                          <><div className="mb-1 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{r.subject} · Semester {s} courses</div>
                          <table className="text-left">
                            <thead><tr>{['Course', 'Lectures', 'With demo', 'With AI', 'Both', 'Demo avg', 'AI avg'].map((h) => <th key={h} className="px-3 py-1.5 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{h}</th>)}</tr></thead>
                            <tbody>{r.courses.filter((c) => c.semester === s).map((c) => <tr key={c.key} className="text-[12px] tabular-nums">
                              <td className="px-3 py-1.5 font-semibold text-foreground">{c.title}</td>
                              <td className="px-3 py-1.5">{c.lectures_total}</td>
                              <td className="px-3 py-1.5">{c.demo_lectures}</td>
                              <td className="px-3 py-1.5">{c.ai_lectures}</td>
                              <td className={`px-3 py-1.5 font-bold ${c.both_lectures === c.lectures_total ? 'text-[#256e65]' : 'text-foreground'}`}>{c.both_lectures}</td>
                              <td className="px-3 py-1.5">{f1(c.demo_avg)}</td>
                              <td className="px-3 py-1.5">{f1(c.ai_avg)}</td>
                            </tr>)}</tbody>
                          </table></>}
                      </td>
                    </tr>}
                  </Fragment>;
                })}
              </tbody>
            </table>
          </div>
          <TablePager page={pager.page} pageCount={pager.pageCount} pageSize={pager.pageSize} start={pager.start} end={pager.end} total={pager.total} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} />
        </div>}
    </>)}
  </div>;
}
