import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { downloadCsv, toCsv } from '@/lib/csv';
import { MultiSelectFilter } from './instructors';

// "Training - Readiness" view of Training Stats (2026-11-16, per request: Phase 1 of the Pre-Deployment Readiness plan). NIAT (Training)
// instructors: in-training demo score, AI assessment score (best attempt per lecture, averaged), Top-N (topin Daily + Weekly exams of
// their subject), completion (a demo AND an AI assessment on every lecture of their subject's lecture lists), a colour per score and
// overall = the lowest of the three, with "Incomplete" beside it. Show only. Server: GET /reports/training-readiness.
type Colour = 'green' | 'yellow' | 'red' | 'none';
type Course = { key: string; title: string; lectures_total: number; demo_lectures: number; ai_lectures: number; both_lectures: number; demo_avg: number | null; ai_avg: number | null };
type Row = {
  employee_id: string | null; full_name: string; subject_area: string | null; capability_manager: string | null;
  has_lecture_list: boolean; lectures_total: number; demo_lectures: number; ai_lectures: number; both_lectures: number; complete: boolean;
  demo_avg: number | null; ai_avg: number | null; topn_avg: number | null; topn_exams: number;
  demo_colour: Colour; ai_colour: Colour; topn_colour: Colour; overall: 'green' | 'yellow' | 'red'; courses: Course[];
};
type T = { green: number; yellow: number };
type Resp = { rows: Row[]; thresholds: { demo: T; ai: T; topn: T }; fetched_at: string };

const QUERY_KEY = ['reports', 'training-readiness'];
const NONE = '—';
const LABEL: Record<Colour, string> = { green: 'Green', yellow: 'Yellow', red: 'Red', none: 'No data' };
const CHIP: Record<Colour, string> = { green: 'bg-[#e5f3ed] text-[#256e65]', yellow: 'bg-[#fff5dc] text-[#8a6212]', red: 'bg-[#fff0ec] text-[#9b4434]', none: 'bg-secondary text-muted-foreground' };
const DOT: Record<Colour, string> = { green: 'bg-[#2f8f6b]', yellow: 'bg-[#d9a21b]', red: 'bg-[#c4553f]', none: 'bg-muted-foreground/40' };
const statusOf = (r: Row) => (!r.has_lecture_list ? 'No lecture list' : r.complete ? 'Complete' : 'Incomplete');
const th = 'whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
const td = 'whitespace-nowrap border-r border-border px-4 py-3 text-[12px]';
const f1 = (v: number | null, pct = false) => (v === null ? NONE : pct ? `${v.toFixed(1)}%` : v.toFixed(2));

function Score({ v, c, sub, pct }: { v: number | null; c: Colour; sub: string; pct?: boolean }) {
  return <div className="mx-auto flex flex-col items-center gap-0.5">
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${CHIP[c]}`}>{f1(v, pct)}</span>
    <span className="text-[10px] text-muted-foreground">{sub}</span>
  </div>;
}
function Overall({ r }: { r: Row }) {
  return <div className="flex items-center gap-2">
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CHIP[r.overall]}`}><span className={`h-2 w-2 rounded-full ${DOT[r.overall]}`} />{LABEL[r.overall]}</span>
    {r.overall === 'green' && r.complete && <span className="text-[10px] font-bold uppercase tracking-wide text-[#256e65]">Ready</span>}
    {!r.complete && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{statusOf(r)}</span>}
  </div>;
}
function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <div className="min-w-[110px]">
    <div className="flex justify-between text-[11px] tabular-nums"><span className="font-bold text-foreground">{done} / {total}</span><span className="text-muted-foreground">{pct}%</span></div>
    <div className="mt-1 h-1.5 rounded-full bg-secondary"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
  </div>;
}

