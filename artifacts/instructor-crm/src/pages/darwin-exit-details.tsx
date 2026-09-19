import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Users, Building2 } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, formatKpi } from '@/components/ui-pieces';

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
  // Added 2026-09-19, per follow-up "i just need the list of all the
  // departements from darwin exit data" -- every department Top Department
  // has ever taken across the exit records, with a count for each (see
  // department_breakdown in reports.ts). "No Top Department on file" is its
  // own entry for rows whose Employee Id never matched an enrichment report.
  // Kept as extra context even after the page went back to showing every
  // department's rows (see below) -- still useful on its own.
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

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="Darwinbox / exit report + enrichment reports, joined"
      title="Darwin Exit Details"
      description="Every field on file for every exited employee, all departments -- the base exit report's Employee Id / Full Name / Exit Date / Reason / Status, plus whatever the enrichment reports (DBX_CHECK_ENRICH_REPORT_IDS) add on top, joined by Employee Id. Refresh via the Exits sync (Source uploads) to pull the latest."
      action={<button type="button" data-testid="button-refresh-darwin-exit-details" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Darwin Exit Details is unavailable right now." />}

    {data && <div className="mb-6 grid max-w-xs grid-cols-1">
      <TopStat
        label="Exit records on file"
        value={formatKpi(data.count)}
        meta={data.synced_at ? `As of last sync -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Sync time unavailable'}
        icon={<Users size={16} />}
        tone="navy"
      />
    </div>}

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
      : <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-[#f4f7f9]">
              {data.columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => <tr key={index} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
              {data.columns.map((column) => <td key={column} className="whitespace-nowrap px-4 py-3 text-[12px] text-foreground">{cellText(row[column]) || <span className="text-muted-foreground">—</span>}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    )}
  </div>;
}
