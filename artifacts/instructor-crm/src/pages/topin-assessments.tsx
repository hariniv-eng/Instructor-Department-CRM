import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { downloadCsv, toCsv } from '@/lib/csv';
import { MultiSelectFilter } from './instructors';

// "Training - Assessments" view of Training Stats (2026-11-12, per request: the topin assessment data in FCC, all subjects). Per
// instructor and course: Daily exams and Weekly exams separately -- how many they took and their average best score (%). Read live from
// the trainee exam best-scores view; exams are matched to a course by their title (server: connectors/topinAssessments.ts and
// GET /reports/topin-assessments). Same people, subject buttons and filters as Training - Demos.
type ExamStat = { exams: number; avg: number | null; last_date: string | null };
type Cell = { daily: ExamStat | null; weekly: ExamStat | null };
type Kind = 'daily' | 'weekly';
const KINDS: { kind: Kind; label: string }[] = [{ kind: 'daily', label: 'Daily exams' }, { kind: 'weekly', label: 'Weekly exams' }];
type Row = { employee_id: string | null; full_name: string; product: string; subject_area: string | null; capability_manager: string | null; courses: Record<string, Cell> };
type CourseCol = { course_id: string; title: string; subject: string };
type Resp = { rows: Row[]; courses: CourseCol[]; subject_columns: string[]; fetched_at: string };

const QUERY_KEY = ['reports', 'topin-assessments'];
const NONE = '—';
const SHORT: Record<string, string> = { 'Artificial Intelligence & Emerging Technologies': 'AI & ET' };
const PRODUCT_LABEL: Record<string, string> = { 'NIAT (Deployed)': 'Deployed', 'NIAT (Training)': 'Training' };
const tone = (s: number | null) => (s === null ? 'bg-secondary text-muted-foreground' : s >= 70 ? 'bg-[#e5f3ed] text-[#256e65]' : s >= 50 ? 'bg-[#fff5dc] text-[#8a6212]' : 'bg-[#fff0ec] text-[#9b4434]');
const fmtPct = (s: number | null) => (s === null ? NONE : `${s.toFixed(1)}%`);
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : NONE);
const th = 'whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
const td = 'whitespace-nowrap border-r border-border px-4 py-3 text-[12px]';
const kindBorder = (kind: Kind) => (kind === 'daily' ? 'border-l-2' : 'border-l border-l-border');

