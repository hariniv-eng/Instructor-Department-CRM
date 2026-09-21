import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Users, Building2 } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, usePagedRows, formatKpi } from '@/components/ui-pieces';

// Full joined exit-record dump (2026-09-19, per request: "the darwin data
// report id that we are using is limited to few details of data only ...
// for each employee_id ... pull other data from other new report Id"). The
// Exits tab only ever shows Employee Id/Full Name/Exit Date/Reason/Status,
// because that's all DBX_CHECK_REPORT_ID's own report returns. This page
// shows the full joined record instead -- every field darwinboxExits.ts
// merged in from DBX_CHECK_ENRICH_REPORT_IDS (config.ts, priority-ordered,
// first non-blank value per field wins) on top of the base 5 fields,
// straight from darwinbox_exits' rawData (see GET /reports/darwin-exit-
// details in reports.ts). `columns` is derived server-side from whatever
// fields are actually present, same "don't hardcode the shape" approach
// darwin-full-roster.tsx uses for the full company roster -- these
// enrichment reports' exact fields aren't fixed ahead of time.
type DarwinExitDetails = {
  count: number;
  columns: string[];
  rows: Record<string, unknown>[];
  synced_at: string | null;
  // Added 2026-09-21, per request: "now need to put filter for only
  // instructor team only ... get data of all the exit people who have
  // current department as 'instructor-...'". `rows`/`count` are scoped to
  // the Instructor team -- isInstructorTeamDepartment() in reports.ts,
  // an exact allowlist of the six real department values confirmed off
  // this page (NIAT_Instructors, NIAT_Instructors_DSA, NIAT_Instructors_
  // Aptitude & English, NIAT_Maths Instructors and Mentors, NIAT_
  // Instructors & Mentors, Instructors Department) PLUS (2026-09-21,
  // follow-up request: "in the exit data also add the instructor-'..'
  // current instructors to the exit data") anything starting with the word
  // "Instructor" -- the OTHER Darwinbox department-naming convention (the
  // primary Darwin roster style, e.g. "Instructors – Frontend Technologies
  // (NWD_ID_FT)"), which an exit record's Department field can also carry
  // instead of the NIAT_ style. The two conventions never collide, so this
  // is additive on top of the exact allowlist, not a replacement for it.
  // This reports the company-wide split behind that filter, learned from
  // the earlier "why did i only get 41" gap -- so if the filter is ever
  // excluding someone it shouldn't, that's visible here instead of a
  // silent count.
  diagnostics: {
    total_exit_records: number;
    instructor_team: number;
    other_or_unclassified: number;
  };
  // Every department Darwin's exit data carries, company-wide (not scoped
  // to the Instructor-team filter above), with a count for each (see
  // department_breakdown in reports.ts). "No department on file" is its own
  // entry for rows with nothing to classify from at all.
  department_breakdown: { department: string; count: number }[];
};

const QUERY_KEY = ['reports', 'darwin-exit-details'];

function useDarwinExitDetails() {
  return useQuery<DarwinExitDetails>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/darwin-exit-details');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export default function DarwinExitDetailsPage() {
  const queryClient = useQueryClient();
  const query = useDarwinExitDetails();
  const data = query.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  // Client-side pagination (2026-09-19, per request: "can we apply the pager
  // logic for the darwin full rooster and also the darwin exit tabs tables")
  // -- see usePagedRows/TablePager in ui-pieces.tsx. Only paginates the main
  // exit-records table below; the small department_breakdown list above is
  // short enough to show in full.
  const pager = usePagedRows(data?.rows ?? [], 50);

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="Darwinbox / exit report + enrichment reports, joined"
      title="Darwin Exit Details"
      description="Every field on file for each exited Instructor-team employee -- the base exit report's Employee Id / Full Name / Exit Date / Reason / Status, plus whatever the enrichment reports (DBX_CHECK_ENRICH_REPORT_IDS) add on top, joined by Employee Id. Scoped to the Instructor-team departments (NIAT_Instructors, NIAT_Instructors_DSA, NIAT_Instructors_Aptitude & English, NIAT_Maths Instructors and Mentors, NIAT_Instructors & Mentors, Instructors Department) plus any department starting with 'Instructors' (the other Darwinbox naming convention) -- other departments' exits aren't shown here. Refresh via the Exits sync (Source uploads) to pull the latest."
      action={<button type="button" data-testid="button-refresh-darwin-exit-details" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Darwin Exit Details is unavailable right now." />}

    {data && <div className="mb-3 grid max-w-xs grid-cols-1">
      <TopStat
        label="Instructor-team exit records"
        value={formatKpi(data.count)}
        meta={data.synced_at ? `As of last sync -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Sync time unavailable'}
        icon={<Users size={16} />}
        tone="navy"
      />
    </div>}

    {data && <p className="mb-6 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
      Out of <strong className="font-semibold text-foreground">{formatKpi(data.diagnostics.total_exit_records)}</strong> exit records on file company-wide,{' '}
      <strong className="font-semibold text-foreground">{formatKpi(data.diagnostics.other_or_unclassified)}</strong> are a different department (or have no department on file at all) and are excluded from the {formatKpi(data.count)} shown below -- see the department list for the full split.
    </p>}

    {data && data.department_breakdown.length > 0 && <div className="mb-8 max-w-md">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        <Building2 size={13} /> All departments in Darwin exit data
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse text-left">
          <tbody>
            {data.department_breakdown.map(({ department, count }) => <tr key={department} className="border-b border-border/70 last:border-0">
              <td className="px-4 py-2.5 text-[12px] text-foreground">{department}</td>
              <td className="px-4 py-2.5 text-right font-mono-ui text-[12px] tabular-nums text-muted-foreground">{formatKpi(count)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}

    {data && (data.count === 0
      ? <EmptyState title="No exit records yet" description="Run the Exits sync (Source uploads) to pull the base exit report and its enrichment reports." />
      : <div className="rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-[#f4f7f9]">
                {data.columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {pager.pageRows.map((row, index) => <tr key={index} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                {data.columns.map((column) => <td key={column} className="whitespace-nowrap px-4 py-3 text-[12px] text-foreground">{cellText(row[column]) || <span className="text-muted-foreground">—</span>}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        <TablePager
          page={pager.page}
          pageCount={pager.pageCount}
          pageSize={pager.pageSize}
          start={pager.start}
          end={pager.end}
          total={pager.total}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
        />
      </div>
    )}
  </div>;
}
