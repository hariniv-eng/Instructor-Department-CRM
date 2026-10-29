import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { downloadCsv, toCsv } from '@/lib/csv';
import { MultiSelectFilter } from './instructors';

// "Demos" view of Training Stats (2026-10-28, per request), next to "Taught in class". For each instructor and course of the lecture list:
// how many of the course's lectures they have recorded a completed DEMO on (e.g. 8 / 20 for HTML & CSS) and, below it, the average QA
// score (0-10) of all those demos. NIAT Deployed and NIAT Training instructors. Server: connectors/demoTraining.ts and
// GET /reports/demo-training (built by the Training Status sync).

type Cell = { demoed: number; total: number; demos: number; avg_score: number | null; scored: number; score_sum: number; last_demo_date: string | null };
type DemoRow = { employee_id: string | null; full_name: string; product: string; subject_area: string | null; capability_manager: string | null; courses: Record<string, Cell> };
type CourseCol = { course_id: string; title: string; subject: string; instructors: number; total: number };
type DemoResponse = { rows: DemoRow[]; courses: CourseCol[]; subject_columns: string[]; synced_at: string | null };

const QUERY_KEY = ['reports', 'demo-training'];
const NONE = '—';
const SHORT: Record<string, string> = { 'Artificial Intelligence & Emerging Technologies': 'AI & ET' };
const PRODUCT_LABEL: Record<string, string> = { 'NIAT (Deployed)': 'Deployed', 'NIAT (Training)': 'Training' };
const scoreTone = (s: number | null) => (s === null ? 'bg-secondary text-muted-foreground' : s >= 7 ? 'bg-[#e5f3ed] text-[#256e65]' : s >= 5 ? 'bg-[#fff5dc] text-[#8a6212]' : 'bg-[#fff0ec] text-[#9b4434]');
const fmtScore = (s: number | null) => (s === null ? NONE : s.toFixed(1));
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : NONE);
const th = 'whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
const td = 'whitespace-nowrap border-r border-border px-4 py-3 text-[12px]';