function ExamCell({ x }: { x: ExamStat | null }) {
  if (!x) return <span className="text-[11px] text-muted-foreground">{NONE}</span>;
  return <div className="mx-auto flex flex-col items-center gap-0.5" title={`${x.exams} exam${x.exams === 1 ? '' : 's'} · average best score ${fmtPct(x.avg)} · last ${fmtDate(x.last_date)}`}>
    <span className="text-[12px] font-bold tabular-nums text-foreground">{x.exams} <span className="text-[10px] font-semibold text-muted-foreground">exam{x.exams === 1 ? '' : 's'}</span></span>
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${tone(x.avg)}`}>{fmtPct(x.avg)}</span>
  </div>;
}
// Several courses -> one: total exams, average weighted by exams, latest date.
const combine = (list: (ExamStat | null | undefined)[]): ExamStat | null => {
  const st = list.filter((x): x is ExamStat => !!x);
  if (!st.length) return null;
  const n = st.reduce((a, x) => a + x.exams, 0);
  const sum = st.reduce((a, x) => a + (x.avg ?? 0) * x.exams, 0);
  const dates = st.map((x) => x.last_date).filter((d): d is string => !!d).sort();
  return { exams: n, avg: n ? Math.round((sum / n) * 10) / 10 : null, last_date: dates[dates.length - 1] ?? null };
};

export function TopinAssessmentView() {
  const queryClient = useQueryClient();
  const [force, setForce] = useState(false);
  const query = useQuery<Resp>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch(`/api/reports/topin-assessments${force ? '?refresh=1' : ''}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
  const all = query.data?.rows ?? [];
  const allCourses = query.data?.courses ?? [];
  const subjectsWithCourses = useMemo(() => (query.data?.subject_columns ?? []).filter((s) => allCourses.some((c) => c.subject === s)), [query.data, allCourses]);
  const [subject, setSubject] = useState<string | null>(null);
  const activeSubject = subject && subjectsWithCourses.includes(subject) ? subject : subjectsWithCourses[0] ?? null;
  const [products, setProducts] = useState<string[]>([]);
  const [instructorSubjects, setInstructorSubjects] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const refresh = () => { setForce(true); queryClient.invalidateQueries({ queryKey: QUERY_KEY }); };

  const columns = useMemo(() => allCourses.filter((c) => c.subject === activeSubject), [allCourses, activeSubject]);
  const subjectRows = useMemo(() => all.flatMap((r) => {
    const cells = columns.map((c) => r.courses[c.course_id]).filter((x): x is Cell => !!x);
    if (!cells.length) return [];
    return [{ ...r, overall: { daily: combine(cells.map((x) => x.daily)), weekly: combine(cells.map((x) => x.weekly)) } as Record<Kind, ExamStat | null> }];
  }), [all, columns]);
  type SubjectRow = (typeof subjectRows)[number];
  const pass = (r: SubjectRow, skip: string) =>
    (skip === 'product' || !products.length || products.includes(PRODUCT_LABEL[r.product] ?? r.product)) &&
    (skip === 'subject' || !instructorSubjects.length || instructorSubjects.includes(r.subject_area ?? NONE)) &&
    (skip === 'cm' || !managers.length || managers.includes(r.capability_manager ?? NONE));
  const optionsFor = (skip: string, value: (r: SubjectRow) => string) => {
    const counts = new Map<string, number>();
    for (const r of subjectRows) if (pass(r, skip)) counts.set(value(r), (counts.get(value(r)) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => ({ key, label: key, count }));
  };
  const filtered = useMemo(() => subjectRows.filter((r) => pass(r, '')), [subjectRows, products, instructorSubjects, managers]); // eslint-disable-line react-hooks/exhaustive-deps
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? filtered.filter((r) => r.full_name.toLowerCase().includes(q) || (r.employee_id ?? '').toLowerCase().includes(q)) : filtered;
  }, [filtered, search]);
  const pager = usePagedRows(searched, 50);
  const anyFilter = products.length + instructorSubjects.length + managers.length > 0;
  // Header line per course and kind: instructors who took one, and their average (each instructor counted once).
  const colTotals = useMemo(() => Object.fromEntries(columns.flatMap((c) => KINDS.map(({ kind }) => {
    const st = searched.map((r) => r.courses[c.course_id]?.[kind]).filter((x): x is ExamStat => !!x && x.avg !== null);
    return [`${c.course_id}|${kind}`, { people: st.length, avg: st.length ? Math.round((st.reduce((a, x) => a + (x.avg ?? 0), 0) / st.length) * 10) / 10 : null }];
  }))), [columns, searched]);

  const downloadTable = () => {
    const titles = [...columns.map((c) => c.title), `${activeSubject} overall`];
    const headers = ['Name', 'Employee ID', 'Deployed / Training', 'Instructor subject', 'Capability Manager',
      ...titles.flatMap((t) => KINDS.flatMap(({ label }) => [`${t} ${label} taken`, `${t} ${label} avg best %`, `${t} ${label} last`]))];
    const vals = (x: ExamStat | null | undefined) => (x ? [x.exams, x.avg ?? '', x.last_date ?? ''] : ['', '', '']);
    const rows = searched.map((r) => [r.full_name, r.employee_id ?? '', PRODUCT_LABEL[r.product] ?? r.product, r.subject_area ?? '', r.capability_manager ?? '',
      ...columns.flatMap((c) => KINDS.flatMap(({ kind }) => vals(r.courses[c.course_id]?.[kind]))), ...KINDS.flatMap(({ kind }) => vals(r.overall[kind]))]);
    downloadCsv(`training-assessments-${(activeSubject ?? 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, toCsv(headers, rows));
  };

  return <div>
    <PageIntro
      eyebrow="BigQuery / trainee exam best scores (topin), read live"
      title="Training - Assessments"
      description="NIAT Deployed and Training instructors. For each course: Daily exams and Weekly exams -- how many the instructor took and their average best score (%). Exams are matched to a course by their title (e.g. python_… = Python, static_website_… = Static Web); exams on a whole subject go in its General column. Mock tests, entry tests, daily quizzes and per-batch test exams are not counted."
      action={<button type="button" data-testid="button-refresh-topin" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary"><RefreshCw size={14} /> Refresh</button>}
    />
    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Assessment data is unavailable right now." />}

    {query.data && (all.length === 0 || !activeSubject ? <EmptyState title="No assessment data" description="No exams matched for the instructors in this view." /> : <>
      <div data-testid="topin-subject-buttons" className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {subjectsWithCourses.map((s) => {
          const ids = new Set(allCourses.filter((c) => c.subject === s).map((c) => c.course_id));
          const count = all.filter((r) => Object.keys(r.courses).some((id) => ids.has(id))).length;
          return <button key={s} type="button" data-testid={`button-topin-subject-${s}`} onClick={() => { setSubject(s); setInstructorSubjects([]); setManagers([]); }}
            className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${s === activeSubject ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {SHORT[s] ?? s} <span className="ml-1 tabular-nums opacity-75">{formatKpi(count)}</span>
          </button>;
        })}
      </div>

      <div data-testid="topin-filters" className="relative z-30 mb-5 flex flex-wrap items-center gap-4">
        <MultiSelectFilter label="Deployed / Training" options={optionsFor('product', (r) => PRODUCT_LABEL[r.product] ?? r.product)} selected={products} onChange={setProducts} testId="select-topin-product" />
        <MultiSelectFilter label="Instructor subject" options={optionsFor('subject', (r) => r.subject_area ?? NONE)} selected={instructorSubjects} onChange={setInstructorSubjects} testId="select-topin-subject" />
        <MultiSelectFilter label="Capability Manager" options={optionsFor('cm', (r) => r.capability_manager ?? NONE)} selected={managers} onChange={setManagers} testId="select-topin-cm" />
        {anyFilter && <button type="button" onClick={() => { setProducts([]); setInstructorSubjects([]); setManagers([]); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary"><X size={13} /> Clear filters</button>}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">{formatKpi(searched.length)} instructors · {formatKpi(columns.length)} {SHORT[activeSubject] ?? activeSubject} columns · read {new Date(query.data.fetched_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadCsvButton onClick={downloadTable} disabled={searched.length === 0} label={`Download CSV (${formatKpi(searched.length)})`} testId="button-download-topin-csv" />
          <TableSearchInput value={search} onChange={setSearch} testId="input-search-topin" />
        </div>
      </div>

      {searched.length === 0 ? <EmptyState title="No instructors match" description="Pick another subject or clear the filters." />
        : <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-[#f4f7f9]">
                  <th rowSpan={2} className={`sticky left-0 z-10 bg-[#f4f7f9] ${th}`}>Name</th>
                  <th rowSpan={2} className={th}>Employee ID</th>
                  <th rowSpan={2} className={th}>Deployed / Training</th>
                  <th rowSpan={2} className={th}>Instructor subject</th>
                  <th rowSpan={2} className={th}>Capability Manager</th>
                  {columns.map((c) => <th key={c.course_id} colSpan={KINDS.length} className={`${th} border-l-2 text-center`}>
                    <div className="normal-case tracking-normal font-sans text-[11px] font-bold text-foreground">{c.title}</div>
                  </th>)}
                  <th colSpan={KINDS.length} className={`${th} border-l-2 bg-[#eef4ee] text-center`}>{SHORT[activeSubject] ?? activeSubject} overall</th>
                </tr>
                <tr className="border-b border-border bg-[#f4f7f9]">
                  {[...columns.map((c) => c.course_id), 'overall'].flatMap((id) => KINDS.map(({ kind, label }) => <th key={`${id}|${kind}`} className={`${th} text-center ${kindBorder(kind)} ${id === 'overall' ? 'bg-[#eef4ee]' : ''}`}>
                    <div className="normal-case tracking-normal font-sans text-[10px] font-bold text-foreground">{label}</div>
                    {id !== 'overall' && <div className="mt-0.5 font-sans text-[10px] normal-case tracking-normal text-muted-foreground/80">{formatKpi(colTotals[`${id}|${kind}`]?.people ?? 0)} · avg {fmtPct(colTotals[`${id}|${kind}`]?.avg ?? null)}</div>}
                  </th>))}
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((r) => <tr key={r.employee_id ?? r.full_name} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                  <td className={`sticky left-0 z-10 bg-card font-semibold text-foreground ${td}`}>{r.full_name}</td>
                  <td className={`${td} font-mono-ui text-[11px]`}>{r.employee_id || NONE}</td>
                  <td className={td}>{PRODUCT_LABEL[r.product] ?? r.product}</td>
                  <td className={td}>{r.subject_area || NONE}</td>
                  <td className={`${td} text-muted-foreground`}>{r.capability_manager || NONE}</td>
                  {columns.flatMap((c) => KINDS.map(({ kind }) => <td key={`${c.course_id}|${kind}`} className={`${td} text-center ${kindBorder(kind)}`}><ExamCell x={r.courses[c.course_id]?.[kind] ?? null} /></td>))}
                  {KINDS.map(({ kind }) => <td key={`overall|${kind}`} className={`${td} bg-[#f6faf6] text-center ${kindBorder(kind)}`}><ExamCell x={r.overall[kind]} /></td>)}
                </tr>)}
              </tbody>
            </table>
          </div>
          <TablePager page={pager.page} pageCount={pager.pageCount} pageSize={pager.pageSize} start={pager.start} end={pager.end} total={pager.total} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} />
        </div>}
    </>)}
  </div>;
}