export function TrainingReadinessView() {
  const queryClient = useQueryClient();
  const [force, setForce] = useState(false);
  const query = useQuery<Resp>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch(`/api/reports/training-readiness${force ? '?refresh=1' : ''}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
  const all = query.data?.rows ?? [];
  const t = query.data?.thresholds;
  const [subjects, setSubjects] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [overalls, setOveralls] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => { setForce(true); queryClient.invalidateQueries({ queryKey: QUERY_KEY }); };

  const pass = (r: Row, skip: string) =>
    (skip === 'subject' || !subjects.length || subjects.includes(r.subject_area ?? NONE)) &&
    (skip === 'cm' || !managers.length || managers.includes(r.capability_manager ?? NONE)) &&
    (skip === 'overall' || !overalls.length || overalls.includes(LABEL[r.overall])) &&
    (skip === 'status' || !statuses.length || statuses.includes(statusOf(r)));
  const optionsFor = (skip: string, value: (r: Row) => string) => {
    const counts = new Map<string, number>();
    for (const r of all) if (pass(r, skip)) counts.set(value(r), (counts.get(value(r)) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => ({ key, label: key, count }));
  };
  const filtered = useMemo(() => all.filter((r) => pass(r, '')), [all, subjects, managers, overalls, statuses]); // eslint-disable-line react-hooks/exhaustive-deps
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? filtered.filter((r) => r.full_name.toLowerCase().includes(q) || (r.employee_id ?? '').toLowerCase().includes(q)) : filtered;
  }, [filtered, search]);
  const pager = usePagedRows(searched, 50);
  const anyFilter = subjects.length + managers.length + overalls.length + statuses.length > 0;
  const kpi = useMemo(() => ({
    ready: searched.filter((r) => r.overall === 'green' && r.complete).length,
    green: searched.filter((r) => r.overall === 'green').length,
    yellow: searched.filter((r) => r.overall === 'yellow').length,
    red: searched.filter((r) => r.overall === 'red').length,
    complete: searched.filter((r) => r.complete).length,
  }), [searched]);

  const downloadTable = () => {
    const headers = ['Name', 'Employee ID', 'Subject', 'Capability Manager', 'Lectures total', 'Lectures with demo', 'Lectures with AI assessment', 'Lectures with both', 'Complete',
      'Demo score (avg best /10)', 'Demo colour', 'AI score (avg best /10)', 'AI colour', 'Top-N exams', 'Top-N avg best %', 'Top-N colour', 'Overall'];
    const rows = searched.map((r) => [r.full_name, r.employee_id ?? '', r.subject_area ?? '', r.capability_manager ?? '', r.lectures_total, r.demo_lectures, r.ai_lectures, r.both_lectures,
      statusOf(r), r.demo_avg ?? '', LABEL[r.demo_colour], r.ai_avg ?? '', LABEL[r.ai_colour], r.topn_exams, r.topn_avg ?? '', LABEL[r.topn_colour], LABEL[r.overall]]);
    downloadCsv('training-readiness.csv', toCsv(headers, rows));
  };

  const card = (label: string, value: number, tone: string) => <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
    <div className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    <div className={`mt-1 text-[22px] font-bold tabular-nums ${tone}`}>{formatKpi(value)}</div>
  </div>;

  return <div>
    <PageIntro
      eyebrow="BigQuery / QA ratings + topin exams, read live"
      title="Training - Readiness"
      description={`NIAT (Training) instructors. Demo and AI scores = best attempt per lecture, averaged over the lectures done (in-training only; demos under 10 minutes do not count). Top-N = average best % of Daily + Weekly topin exams in their subject. Complete = a demo AND an AI assessment on every lecture of their subject's courses. Green: demo ≥ ${t?.demo.green ?? 7.5}, AI ≥ ${t?.ai.green ?? 8.5}, Top-N ≥ ${t?.topn.green ?? 75}%. Yellow: demo ≥ ${t?.demo.yellow ?? 6.5}, AI ≥ ${t?.ai.yellow ?? 7.5}, Top-N ≥ ${t?.topn.yellow ?? 60}%. Below that: Red. Overall = the lowest of the three (no data counts as Red). Ready = overall Green and complete.`}
      action={<button type="button" data-testid="button-refresh-readiness" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary"><RefreshCw size={14} /> Refresh</button>}
    />
    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Readiness data is unavailable right now." />}

    {query.data && (all.length === 0 ? <EmptyState title="No training instructors" description="No NIAT (Training) instructors in TeachOS right now." /> : <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {card('Ready', kpi.ready, 'text-[#256e65]')}
        {card('Green', kpi.green, 'text-[#256e65]')}
        {card('Yellow', kpi.yellow, 'text-[#8a6212]')}
        {card('Red', kpi.red, 'text-[#9b4434]')}
        {card('Complete', kpi.complete, 'text-foreground')}
      </div>

      <div data-testid="readiness-filters" className="relative z-30 mb-5 flex flex-wrap items-center gap-4">
        <MultiSelectFilter label="Subject" options={optionsFor('subject', (r) => r.subject_area ?? NONE)} selected={subjects} onChange={setSubjects} testId="select-readiness-subject" />
        <MultiSelectFilter label="Capability Manager" options={optionsFor('cm', (r) => r.capability_manager ?? NONE)} selected={managers} onChange={setManagers} testId="select-readiness-cm" />
        <MultiSelectFilter label="Overall" options={optionsFor('overall', (r) => LABEL[r.overall])} selected={overalls} onChange={setOveralls} testId="select-readiness-overall" />
        <MultiSelectFilter label="Completion" options={optionsFor('status', statusOf)} selected={statuses} onChange={setStatuses} testId="select-readiness-status" />
        {anyFilter && <button type="button" onClick={() => { setSubjects([]); setManagers([]); setOveralls([]); setStatuses([]); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary"><X size={13} /> Clear filters</button>}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">{formatKpi(searched.length)} instructors · click a row for the per-course breakdown · read {new Date(query.data.fetched_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadCsvButton onClick={downloadTable} disabled={searched.length === 0} label={`Download CSV (${formatKpi(searched.length)})`} testId="button-download-readiness-csv" />
          <TableSearchInput value={search} onChange={setSearch} testId="input-search-readiness" />
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
                  <th className={th}>Subject</th>
                  <th className={th}>Capability Manager</th>
                  <th className={th}>Lectures done (demo + AI)</th>
                  <th className={`${th} text-center`}>Demo score</th>
                  <th className={`${th} text-center`}>AI score</th>
                  <th className={`${th} text-center`}>Top-N</th>
                  <th className={th}>Overall</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((r) => {
                  const id = r.employee_id ?? r.full_name;
                  const isOpen = open === id;
                  return <Fragment key={id}>
                    <tr onClick={() => setOpen(isOpen ? null : id)} className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                      <td className={`sticky left-0 z-10 bg-card font-semibold text-foreground ${td}`}><span className="inline-flex items-center gap-1.5">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{r.full_name}</span></td>
                      <td className={`${td} font-mono-ui text-[11px]`}>{r.employee_id || NONE}</td>
                      <td className={td}>{r.subject_area || NONE}</td>
                      <td className={`${td} text-muted-foreground`}>{r.capability_manager || NONE}</td>
                      <td className={td}>{r.has_lecture_list ? <Progress done={r.both_lectures} total={r.lectures_total} /> : <span className="text-[11px] text-muted-foreground">No lecture list for this subject</span>}</td>
                      <td className={`${td} text-center`}><Score v={r.demo_avg} c={r.demo_colour} sub={`${r.demo_lectures} lecture${r.demo_lectures === 1 ? '' : 's'}`} /></td>
                      <td className={`${td} text-center`}><Score v={r.ai_avg} c={r.ai_colour} sub={`${r.ai_lectures} lecture${r.ai_lectures === 1 ? '' : 's'}`} /></td>
                      <td className={`${td} text-center`}><Score v={r.topn_avg} c={r.topn_colour} sub={`${r.topn_exams} exam${r.topn_exams === 1 ? '' : 's'}`} pct /></td>
                      <td className={td}><Overall r={r} /></td>
                    </tr>
                    {isOpen && <tr className="border-b border-border bg-[#f8fafb]">
                      <td colSpan={9} className="px-6 py-4">
                        {r.courses.length === 0 ? <p className="text-[12px] text-muted-foreground">No lecture-list courses for {r.subject_area ?? 'this subject'}.</p> :
                          <table className="text-left">
                            <thead><tr>{['Course', 'Lectures', 'With demo', 'With AI', 'Both', 'Demo avg', 'AI avg'].map((h) => <th key={h} className="px-3 py-1.5 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{h}</th>)}</tr></thead>
                            <tbody>{r.courses.map((c) => <tr key={c.key} className="text-[12px] tabular-nums">
                              <td className="px-3 py-1.5 font-semibold text-foreground">{c.title}</td>
                              <td className="px-3 py-1.5">{c.lectures_total}</td>
                              <td className="px-3 py-1.5">{c.demo_lectures}</td>
                              <td className="px-3 py-1.5">{c.ai_lectures}</td>
                              <td className={`px-3 py-1.5 font-bold ${c.both_lectures === c.lectures_total ? 'text-[#256e65]' : 'text-foreground'}`}>{c.both_lectures}</td>
                              <td className="px-3 py-1.5">{f1(c.demo_avg)}</td>
                              <td className="px-3 py-1.5">{f1(c.ai_avg)}</td>
                            </tr>)}</tbody>
                          </table>}
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
