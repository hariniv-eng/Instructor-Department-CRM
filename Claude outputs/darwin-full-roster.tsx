import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock } from '@/components/ui-pieces';

// A flat, unreconciled dump of Darwin's full company roster (2026-09-18, per
// request: "I don't need any breakdown there, I just want to see the whole
// darwin data, 3K+ data should be visible there") -- every row Darwinbox's
// Master API returned on the last sync, straight from the
// darwinbox_full_roster table (see GET /reports/darwin-full-roster in
// reports.ts). `columns` is derived server-side from whatever fields are
// actually present rather than hardcoded, so this table always matches
// whatever darwinbox.ts's ALIASES list currently maps.
// Deliberately no summary card, search box, or pagination (2026-09-18,
// follow-up request: "remove all the card we have over there just display
// the table there") -- just the plain table, every row.
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

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="Darwinbox / full company roster"
      title="Darwin Full Roster"
      description="Every record Darwinbox returned on the last sync, unfiltered and unreconciled -- not scoped to the Instructors department or to current TeachOS instructors, just the whole company roster as Darwin has it."
      action={<button type="button" data-testid="button-refresh-darwin-full-roster" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>}
    />

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Darwin Full Roster is unavailable right now." />}

    {data && (data.count === 0
      ? <EmptyState title="No full-roster data yet" description="Sync Darwinbox (or upload a full-roster CSV) to see every record here." />
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
