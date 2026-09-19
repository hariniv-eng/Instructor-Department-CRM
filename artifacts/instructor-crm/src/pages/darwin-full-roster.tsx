import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Users } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, usePagedRows, formatKpi } from '@/components/ui-pieces';

// A flat, unreconciled dump of Darwin's full company roster (2026-09-18, per
// request: "I don't need any breakdown there, I just want to see the whole
// darwin data, 3K+ data should be visible there") -- every row Darwinbox's
// Master API returned on the last sync, straight from the
// darwinbox_full_roster table (see GET /reports/darwin-full-roster in
// reports.ts). `columns` is derived server-side from whatever fields are
// actually present rather than hardcoded, so this table always matches
// whatever darwinbox.ts's ALIASES list currently maps.
// No summary card or search box on this page, but the table itself is now
// paginated client-side (2026-09-19, per request: "can we apply the pager
// logic for the darwin full rooster and also the darwin exit tabs tables")
// via usePagedRows/TablePager (ui-pieces.tsx) -- the API still returns every
// row in one response, this just slices what's shown at a time.
type DarwinFullRoster = {
  count: number;
  columns: string[];
  rows: Record<string, unknown>[];
  synced_at: string | null;
};

const QUERY_KEY = ['reports', 'darwin-full-roster'];

function useDarwinFullRoster() {
  return useQuery<DarwinFullRoster>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/darwin-full-roster');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export default function DarwinFullRosterPage() {
  const queryClient = useQueryClient();
  const query = useDarwinFullRoster();
  const data = query.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const pager = usePagedRows(data?.rows ?? [], 50);

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="Darwinbox / full company roster"
      title="Darwin Full Roster"
      description="Every record Darwinbox returned on the last sync, unfiltered and unreconciled -- not scoped to the Instructors department or to current TeachOS instructors, just the whole company roster as Darwin has it."
      action={<button type="button" data-testid="button-refresh-darwin-full-roster" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Darwin Full Roster is unavailable right now." />}

    {data && <div className="mb-6 grid max-w-xs grid-cols-1">
      <TopStat
        label="Total employees (Darwin)"
        value={formatKpi(data.count)}
        meta={data.synced_at ? `As of last sync -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Sync time unavailable'}
        icon={<Users size={16} />}
        tone="navy"
      />
    </div>}

    {data && (data.count === 0
      ? <EmptyState title="No full-roster data yet" description="Sync Darwinbox (or upload a full-roster CSV) to see every record here." />
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
