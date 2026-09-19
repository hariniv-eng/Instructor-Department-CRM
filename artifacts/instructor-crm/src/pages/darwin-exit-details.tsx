import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Users } from 'lucide-react';
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
      description="Every field on file for each exited Instructors Department employee -- the base exit report's Employee Id / Full Name / Exit Date / Reason / Status, plus whatever the enrichment reports (DBX_CHECK_ENRICH_REPORT_IDS) add on top, joined by Employee Id. Scoped to Top Department = Instructors Department (NWD_ID); other departments' exits aren't shown here. Refresh via the Exits sync (Source uploads) to pull the latest."
      action={<button type="button" data-testid="button-refresh-darwin-exit-details" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Darwin Exit Details is unavailable right now." />}

    {data && <div className="mb-6 grid max-w-xs grid-cols-1">
      <TopStat
        label="Instructors Dept. exit records"
        value={formatKpi(data.count)}
        meta={data.synced_at ? `As of last sync -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Sync time unavailable'}
        icon={<Users size={16} />}
        tone="navy"
      />
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
