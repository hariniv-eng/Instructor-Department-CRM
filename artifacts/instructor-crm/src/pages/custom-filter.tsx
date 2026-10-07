import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ChevronDown, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { useGetReportsInstructors } from '@workspace/api-client-react';
import { campusCityAndState } from '@/lib/campusRegions';
import { EmptyState, QueryError, SkeletonBlock, DownloadCsvButton, PageIntro } from '@/components/ui-pieces';
import {
  ACCESS_LABELS,
  CategoryTable,
  EXIT_VERIFICATION_LABELS,
  bifurcationLabel,
  downloadInstructorsCsv,
  mergedPeople,
  normalizeGender,
  productLabel,
  type PersonWithAccess,
} from '@/pages/instructors';

// Custom filter page (2026-10-07, per request: "keep the regular filter as it
// is and add a custom filter button ... a new tab with a side bar showing
// every column with a dropdown of its unique values; once they choose, the
// table is customised that way"). Works on the whole Instructor Department
// (Instructors + Mentors + Operations team, the same people as the Overview's
// "Instructor Department" card), so Bifurcation is one of the filters.
//
// Every column except identifiers (name, employee ID, TeachOS user ID, email,
// date of joining) is a filter. Within one column the selected values are OR'd;
// different columns are AND'd. Counts next to each value are "faceted": they
// show how many people would match given every OTHER column's selection, so
// you can see at a glance what a further pick would leave.

const NOT_SET = '(Not set)';

type Facet = { key: string; label: string; values: (person: PersonWithAccess) => string[] };

const clean = (value: string | null | undefined) => (value ?? '').trim();
const splitList = (value: string) => value.split(';').map((part) => part.trim()).filter(Boolean);

const FACETS: Facet[] = [
  { key: 'bifurcation', label: 'Bifurcation', values: (p) => [bifurcationLabel(p.classification)] },
  { key: 'access', label: 'Access', values: (p) => [ACCESS_LABELS[p.access]] },
  { key: 'payroll', label: 'Payroll', values: (p) => [p.is_payroll ? 'Payroll' : 'Nxtwave'] },
  { key: 'product', label: 'Product', values: (p) => [productLabel(p)] },
  { key: 'designation', label: 'Designation', values: (p) => [clean(p.designation)] },
  { key: 'subject', label: 'Subject', values: (p) => [clean(p.dept_area)] },
  { key: 'department', label: 'Department', values: (p) => [clean(p.department)] },
  { key: 'campus', label: 'Campus', values: (p) => (p.institutes ?? []).map(clean).filter(Boolean) },
  { key: 'campus_city', label: 'campus_city', values: (p) => splitList(campusCityAndState(p.institutes).city) },
  { key: 'campus_state', label: 'campus_state', values: (p) => splitList(campusCityAndState(p.institutes).state) },
  { key: 'location', label: 'Location (Darwin)', values: (p) => [clean(p.work_location)] },
  { key: 'capability_manager', label: 'Capability Manager', values: (p) => [clean(p.capability_manager)] },
  { key: 'darwin_manager', label: 'Manager (Darwin)', values: (p) => [clean(p.darwin_manager)] },
  { key: 'gender', label: 'Gender', values: (p) => [{ male: 'Male', female: 'Female', unknown: 'Not on file' }[normalizeGender(p.gender)]] },
  {
    key: 'employee_status',
    label: 'Employee Status',
    values: (p) => [p.exit_flag || p.is_payroll ? EXIT_VERIFICATION_LABELS[p.exit_verification ?? ''] ?? 'Not reviewed' : 'No exit record'],
  },
  {
    key: 'enrolled_plan',
    label: 'Enrolled Plan',
    values: (p) => clean(p.enrolled_plans).split(/\r?\n/).map((line) => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean),
  },
  { key: 'contribution', label: 'Contribution', values: (p) => (p.niat_cohorts ?? []).map(clean).filter(Boolean) },
  { key: 'joining_year', label: 'Joining year', values: (p) => [clean(p.date_of_joining).slice(0, 4)] },
];

const valuesOf = (facet: Facet, person: PersonWithAccess): string[] => {
  const values = facet.values(person).filter((value) => value !== '');
  return values.length > 0 ? values : [NOT_SET];
};

type Selection = Record<string, string[]>;

