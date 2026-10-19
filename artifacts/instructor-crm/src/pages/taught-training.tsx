import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { downloadCsv, toCsv } from '@/lib/csv';
import { MultiSelectFilter } from './instructors';

// "Taught in class" training, SESSION-ID version (2026-10-19, per request). NIAT instructors only. Every curriculum session of a course
// has its own session id; for each instructor and course: sessions they completed / the course's sessions at their NIAT institutes.
// Pick a subject with the buttons (Frontend, Backend, DSA...): its courses become the columns, one row per instructor who has taught
// at least one of them, plus their overall % for the subject. Completed = 80%+. Server: connectors/taughtTraining.ts and
// GET /reports/taught-training.

type Cell = { completed: number; curriculum: number; scheduled: number; pct: number; last_taught_date: string | null; institutes: string[] };
type TaughtRow = { employee_id: string | null; full_name: string; subject_area: string | null; capability_manager: string | null; courses: Record<string, Cell> };
type CourseCol = { course_id: string; title: string; subject: string; instructors: number; curriculum_max: number };
type TaughtResponse = { rows: TaughtRow[]; courses: CourseCol[]; subject_columns: string[]; completed_pct: number; synced_at: string | null };

const QUERY_KEY = ['reports', 'taught-training'];
const NONE = '—';
const SHORT: Record<string, string> = { 'Artificial Intelligence & Emerging Technologies': 'AI & ET' };
const tone = (p: number) => (p >= 80 ? 'bg-[#e5f3ed] text-[#256e65]' : p >= 50 ? 'bg-[#fff5dc] text-[#8a6212]' : 'bg-[#fff0ec] text-[#9b4434]');
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : NONE);
const pctOf = (done: number, total: number) => (total > 0 ? Math.min(100, Math.round((done / total) * 1000) / 10) : 0);
const th = 'whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
const td = 'whitespace-nowrap border-r border-border px-4 py-3 text-[12px]';