export function DemoTrainingView() {
  const queryClient = useQueryClient();
  const query = useQuery<DemoResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/demo-training');
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
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      // Same sync as the other Training Stats views: it rebuilds the demo data right after the training status.
      const response = await fetch('/api/sync/training-status', { method: 'POST' });
      const result = await response.json();
      setSyncMessage(result.ok ? { ok: true, text: 'Synced. Demo data rebuilt.' } : { ok: false, text: result.error || 'Sync failed.' });
      if (result.ok) refresh();
    } catch {
      setSyncMessage({ ok: false, text: 'Sync failed -- could not reach the server.' });
    } finally {
      setSyncing(false);
    }
  };

  const columns = useMemo(() => allCourses.filter((c) => c.subject === activeSubject), [allCourses, activeSubject]);
  // Rows of this subject: instructors with a demo in at least one of its courses, with their overall lectures and average over those courses.
  const subjectRows = useMemo(() => all.flatMap((r) => {
    const cells = columns.map((c) => r.courses[c.course_id]).filter((x): x is Cell => !!x);
    if (!cells.length) return [];
    const demoed = cells.reduce((a, x) => a + x.demoed, 0);
    const total = columns.reduce((a, c) => a + c.total, 0);
    const scored = cells.reduce((a, x) => a + x.scored, 0), sum = cells.reduce((a, x) => a + x.score_sum, 0);
    const demos = cells.reduce((a, x) => a + x.demos, 0);
    return [{ ...r, overall: { demoed, total, demos, avg: scored > 0 ? Math.round((sum / scored) * 10) / 10 : null } }];
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
  // Per course (header): instructors with a demo, and the average QA score of all their demos in it.
  const colTotals = useMemo(() => Object.fromEntries(columns.map((c) => {
    const cells = searched.map((r) => r.courses[c.course_id]).filter((x): x is Cell => !!x);
    const scored = cells.reduce((a, x) => a + x.scored, 0), sum = cells.reduce((a, x) => a + x.score_sum, 0);
    return [c.course_id, { people: cells.length, avg: scored > 0 ? Math.round((sum / scored) * 10) / 10 : null }];
  })), [columns, searched]);

  const downloadTable = () => {
    const headers = ['Name', 'Employee ID', 'Deployed / Training', 'Instructor subject', 'Capability Manager',
      ...columns.flatMap((c) => [`${c.title} lectures demoed`, `${c.title} demos`, `${c.title} avg QA score`]), `${activeSubject} lectures demoed`, `${activeSubject} avg QA score`];
    const rows = searched.map((r) => [r.full_name, r.employee_id ?? '', PRODUCT_LABEL[r.product] ?? r.product, r.subject_area ?? '', r.capability_manager ?? '',
      ...columns.flatMap((c) => { const x = r.courses[c.course_id]; return x ? [`${x.demoed}/${x.total}`, x.demos, x.avg_score ?? ''] : ['', '', '']; }),
      `${r.overall.demoed}/${r.overall.total}`, r.overall.avg ?? '']);
    downloadCsv(`training-demos-${(activeSubject ?? 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, toCsv(headers, rows));
  };

  return <div>
    <PageIntro
      eyebrow="BigQuery / niat_session_wise_qa_rating, DEMO + TRAINING_DEMO"
      title="Training - Demos"
      description="NIAT Deployed and Training instructors. Columns are the courses of the lecture list. Each cell = how many of the course's lectures the instructor has recorded a completed demo on (e.g. 8/20) -- regular demos and training demos together -- and below it the average QA score (out of 10) of all those demos. Demos are matched to lectures by topic name. Hover a cell for details."
      action={<div className="flex items-center gap-2">
        <button type="button" data-testid="button-refresh-demo-training" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary"><RefreshCw size={14} /> Refresh</button>
        <button type="button" data-testid="button-sync-demo-training" onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45">{syncing ? 'Syncing…' : 'Sync Now'}</button>
      </div>}
    />
    {syncMessage && <p className={`mb-4 max-w-2xl rounded-lg px-3 py-2 text-[12px] font-semibold ${syncMessage.ok ? 'bg-[#e5f3ed] text-[#256e65]' : 'bg-[#fff0ec] text-[#9b4434]'}`}>{syncMessage.text}</p>}

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Demo data is unavailable right now." />}

    {query.data && (all.length === 0 || !activeSubject ? <EmptyState title="No demo data yet" description="Run the database push, publish, then click Sync Now to build it." /> : <>
      <div data-testid="demo-subject-buttons" className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {subjectsWithCourses.map((s) => {
          const ids = new Set(allCourses.filter((c) => c.subject === s).map((c) => c.course_id));
          const count = all.filter((r) => Object.keys(r.courses).some((id) => ids.has(id))).length;
          return <button key={s} type="button" data-testid={`button-demo-subject-${s}`} onClick={() => { setSubject(s); setInstructorSubjects([]); setManagers([]); }}
            className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${s === activeSubject ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {SHORT[s] ?? s} <span className="ml-1 tabular-nums opacity-75">{formatKpi(count)}</span>
          </button>;
        })}
      </div>

      <div data-testid="demo-filters" className="mb-5 flex flex-wrap items-center gap-4">
        <MultiSelectFilter label="Deployed / Training" options={optionsFor('product', (r) => PRODUCT_LABEL[r.product] ?? r.product)} selected={products} onChange={setProducts} testId="select-demo-product" />
        <MultiSelectFilter label="Instructor subject" options={optionsFor('subject', (r) => r.subject_area ?? NONE)} selected={instructorSubjects} onChange={setInstructorSubjects} testId="select-demo-subject" />
        <MultiSelectFilter label="Capability Manager" options={optionsFor('cm', (r) => r.capability_manager ?? NONE)} selected={managers} onChange={setManagers} testId="select-demo-cm" />
        {anyFilter && <button type="button" onClick={() => { setProducts([]); setInstructorSubjects([]); setManagers([]); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary"><X size={13} /> Clear filters</button>}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">{formatKpi(searched.length)} instructors · {formatKpi(columns.length)} {SHORT[activeSubject] ?? activeSubject} courses · {query.data.synced_at ? `last synced ${new Date(query.data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'not synced yet -- click Sync Now'}</p>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadCsvButton onClick={downloadTable} disabled={searched.length === 0} label={`Download CSV (${formatKpi(searched.length)})`} testId="button-download-demo-csv" />
          <TableSearchInput value={search} onChange={setSearch} testId="input-search-demo" />
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
                  <th className={th}>Deployed / Training</th>
                  <th className={th}>Instructor subject</th>
                  <th className={th}>Capability Manager</th>
                  {columns.map((c, i) => <th key={c.course_id} className={`${th} text-center ${i === 0 ? 'border-l-2' : ''}`} title={`${c.total} lectures; demos by ${c.instructors} instructors`}>
                    <div className="normal-case tracking-normal font-sans text-[11px] font-bold text-foreground">{c.title}</div>
                    <div className="mt-1 font-sans text-[10px] normal-case tracking-normal text-muted-foreground/80">{formatKpi(colTotals[c.course_id]?.people ?? 0)} instructors · avg QA {fmtScore(colTotals[c.course_id]?.avg ?? null)}</div>
                  </th>)}
                  <th className={`${th} border-l-2 bg-[#eef4ee] text-center`}>{SHORT[activeSubject] ?? activeSubject} overall</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((r) => <tr key={r.employee_id ?? r.full_name} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                  <td className={`sticky left-0 z-10 bg-card font-semibold text-foreground ${td}`}>{r.full_name}</td>
                  <td className={`${td} font-mono-ui text-[11px]`}>{r.employee_id || NONE}</td>
                  <td className={td}>{PRODUCT_LABEL[r.product] ?? r.product}</td>
                  <td className={td}>{r.subject_area || NONE}</td>
                  <td className={`${td} text-muted-foreground`}>{r.capability_manager || NONE}</td>
                  {columns.map((c, i) => {
                    const x = r.courses[c.course_id];
                    return <td key={c.course_id} className={`${td} text-center ${i === 0 ? 'border-l-2' : ''}`}
                      title={x ? `Demos on ${x.demoed} of the course's ${x.total} lectures (${x.demos} demos in all) · average QA score ${fmtScore(x.avg_score)} / 10 · last demo ${fmtDate(x.last_demo_date)}` : 'No demo'}>
                      {x ? <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[12px] font-bold tabular-nums text-foreground">{x.demoed}/{x.total}</span>
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${scoreTone(x.avg_score)}`}>QA {fmtScore(x.avg_score)}</span>
                      </div> : <span className="text-[11px] text-muted-foreground">{NONE}</span>}
                    </td>;
                  })}
                  <td className={`${td} border-l-2 bg-[#f6faf6] text-center`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[12px] font-bold tabular-nums text-foreground">{r.overall.demoed}/{r.overall.total}</span>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${scoreTone(r.overall.avg)}`}>QA {fmtScore(r.overall.avg)}</span>
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
