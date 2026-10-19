import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { downloadCsv, toCsv } from '@/lib/csv';
import { MultiSelectFilter } from './instructors';

// "Taught in class" training (2026-10-19, per request): a second Training view beside the learning-portal one, built from what each
// instructor has actually TAUGHT. One row per (instructor, course they have taught): topics of that course covered by their completed
// Lecture/Practice sessions / the course's topics (assignments, mock tests, quizzes/exams, interview prep and projects left out).
// All time. Completed = 80%+. Server side: connectors/taughtTraining.ts (built by the Training Status sync) and
// GET /reports/taught-training.

type TaughtRow = {
  employee_id: string | null;
  full_name: string;
  subject_area: string | null;
  capability_manager: string | null;
  product: string | null;
  course_id: string;
  course_title: string;
  course_subject: string | null;
  topics_total: number;
  topics_taught: number;
  taught_pct: number;
  completed: boolean;
  taught_topics: string[];
  sessions_completed: number;
  first_taught_date: string | null;
  last_taught_date: string | null;
};
type TaughtResponse = { rows: TaughtRow[]; completed_pct: number; synced_at: string | null };

const QUERY_KEY = ['reports', 'taught-training'];
const BANDS = [
  { key: 'done', label: '80%+ (completed)', test: (p: number) => p >= 80 },
  { key: 'mid', label: '50–79%', test: (p: number) => p >= 50 && p < 80 },
  { key: 'low', label: 'Below 50%', test: (p: number) => p < 50 },
];
const NONE = '—';
const tone = (p: number) => (p >= 80 ? 'bg-[#e5f3ed] text-[#256e65]' : p >= 50 ? 'bg-[#fff5dc] text-[#8a6212]' : 'bg-[#fff0ec] text-[#9b4434]');
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : NONE);
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
  const [subjects, setSubjects] = useState<string[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [bands, setBands] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      // Same sync as the learning-portal view: it rebuilds this table right after the training status.
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

  // Each filter's options are counted over the rows the OTHER filters leave, so the counts always add up to what you would see.
  const subjectOf = (r: TaughtRow) => r.course_subject ?? 'Unmapped';
  const pass = (r: TaughtRow, skip: string) =>
    (skip === 'subject' || !subjects.length || subjects.includes(subjectOf(r))) &&
    (skip === 'course' || !courses.length || courses.includes(r.course_title)) &&
    (skip === 'cm' || !managers.length || managers.includes(r.capability_manager ?? NONE)) &&
    (skip === 'product' || !products.length || products.includes(r.product ?? NONE)) &&
    (skip === 'band' || !bands.length || BANDS.some((b) => bands.includes(b.key) && b.test(r.taught_pct)));
  const optionsFor = (skip: string, value: (r: TaughtRow) => string) => {
    const counts = new Map<string, number>();
    for (const r of all) if (pass(r, skip)) counts.set(value(r), (counts.get(value(r)) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => ({ key, label: key, count }));
  };
  const filtered = useMemo(() => all.filter((r) => pass(r, '')), [all, subjects, courses, managers, products, bands]); // eslint-disable-line react-hooks/exhaustive-deps
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? filtered.filter((r) => r.full_name.toLowerCase().includes(q) || (r.employee_id ?? '').toLowerCase().includes(q) || r.course_title.toLowerCase().includes(q)) : filtered;
  }, [filtered, search]);
  const pager = usePagedRows(searched, 50);
  const anyFilter = subjects.length + courses.length + managers.length + products.length + bands.length > 0;

  const people = new Set(searched.map((r) => r.employee_id ?? r.full_name)).size;
  const courseCount = new Set(searched.map((r) => r.course_id)).size;
  const completed = searched.filter((r) => r.completed).length;

  const downloadTable = () => {
    const headers = ['Name', 'Employee ID', 'Instructor subject', 'Capability Manager', 'Product', 'Course', 'Course subject', 'Topics taught', 'Course topics', 'Taught %', 'Completed (80%+)', 'Sessions completed', 'First taught', 'Last taught', 'Topics taught (list)'];
    const rows = searched.map((r) => [r.full_name, r.employee_id ?? '', r.subject_area ?? '', r.capability_manager ?? '', r.product ?? '', r.course_title, r.course_subject ?? 'Unmapped', r.topics_taught, r.topics_total, r.taught_pct, r.completed ? 'Yes' : 'No', r.sessions_completed, r.first_taught_date ?? '', r.last_taught_date ?? '', r.taught_topics.join('; ')]);
    downloadCsv('training-taught-in-class.csv', toCsv(headers, rows));
  };

  return <div>
    <PageIntro
      eyebrow="BigQuery / completed sessions matched to each course's topics"
      title="Training Stats -- Taught in class"
      description="How much of each course an instructor has actually taught to students: course topics covered by their completed lecture/practice sessions (all time) out of the course's topics. Assignments, mock tests, quizzes/exams, interview prep and projects are not counted as topics. 80% or more = Completed."
      action={<div className="flex items-center gap-2">
        <button type="button" data-testid="button-refresh-taught-training" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary"><RefreshCw size={14} /> Refresh</button>
        <button type="button" data-testid="button-sync-taught-training" onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45">{syncing ? 'Syncing…' : 'Sync Now'}</button>
      </div>}
    />
    {syncMessage && <p className={`mb-4 max-w-2xl rounded-lg px-3 py-2 text-[12px] font-semibold ${syncMessage.ok ? 'bg-[#e5f3ed] text-[#256e65]' : 'bg-[#fff0ec] text-[#9b4434]'}`}>{syncMessage.text}</p>}

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Taught-in-class training is unavailable right now." />}

    {query.data && <>
      <div data-testid="taught-filters" className="mb-5 flex flex-wrap items-center gap-4">
        <MultiSelectFilter label="Course subject" options={optionsFor('subject', subjectOf)} selected={subjects} onChange={setSubjects} testId="select-taught-subject" />
        <MultiSelectFilter label="Course" options={optionsFor('course', (r) => r.course_title)} selected={courses} onChange={setCourses} testId="select-taught-course" widthClass="max-w-[260px]" />
        <MultiSelectFilter label="Capability Manager" options={optionsFor('cm', (r) => r.capability_manager ?? NONE)} selected={managers} onChange={setManagers} testId="select-taught-cm" />
        <MultiSelectFilter label="Product" options={optionsFor('product', (r) => r.product ?? NONE)} selected={products} onChange={setProducts} testId="select-taught-product" />
        <MultiSelectFilter label="Taught %" options={BANDS.map((b) => ({ key: b.key, label: b.label, count: all.filter((r) => pass(r, 'band') && b.test(r.taught_pct)).length }))} selected={bands} onChange={setBands} testId="select-taught-band" />
        {anyFilter && <button type="button" onClick={() => { setSubjects([]); setCourses([]); setManagers([]); setProducts([]); setBands([]); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary"><X size={13} /> Clear filters</button>}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">{formatKpi(searched.length)} instructor-course rows · {formatKpi(people)} instructors · {formatKpi(courseCount)} courses · {formatKpi(completed)} completed (80%+) · {query.data.synced_at ? `last synced ${new Date(query.data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'not synced yet -- click Sync Now'}</p>
        {all.length > 0 && <div className="flex flex-wrap items-center gap-2">
          <DownloadCsvButton onClick={downloadTable} disabled={searched.length === 0} label={`Download CSV (${formatKpi(searched.length)})`} testId="button-download-taught-csv" />
          <TableSearchInput value={search} onChange={setSearch} placeholder="Search name, employee ID or course..." testId="input-search-taught" />
        </div>}
      </div>

      {all.length === 0 ? <EmptyState title="No taught-in-class data yet" description="Run the database push, publish, then click Sync Now to build it." />
        : searched.length === 0 ? <EmptyState title="No rows match" description="Change or clear the filters." />
        : <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-[#f4f7f9]">
                  <th className={`sticky left-0 z-10 bg-[#f4f7f9] ${th}`}>Name</th>
                  <th className={th}>Employee ID</th>
                  <th className={th}>Instructor subject</th>
                  <th className={th}>Capability Manager</th>
                  <th className={th}>Product</th>
                  <th className={th}>Course</th>
                  <th className={th}>Course subject</th>
                  <th className={`${th} text-center`} title="Course topics covered by their completed sessions / the course's topics">Topics taught</th>
                  <th className={`${th} text-center`}>Taught %</th>
                  <th className={`${th} text-center`}>Sessions</th>
                  <th className={th}>Last taught</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((r) => <tr key={`${r.employee_id ?? r.full_name}-${r.course_id}`} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                  <td className={`sticky left-0 z-10 bg-card font-semibold text-foreground ${td}`}>{r.full_name}</td>
                  <td className={`${td} font-mono-ui text-[11px]`}>{r.employee_id || NONE}</td>
                  <td className={td}>{r.subject_area || NONE}</td>
                  <td className={`${td} text-muted-foreground`}>{r.capability_manager || NONE}</td>
                  <td className={td}>{r.product || NONE}</td>
                  <td className={`${td} font-semibold`}>{r.course_title}</td>
                  <td className={td}>{r.course_subject ?? <span className="text-muted-foreground">Unmapped</span>}</td>
                  <td className={`${td} text-center tabular-nums`} title={r.taught_topics.length ? `Taught: ${r.taught_topics.join(', ')}` : 'No topic matched yet'}>{r.topics_taught} / {r.topics_total}</td>
                  <td className={`${td} text-center`}><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${tone(r.taught_pct)}`}>{r.taught_pct}%</span></td>
                  <td className={`${td} text-center tabular-nums`}>{formatKpi(r.sessions_completed)}</td>
                  <td className={`${td} text-muted-foreground`}>{fmtDate(r.last_taught_date)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <TablePager page={pager.page} pageCount={pager.pageCount} pageSize={pager.pageSize} start={pager.start} end={pager.end} total={pager.total} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} />
        </div>}
    </>}
  </div>;
}
