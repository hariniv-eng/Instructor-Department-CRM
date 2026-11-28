import { formatKpi } from '@/components/ui-pieces';

// Semester buttons (2026-11-28, per request: "show Sem 1, Sem 2 ... Sem 6 separately -- the subjects of that semester and their rate of
// completion -- on Training - LP, Training - Demos and Taught in Class"). "All semesters" = the view as it was; a semester button narrows
// the page to that semester's courses. Every button is always shown; one with no courses mapped yet shows 0 and is dimmed.
export const SEMESTER_BUTTONS = [1, 2, 3, 4, 5, 6] as const;

export function SemesterButtons({ value, onChange, counts, unit = 'courses', testId }: {
  value: number | null;
  onChange: (sem: number | null) => void;
  counts: Record<number, number>;
  unit?: string;
  testId: string;
}) {
  const base = 'rounded-lg px-3.5 py-2 text-[12px] font-bold transition-colors';
  const on = 'bg-foreground text-background shadow-sm';
  const off = 'border border-border bg-card text-muted-foreground hover:text-foreground';
  return <div data-testid={testId} className="mb-4 flex flex-wrap items-center gap-2">
    <span className="mr-1 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Semester</span>
    <button type="button" data-testid={`${testId}-all`} onClick={() => onChange(null)} className={`${base} ${value === null ? on : off}`}>All semesters</button>
    {SEMESTER_BUTTONS.map((sem) => {
      const n = counts[sem] ?? 0;
      return <button key={sem} type="button" data-testid={`${testId}-${sem}`} onClick={() => onChange(sem)} title={`${formatKpi(n)} ${unit} in Semester ${sem}`}
        className={`${base} ${value === sem ? on : off} ${n === 0 && value !== sem ? 'opacity-50' : ''}`}>
        Sem {sem} <span className="ml-1 tabular-nums opacity-70">{formatKpi(n)}</span>
      </button>;
    })}
  </div>;
}

// Average completion by subject for one semester: one row per subject, each value an average % over the instructors listed.
export function SemesterSubjectSummary({ title, note, columns, rows, testId }: {
  title: string;
  note?: string;
  columns: string[];
  rows: { subject: string; courses: number; instructors: number; values: (number | null)[] }[];
  testId: string;
}) {
  const tone = (p: number | null) => (p === null ? 'text-muted-foreground' : p >= 80 ? 'text-[#256e65]' : p >= 50 ? 'text-[#8a6212]' : 'text-[#9b4434]');
  return <div data-testid={testId} className="mb-5 overflow-x-auto rounded-md border border-border bg-card">
    <p className="border-b border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-border text-left font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <th className="whitespace-nowrap px-4 py-2 font-normal">Subject</th>
          <th className="whitespace-nowrap px-3 py-2 text-right font-normal">Courses</th>
          <th className="whitespace-nowrap px-3 py-2 text-right font-normal">Instructors</th>
          {columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 text-right font-normal">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <tr><td colSpan={3 + columns.length} className="px-4 py-3 text-muted-foreground">No courses of this semester have data yet.</td></tr>
          : rows.map((r) => <tr key={r.subject} className="border-b border-border last:border-b-0">
            <td className="whitespace-nowrap px-4 py-2 font-semibold text-foreground">{r.subject}</td>
            <td className="px-3 py-2 text-right font-mono-ui tabular-nums">{formatKpi(r.courses)}</td>
            <td className="px-3 py-2 text-right font-mono-ui tabular-nums">{formatKpi(r.instructors)}</td>
            {r.values.map((v, i) => <td key={columns[i]} className={`px-3 py-2 text-right font-mono-ui font-bold tabular-nums ${tone(v)}`}>{v === null ? '—' : `${v}%`}</td>)}
          </tr>)}
      </tbody>
    </table>
    {note && <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{note}</p>}
  </div>;
}

export const avgPct = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10 : null);