function matches(person: PersonWithAccess, selection: Selection, exceptKey?: string): boolean {
  return FACETS.every((facet) => {
    const chosen = selection[facet.key];
    if (!chosen || chosen.length === 0 || facet.key === exceptKey) return true;
    return valuesOf(facet, person).some((value) => chosen.includes(value));
  });
}

function serializeQuery(selection: Selection, from: string): string {
  const params = new URLSearchParams();
  const compact: Selection = {};
  for (const [key, list] of Object.entries(selection)) if (list.length > 0) compact[key] = list;
  if (Object.keys(compact).length > 0) params.set('f', JSON.stringify(compact));
  if (from) params.set('from', from);
  return params.toString();
}

function parseQuery(search: string): { selection: Selection; from: string } {
  const params = new URLSearchParams(search);
  const selection: Selection = {};
  try {
    const raw = JSON.parse(params.get('f') ?? '{}') as Record<string, unknown>;
    for (const facet of FACETS) {
      const list = raw[facet.key];
      if (Array.isArray(list)) selection[facet.key] = list.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    // A stale or hand-edited URL just starts with no filters.
  }
  return { selection, from: params.get('from') ?? '' };
}

export default function CustomFilterPage() {
  const reportQuery = useGetReportsInstructors();
  const report = reportQuery.data;
  const everyone = useMemo(() => mergedPeople(report?.access_breakdown?.department), [report]);
  // Filters live in the URL (?f=...) so opening a person's profile and coming
  // back -- or a reload, or the browser's back button -- keeps every pick.
  // `from` is the Instructors tab's own filter query, carried through so "Back
  // to Instructors" can restore that tab exactly as it was left.
  const initialQuery = useMemo(() => parseQuery(typeof window !== 'undefined' ? window.location.search : ''), []);
  const [selection, setSelection] = useState<Selection>(initialQuery.selection);
  const [openFacet, setOpenFacet] = useState<string | null>('bifurcation');
  const from = initialQuery.from;
  const cfQuery = serializeQuery(selection, from);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = cfQuery ? `/instructors/custom-filter?${cfQuery}` : '/instructors/custom-filter';
    if (window.location.pathname + window.location.search !== next) window.history.replaceState(window.history.state, '', next);
  }, [cfQuery]);
  const backHref = from ? `/instructors?${from}` : '/instructors';
  const filtered = useMemo(() => everyone.filter((person) => matches(person, selection)), [everyone, selection]);
  const activeCount = Object.values(selection).reduce((sum, list) => sum + list.length, 0);

  // Every unique value per column, over EVERYONE (so a selected value never
  // vanishes from its list), with counts faceted by the other columns.
  const facetOptions = useMemo(() => {
    const result: Record<string, { value: string; count: number }[]> = {};
    for (const facet of FACETS) {
      const counts = new Map<string, number>();
      for (const person of everyone) for (const value of new Set(valuesOf(facet, person))) if (!counts.has(value)) counts.set(value, 0);
      for (const person of everyone) {
        if (!matches(person, selection, facet.key)) continue;
        for (const value of new Set(valuesOf(facet, person))) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      result[facet.key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => (a.value === NOT_SET ? 1 : b.value === NOT_SET ? -1 : a.value.localeCompare(b.value, undefined, { numeric: true })));
    }
    return result;
  }, [everyone, selection]);

  const toggleValue = (key: string, value: string) => {
    setSelection((current) => {
      const list = current[key] ?? [];
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      return { ...current, [key]: next };
    });
  };
  const clearFacet = (key: string) => setSelection((current) => ({ ...current, [key]: [] }));

  // Layout: the filter sidebar runs down the right-hand side from the very top of
  // the page (level with the Back button and title); the left column holds the
  // Back button, heading and table. It stays in view under the sticky header.
  return <div className="flex w-full flex-col gap-5 lg:flex-row lg:items-start">
    <div className="min-w-0 flex-1">
      <Link href={backHref} data-testid="button-custom-filter-back" className="mb-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary"><ArrowLeft size={14} /> Back to Instructors</Link>

      <PageIntro
        eyebrow="Instructors / Custom filter"
        title="Custom filter"
        description="Pick values from any column in the sidebar on the right to build your own view of the Instructor Department. Values within a column are OR'd; different columns are AND'd."
      />

      {reportQuery.isLoading && <SkeletonBlock className="h-[520px]" />}
      {reportQuery.isError && <QueryError message="The instructor register could not be loaded." />}

      {report && <section className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><span data-testid="text-custom-filter-count">{filtered.length}</span> of {everyone.length} people in view</p>
          {activeCount === 0 && <p className="text-[11px] text-muted-foreground">No filters picked yet -- showing everyone in the Instructor Department.</p>}
        </div>
        <DownloadCsvButton onClick={() => downloadInstructorsCsv('department', filtered, 'custom-filter.csv')} disabled={filtered.length === 0} testId="button-download-custom-filter-csv" />
      </div>

      {activeCount > 0 && <div className="mb-4 flex flex-wrap gap-1.5" data-testid="custom-filter-chips">
        {FACETS.flatMap((facet) => (selection[facet.key] ?? []).map((value) => <button
          key={`${facet.key}:${value}`}
          type="button"
          onClick={() => toggleValue(facet.key, value)}
          title="Remove this filter"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/70"
        ><span className="text-muted-foreground">{facet.label}:</span><span className="truncate">{value}</span><X size={12} className="shrink-0 text-muted-foreground" /></button>))}
      </div>}

      {filtered.length === 0
        ? <EmptyState title="No one matches these filters" description="Remove a filter chip or clear everything to see people again." />
        : <CategoryTable category="department" people={filtered} backQuery={cfQuery} backPrefix="cf:" linkMode="name" />}
      </section>}
    </div>

    {report && <aside className="w-full shrink-0 rounded-xl border border-border bg-card shadow-xs lg:sticky lg:top-[92px] lg:max-h-[calc(100dvh-108px)] lg:w-[300px] lg:overflow-y-auto" data-testid="sidebar-custom-filter">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><SlidersHorizontal size={13} /> Columns</p>
        <button type="button" onClick={() => setSelection({})} disabled={activeCount === 0} data-testid="button-clear-custom-filters" className="text-[11px] font-bold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">Clear all{activeCount > 0 ? ` (${activeCount})` : ''}</button>
      </div>
      {FACETS.map((facet) => {
        const options = facetOptions[facet.key] ?? [];
        const chosen = selection[facet.key] ?? [];
        const open = openFacet === facet.key;
        return <div key={facet.key} className="border-b border-border/70 last:border-0">
          <button type="button" onClick={() => setOpenFacet(open ? null : facet.key)} data-testid={`button-facet-${facet.key}`} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-secondary/60">
            <span className="flex min-w-0 items-center gap-2">
              {open ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />}
              <span className="truncate text-[12px] font-bold text-foreground">{facet.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {chosen.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">{chosen.length}</span>}
              <span className="text-[10px] text-muted-foreground">{options.length}</span>
            </span>
          </button>
          {open && <FacetOptions
            facetKey={facet.key}
            options={options}
            chosen={chosen}
            onToggle={(value) => toggleValue(facet.key, value)}
            onClear={() => clearFacet(facet.key)}
          />}
        </div>;
      })}
    </aside>}
  </div>;
}

function FacetOptions({ facetKey, options, chosen, onToggle, onClear }: {
  facetKey: string;
  options: { value: string; count: number }[];
  chosen: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const shown = query.trim() ? options.filter((option) => option.value.toLowerCase().includes(query.trim().toLowerCase())) : options;
  return <div className="px-4 pb-3">
    {options.length > 8 && <input
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Search values..."
      data-testid={`input-facet-search-${facetKey}`}
      className="mb-2 h-8 w-full rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
    />}
    <div className="max-h-[240px] space-y-0.5 overflow-y-auto pr-1">
      {shown.map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-secondary/60">
        <input type="checkbox" checked={chosen.includes(option.value)} onChange={() => onToggle(option.value)} data-testid={`checkbox-${facetKey}-${option.value}`} className="h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]" />
        <span className="min-w-0 flex-1 truncate text-foreground" title={option.value}>{option.value}</span>
        <span className="shrink-0 font-mono-ui text-[10px] text-muted-foreground">{option.count}</span>
      </label>)}
      {shown.length === 0 && <p className="px-1.5 py-2 text-[11px] text-muted-foreground">No values match.</p>}
    </div>
    {chosen.length > 0 && <button type="button" onClick={onClear} className="mt-2 text-[11px] font-bold text-primary hover:underline">Clear {chosen.length} selected</button>}
  </div>;
}
