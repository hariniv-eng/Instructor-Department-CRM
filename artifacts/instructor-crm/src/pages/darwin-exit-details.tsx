import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Users, AlertTriangle } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, TableSearchInput, DownloadCsvButton, usePagedRows, formatKpi } from '@/components/ui-pieces';
import { toCsv, downloadCsv } from '@/lib/csv';

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
//
// Company-wide, every department (2026-09-27, per request: "we are going
// to remove all the tables that we have right now ... load all the
// 3,000+ data that we have for total companies") -- this route used to be
// scoped down to just the Instructor-team departments (and, before that,
// diagnostic fields/a department_breakdown table existed purely to sanity-
// check that scoping); both are gone now that there's no filter left to
// diagnose. The only row still excluded is a "Revoked" status (the
// separation request was cancelled -- the person never actually exited).
type DarwinExitDetails = {
  count: number;
  columns: string[];
  rows: Record<string, unknown>[];
  synced_at: string | null;
  total_exit_records: number;
  revoked_excluded: number;
  // Exception filter (2026-09-27, per request: "can you keep this exception
  // filter in the darwin exit tab that will help get the records of
  // exceptions") -- `is_exception` on each row (not a displayed column,
  // just a flag) says whether that exit record belongs to someone currently
  // sitting in the Instructors tab's Exception review queue (exit-flagged,
  // not yet resolved, within the Instructor Department population) -- see
  // computeDepartmentAndExceptionRows() in reports.ts for the exact
  // eligibility logic this mirrors.
  exception_count: number;
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
  // logic for the darwin full rooster and also the darwin exit tabs tables"),
  // same usePagedRows/TablePager as darwin-full-roster.tsx -- proven at this
  // same ~3,300-row, all-departments scale already, so no new mechanism is
  // needed now that this table shows the same company-wide volume.
  //
  // Search box (2026-09-24, per request: "where ever there are tables in
  // the application add search option to search for any person") -- same
  // approach as darwin-full-roster.tsx: `columns` here is dynamic (whatever
  // the base + enrichment reports actually returned), so the search matches
  // against every column's value rather than one fixed "name" field.
  const [search, setSearch] = useState('');
  // Exception-only toggle (2026-09-27, per request: "can you keep this
  // exception filter in the darwin exit tab that will help get the records
  // of exceptions") -- narrows the table down to just the rows flagged
  // `is_exception` by the API, combined with the search box above (both
  // apply together, same as any other filter+search combination elsewhere
  // in the app).
  const [exceptionOnly, setExceptionOnly] = useState(false);
  const filteredRows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (exceptionOnly && !row.is_exception) return false;
      if (!query) return true;
      return data.columns.some((column) => cellText(row[column]).toLowerCase().includes(query));
    });
  }, [data, search, exceptionOnly]);
  const pager = usePagedRows(filteredRows, 50);

  // CSV export (2026-09-27, per request: "also try to add the download-in-
  // CSV option so that we can download that particular thing") -- same
  // client-side toCsv/downloadCsv pattern used across the app (Instructors,
  // Overview, breakdown panels): everything's already loaded in memory by
  // the time someone wants to download it, so no export endpoint is needed.
  // Exports whatever the current search + Exception-only toggle has
  // matched (all of it, not just the current page), same columns as the
  // table.
  const handleDownload = () => {
    if (!data) return;
    const csv = toCsv(data.columns, filteredRows.map((row) => data.columns.map((column) => cellText(row[column]))));
    downloadCsv('darwin-exit-details.csv', csv);
  };

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="Darwinbox / exit report + enrichment reports, joined"
      title="Darwin Exit Details"
      description="Every field on file for each exited employee, company-wide, every department -- the base exit report's Employee Id / Full Name / Exit Date / Reason / Status, plus whatever the enrichment reports (DBX_CHECK_ENRICH_REPORT_IDS) add on top. The only exclusion is a 'Revoked' status -- that separation request was cancelled, so the person never actually exited. Refresh via the Exits sync (Source uploads) to pull the latest."
      action={<button type="button" data-testid="button-refresh-darwin-exit-details" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Darwin Exit Details is unavailable right now." />}

    {data && <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
      <div className="grid max-w-xs grid-cols-1">
        <TopStat
          label="Exit records (all departments)"
          value={formatKpi(data.count)}
          meta={data.synced_at ? `As of last sync -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Sync time unavailable'}
          icon={<Users size={16} />}
          tone="navy"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {data.count > 0 && <TableSearchInput value={search} onChange={setSearch} testId="input-search-darwin-exit-details" />}
        <button
          type="button"
          data-testid="button-toggle-exception-only-darwin-exit-details"
          onClick={() => setExceptionOnly((value) => !value)}
          aria-pressed={exceptionOnly}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${exceptionOnly ? 'border-[#a15417] bg-[#fdeadd] text-[#a15417]' : 'border-border bg-card text-foreground hover:bg-secondary'}`}
        >
          <AlertTriangle size={13} /> Exceptions only{data.exception_count > 0 ? ` (${formatKpi(data.exception_count)})` : ''}
        </button>
        <DownloadCsvButton onClick={handleDownload} disabled={data.count === 0} testId="button-download-darwin-exit-details" />
      </div>
    </div>}

    {data && data.revoked_excluded > 0 && <p className="mb-6 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
      Out of <strong className="font-semibold text-foreground">{formatKpi(data.total_exit_records)}</strong> exit records on file company-wide,{' '}
      <strong className="font-semibold text-foreground">{formatKpi(data.revoked_excluded)}</strong> {data.revoked_excluded === 1 ? 'was' : 'were'} Revoked (the separation request was cancelled) and {data.revoked_excluded === 1 ? "isn't" : "aren't"} shown below.
    </p>}

    {data && data.count === 0 && <EmptyState title="No exit records yet" description="Run the Exits sync (Source uploads) to pull the base exit report and its enrichment reports." />}

    {data && data.count > 0 && filteredRows.length === 0 && <EmptyState title={exceptionOnly ? 'No Exceptions right now' : 'No one matches this search'} description={exceptionOnly ? "Nobody here is both exit-flagged and unresolved -- try clearing the search box, or turn off Exceptions only." : 'Try a broader search or clear the search box.'} />}

    {data && data.count > 0 && filteredRows.length > 0 && (
      <div className="rounded-lg border border-border">
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