export function TaughtTrainingView() {
  const queryClient = useQueryClient();
  const query = useQuery<TaughtResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/taught-training');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
  const all = query.data?.rows ?? [];
  const allCourses = query.data?.courses ?? [];
  const subjectsWithCourses = useMemo(() => (query.data?.subject_columns ?? []).filter((s) => allCourses.some((c) => c.subject === s)), [query.data, allCourses]);
  const [subject, setSubject] = useState<string | null>(null);
  const activeSubject = subject && subjectsWithCourses.includes(subject) ? subject : subjectsWithCourses[0] ?? null;
  const [instructorSubjects, setInstructorSubjects] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      // Same sync as the learning-portal view: it rebuilds this data right after the training status.
      const response = await fetch('/api/sync/training-status', { method: 'POST' });
      const result = await response.json();
      setSyncMessage(result.ok ? { ok: true, text: 'Synced. Taught-in-class data rebuilt.' } : { ok: false, text: result.error || 'Sync failed.' });
      if (result.ok) refresh();
    } catch {
      setSyncMessage({ ok: false, text: 'Sync failed -- could not reach the server.' });
    } finally {
      setSyncing(false);
    }
  };

  const columns = useMemo(() => allCourses.filter((c) => c.subject === activeSubject), [allCourses, activeSubject]);
  // Rows of this subject: instructors who have taught at least one of its courses, with their overall % over those courses.
  const subjectRows = useMemo(() => all.flatMap((r) => {
    const cells = columns.map((c) => r.courses[c.course_id]).filter((x): x is Cell => !!x);
    if (!cells.length) return [];
    const done = cells.reduce((a, x) => a + Math.min(x.completed, x.curriculum), 0), total = cells.reduce((a, x) => a + x.curriculum, 0);
    return [{ ...r, overall: { done, total, pct: pctOf(done, total) } }];
  }), [all, columns]);
  type SubjectRow = (typeof subjectRows)[number];
  const pass = (r: SubjectRow, skip: string) =>
    (skip === 'subject' || !instructorSubjects.length || instructorSubjects.includes(r.subject_area ?? NONE)) &&
    (skip === 'cm' || !managers.length || managers.includes(r.capability_manager ?? NONE));
  const optionsFor = (skip: string, value: (r: SubjectRow) => string) => {
    const counts = new Map<string, number>();
    for (const r of subjectRows) if (pass(r, skip)) counts.set(value(r), (counts.get(value(r)) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => ({ key, label: key, count }));
  };
  const filtered = useMemo(() => subjectRows.filter((r) => pass(r, '')), [subjectRows, instructorSubjects, managers]); // eslint-disable-line react-hooks/exhaustive-deps
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? filtered.filter((r) => r.full_name.toLowerCase().includes(q) || (r.employee_id ?? '').toLowerCase().includes(q)) : filtered;
  }, [filtered, search]);
  const pager = usePagedRows(searched, 50);
  const anyFilter = instructorSubjects.length + managers.length > 0;
  const colTotals = useMemo(() => Object.fromEntries(columns.map((c) => {
    const cells = searched.map((r) => r.courses[c.course_id]).filter(Boolean);
    return [c.course_id, { taught: cells.length, completed: cells.filter((x) => x.pct >= 80).length }];
  })), [columns, searched]);
  const overallCompleted = searched.filter((r) => r.overall.pct >= 80).length;

  const downloadTable = () => {
    const headers = ['Name', 'Employee ID', 'Instructor subject', 'Capability Manager', ...columns.flatMap((c) => [`${c.title} %`, `${c.title} completed / sessions`]), `${activeSubject} overall %`, `${activeSubject} completed / sessions`];
    const rows = searched.map((r) => [r.full_name, r.employee_id ?? '', r.subject_area ?? '', r.capability_manager ?? '',
      ...columns.flatMap((c) => { const x = r.courses[c.course_id]; return x ? [x.pct, `${x.completed}/${x.curriculum}`] : ['', '']; }),
      r.overall.pct, `${r.overall.done}/${r.overall.total}`]);
    downloadCsv(`training-taught-${(activeSubject ?? 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, toCsv(headers, rows));
  };

  return <div>
    <PageIntro
      eyebrow="BigQuery / NIAT session schedule, by session id"
      title="Training Stats -- Taught in class"
      description="NIAT instructors only. Every session of a course has its own session ID; each cell is the course's sessions this instructor has completed out of the course's sessions at their NIAT institute(s) (lecture and practice). Pick a subject to see its courses. Orientation / intro courses are left out. 80% or more = Completed."
      action={<div className="flex items-center gap-2">
        <button type="button" data-testid="button-refresh-taught-training" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary"><RefreshCw size={14} /> Refresh</button>
        <button type="button" data-testid="button-sync-taught-training" onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45">{syncing ? 'Syncing…' : 'Sync Now'}</button>
      </div>}
    />
    {syncMessage && <p className={`mb-4 max-w-2xl rounded-lg px-3 py-2 text-[12px] font-semibold ${syncMessage.ok ? 'bg-[#e5f3ed] text-[#256e65]' : 'bg-[#fff0ec] text-[#9b4434]'}`}>{syncMessage.text}</p>}

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Taught-in-class training is unavailable right now." />}

    {query.data && (all.length === 0 || !activeSubject ? <EmptyState title="No taught-in-class data yet" description="Run the database push, publish, then click Sync Now to build it." /> : <>
      <div data-testid="taught-subject-buttons" className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {subjectsWithCourses.map((s) => {
          const ids = new Set(allCourses.filter((c) => c.subject === s).map((c) => c.course_id));
          const count = all.filter((r) => Object.keys(r.courses).some((id) => ids.has(id))).length;
          return <button key={s} type="button" data-testid={`button-taught-subject-${s}`} onClick={() => { setSubject(s); setInstructorSubjects([]); setManagers([]); }}
            className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${s === activeSubject ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {SHORT[s] ?? s} <span className="ml-1 tabular-nums opacity-75">{formatKpi(count)}</span>
          </button>;
        })}
      </div>

      <div data-testid="taught-filters" className="mb-5 flex flex-wrap items-center gap-4">
        <MultiSelectFilter label="Instructor subject" options={optionsFor('subject', (r) => r.subject_area ?? NONE)} selected={instructorSubjects} onChange={setInstructorSubjects} testId="select-taught-subject" />
        <MultiSelectFilter label="Capability Manager" options={optionsFor('cm', (r) => r.capability_manager ?? NONE)} selected={managers} onChange={setManagers} testId="select-taught-cm" />
        {anyFilter && <button type="button" onClick={() => { setInstructorSubjects([]); setManagers([]); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary"><X size={13} /> Clear filters</button>}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">{formatKpi(searched.length)} NIAT instructors · {formatKpi(columns.length)} {SHORT[activeSubject] ?? activeSubject} courses · {formatKpi(overallCompleted)} at 80%+ overall · {query.data.synced_at ? `last synced ${new Date(query.data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'not synced yet -- click Sync Now'}</p>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadCsvButton onClick={downloadTable} disabled={searched.length === 0} label={`Download CSV (${formatKpi(searched.length)})`} testId="button-download-taught-csv" />
          <TableSearchInput value={search} onChange={setSearch} testId="input-search-taught" />
        </div>
      </div>

      {searched.length === 0 ? <EmptyState title="No instructors match" description="Pick another subject or clear the filters." />
        : <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-[#f4f7f9]">
                  <th className={`sticky left-0 z-10 bg-[#f4f7f9] ${th}`}>Name</th>
                  <th className={th}>Employee ID</th>
                  <th className={th}>Instructor subject</th>
                  <th className={th}>Capability Manager</th>
                  {columns.map((c, i) => <th key={c.course_id} className={`${th} text-center ${i === 0 ? 'border-l-2' : ''}`} title={`Up to ${c.curriculum_max} sessions; taught by ${c.instructors} NIAT instructors`}>
                    <div className="normal-case tracking-normal font-sans text-[11px] font-bold text-foreground">{c.title}</div>
                    <div className="mt-1 font-sans text-[10px] normal-case tracking-normal text-muted-foreground/80">{formatKpi(colTotals[c.course_id]?.completed ?? 0)} of {formatKpi(colTotals[c.course_id]?.taught ?? 0)} at 80%+</div>
                  </th>)}
                  <th className={`${th} border-l-2 bg-[#eef4ee] text-center`}>{SHORT[activeSubject] ?? activeSubject} overall</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((r) => <tr key={r.employee_id ?? r.full_name} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                  <td className={`sticky left-0 z-10 bg-card font-semibold text-foreground ${td}`}>{r.full_name}</td>
                  <td className={`${td} font-mono-ui text-[11px]`}>{r.employee_id || NONE}</td>
                  <td className={td}>{r.subject_area || NONE}</td>
                  <td className={`${td} text-muted-foreground`}>{r.capability_manager || NONE}</td>
                  {columns.map((c, i) => {
                    const x = r.courses[c.course_id];
                    return <td key={c.course_id} className={`${td} text-center ${i === 0 ? 'border-l-2' : ''}`}
                      title={x ? `Completed ${x.completed} of ${x.curriculum} sessions (${x.scheduled} scheduled for them) · last taught ${fmtDate(x.last_taught_date)}${x.institutes.length ? ` · ${x.institutes.join(', ')}` : ''}` : 'Not taught'}>
                      {x ? <div className="flex flex-col items-center gap-0.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${tone(x.pct)}`}>{x.pct}%</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">{x.completed}/{x.curriculum}</span>
                      </div> : <span className="text-[11px] text-muted-foreground">{NONE}</span>}
                    </td>;
                  })}
                  <td className={`${td} border-l-2 bg-[#f6faf6] text-center`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${tone(r.overall.pct)}`}>{r.overall.pct}%</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{r.overall.done}/{r.overall.total}</span>
                    </div>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <TablePager page={pager.page} pageCount={pager.pageCount} pageSize={pager.pageSize} start={pager.start} end={pager.end} total={pager.total} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} />
        </div>}
    </>)}
  </div>;
}
