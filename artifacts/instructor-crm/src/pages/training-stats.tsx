import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, RefreshCw } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, usePagedRows, formatKpi } from '@/components/ui-pieces';

// "Training Stats" (2026-09-23, per request): an instructor's OWN
// training/upskilling progress, distinct from every other tab here, which
// tracks session-TEACHING activity. Sourced from BigQuery's
// niat_instructor_unit_wise_completion_and_best_attempt_details, aggregated
// server-side per (instructor, tracked course) -- see fetchCourseStatusRows
// in api-server/src/lib/connectors/instructorLearningStatus.ts and GET
// /reports/training-stats in reports.ts.
//
// Split into 4 SUB-TABS (2026-09-24, per request -- "tech separate, math
// and aptitude separate, and also english separate" / "keep ... buttons:
// tech, aptitude, math, english"): Tech groups the original 5 track groups
// (Frontend Development, Backend Development, DSA, Gen AI, DSML) matching
// Ankush's reference sheet; Aptitude and Math are their own track groups
// added the same day; English has no taxonomy columns yet (still waiting on
// Ankush's course list) -- its tab renders with an explanatory empty state
// rather than being hidden, since all 4 buttons should always be visible.
// All 4 tabs share the SAME instructor population (Instructors + Mentors,
// confirmed 2026-09-24 -- no separate classification/department filter per
// tab) -- only the COLUMNS shown differ per tab, not the rows/instructors.
//
// Scoped to Instructors + Mentors only, identified by employee_id (per
// request) -- Delivery Support / Instructor Team Operations / other-
// department rows are excluded server-side (see
// TRAINING_STATS_EXCLUDED_CLASSIFICATIONS in reports.ts).
type CourseStatus = 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'PENDING_MAPPING' | 'NO_DATA';

type TrainingCourseDef = {
  key: string;
  label: string;
  trackGroup: string;
  courseTitles: string[];
};

type TrainingStatsRow = {
  employee_id: string | null;
  full_name: string;
  department: string | null;
  capability_manager: string | null;
  classification: string | null;
  has_training_data: boolean;
  courses: Record<string, CourseStatus>;
};

type TrainingStatsResponse = {
  taxonomy: TrainingCourseDef[];
  count: number;
  rows: TrainingStatsRow[];
  synced_at: string | null;
};

const QUERY_KEY = ['reports', 'training-stats'];

// The 4 sub-tab buttons, each naming which track group(s) from the taxonomy
// it pulls columns from. "english" intentionally maps to a track group name
// that doesn't exist in TRAINING_COURSE_TAXONOMY yet (see backend
// trainingCourseTaxonomy.ts) -- that's expected until Ankush's English
// course list is confirmed, and is handled below as an empty tab rather
// than an error.
const SUB_TABS: { key: string; label: string; trackGroups: string[] }[] = [
  { key: 'tech', label: 'Tech', trackGroups: ['Frontend Development', 'Backend Development', 'DSA', 'Gen AI', 'DSML'] },
  { key: 'aptitude', label: 'Aptitude', trackGroups: ['Aptitude'] },
  { key: 'math', label: 'Math', trackGroups: ['Math'] },
  { key: 'english', label: 'English', trackGroups: ['English'] },
];

function useTrainingStats() {
  return useQuery<TrainingStatsResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/reports/training-stats');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  });
}

// Groups the flat taxonomy list into [{ trackGroup, defs }] in taxonomy
// order, for the two-row grouped header below.
function groupByTrack(taxonomy: TrainingCourseDef[]): { trackGroup: string; defs: TrainingCourseDef[] }[] {
  const groups: { trackGroup: string; defs: TrainingCourseDef[] }[] = [];
  for (const def of taxonomy) {
    const last = groups[groups.length - 1];
    if (last && last.trackGroup === def.trackGroup) last.defs.push(def);
    else groups.push({ trackGroup: def.trackGroup, defs: [def] });
  }
  return groups;
}

// Labels match Ankush's reference sheet's own status vocabulary verbatim
// (2026-09-23, per request: "it should be added to the application [in] a
// format that i have shared you before") -- emoji + label, same as the
// sheet's cells. "On Hold" (⏸) isn't produced here: completion_status has
// no such value anywhere in the live BigQuery data (confirmed via
// check:instructor-learning-column) -- see the open question in the page
// description below. "Mapping pending" and "No data" are this app's own
// additions for the two situations the reference sheet doesn't have to deal
// with (an unconfirmed course mapping, or an instructor with no synced rows
// at all) -- kept visually distinct (grey, no emoji) so they're never
// mistaken for one of the sheet's real 4 statuses.
const STATUS_BADGE: Record<CourseStatus, { label: string; className: string }> = {
  COMPLETED: { label: '✅ Completed', className: 'bg-[#e5f3ed] text-[#287469]' },
  IN_PROGRESS: { label: '🟡 In Progress', className: 'bg-[#fff3d6] text-[#8a6a12]' },
  NOT_STARTED: { label: '❌ Not Started', className: 'bg-[#f3f0ec] text-[#8a7a63]' },
  PENDING_MAPPING: { label: 'Mapping pending', className: 'bg-[#f1f2f4] italic text-muted-foreground' },
  NO_DATA: { label: 'No data', className: 'bg-transparent text-muted-foreground' },
};

function StatusBadge({ status }: { status: CourseStatus }) {
  const badge = STATUS_BADGE[status];
  if (status === 'NO_DATA') return <span className="text-[11px] text-muted-foreground">—</span>;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.className}`}>{badge.label}</span>;
}

export default function TrainingStatsPage() {
  const queryClient = useQueryClient();
  const query = useTrainingStats();
  const data = query.data;
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState(SUB_TABS[0].key);

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch('/api/sync/training-status', { method: 'POST' });
      const result = await response.json();
      if (result.ok) {
        setSyncMessage({ ok: true, text: `Synced ${formatKpi(result.stored)} course-status rows.` });
        refresh();
      } else {
        setSyncMessage({ ok: false, text: result.error || 'Sync failed.' });
      }
    } catch {
      setSyncMessage({ ok: false, text: 'Sync failed -- could not reach the server.' });
    } finally {
      setSyncing(false);
    }
  };

  const activeSubTab = SUB_TABS.find((t) => t.key === activeTab) ?? SUB_TABS[0];
  // Same instructor population/rows for every sub-tab -- only which taxonomy
  // columns are shown changes. Re-derived per tab so page 2 of Tech doesn't
  // carry over confusingly into Aptitude's row list.
  const activeTaxonomy = data ? data.taxonomy.filter((d) => activeSubTab.trackGroups.includes(d.trackGroup)) : [];
  const pager = usePagedRows(data?.rows ?? [], 50);
  const groups = groupByTrack(activeTaxonomy);
  const pendingCount = activeTaxonomy.filter((d) => d.courseTitles.length === 0).length;

  return <div className="mx-auto max-w-[1600px]">
    <PageIntro
      eyebrow="BigQuery / niat_instructor_unit_wise_completion_and_best_attempt_details, aggregated per course"
      title="Training Stats"
      description="Each instructor's OWN training/upskilling completion -- not their session-teaching activity, which the other tabs track. Scoped to Instructors and Mentors only, identified by Employee ID. Columns marked 'Mapping pending' don't have a confirmed real course match yet and show the same placeholder for everyone until that's resolved."
      action={<div className="flex items-center gap-2">
        <button type="button" data-testid="button-refresh-training-stats" onClick={refresh} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh</button>
        <button type="button" data-testid="button-sync-training-status" onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-2 self-start rounded-lg bg-primary px-3.5 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 lg:self-auto">{syncing ? 'Syncing…' : 'Sync Now'}</button>
      </div>}
    />

    {syncMessage && <p data-testid="status-sync-training-status" className={`mb-4 max-w-2xl rounded-lg px-3 py-2 text-[12px] font-semibold ${syncMessage.ok ? 'bg-[#e5f3ed] text-[#287469]' : 'bg-[#fff0ec] text-[#9b4434]'}`}>{syncMessage.text}</p>}

    <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
      {SUB_TABS.map((tab) => <button
        key={tab.key}
        type="button"
        data-testid={`button-tab-${tab.key}`}
        onClick={() => setActiveTab(tab.key)}
        className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${tab.key === activeTab ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
      >
        {tab.label}
      </button>)}
    </div>

    {query.isLoading && <SkeletonBlock className="h-[520px]" />}
    {query.isError && <QueryError message="Training Stats is unavailable right now." />}

    {data && <div className="mb-6 grid max-w-xs grid-cols-1">
      <TopStat
        label="Instructors + Mentors tracked"
        value={formatKpi(data.count)}
        meta={data.synced_at ? `Last synced -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet -- click Sync Now'}
        icon={<GraduationCap size={16} />}
        tone="navy"
      />
    </div>}

    {data && pendingCount > 0 && <p className="mb-6 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
      <strong className="font-semibold text-foreground">{pendingCount} column{pendingCount === 1 ? '' : 's'}</strong> ({activeTaxonomy.filter((d) => d.courseTitles.length === 0).map((d) => d.label).join(', ')}) don't have a confirmed course mapping yet and show as "Mapping pending" for everyone -- see Instructor_Learning_Status_Course_Mapping_Review.xlsx.
    </p>}

    {data && activeTaxonomy.length === 0 && <EmptyState
      title={`No ${activeSubTab.label} courses configured yet`}
      description={`The ${activeSubTab.label} tab is ready, but no courses have been mapped to it yet -- let Claude know which courses to track and this tab will populate the same way the others did.`}
    />}

    {data && activeTaxonomy.length > 0 && (data.count === 0
      ? <EmptyState title="No training-status data yet" description="Click Sync Now to pull the latest from BigQuery." />
      : <div className="rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-[#f4f7f9]">
                <th rowSpan={2} className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-[#f4f7f9] px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Employee ID</th>
                <th rowSpan={2} className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Name</th>
                <th rowSpan={2} className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Department</th>
                <th rowSpan={2} className="whitespace-nowrap border-r border-border px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Capability Manager</th>
                {groups.map((group) => <th key={group.trackGroup} colSpan={group.defs.length} className="whitespace-nowrap border-b border-l border-border px-4 py-2 text-center font-mono-ui text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">{group.trackGroup}</th>)}
              </tr>
              <tr className="border-b border-border bg-[#f4f7f9]">
                {groups.flatMap((group) => group.defs.map((def, i) => <th key={def.key} className={`whitespace-nowrap px-3 py-2.5 text-center font-mono-ui text-[10px] uppercase tracking-[0.1em] text-muted-foreground ${i === 0 ? 'border-l border-border' : ''}`}>{def.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {pager.pageRows.map((row) => <tr key={row.employee_id ?? row.full_name} className="border-b border-border/70 last:border-0 hover:bg-[#f8fafb]">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-card px-4 py-3 font-mono-ui text-[11px] text-foreground">{row.employee_id || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] font-semibold text-foreground">{row.full_name}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.department || '—'}</td>
                <td className="whitespace-nowrap border-r border-border px-4 py-3 text-[12px] text-muted-foreground">{row.capability_manager || '—'}</td>
                {activeTaxonomy.map((def, i) => <td key={def.key} className={`px-3 py-2.5 text-center ${i === 0 ? 'border-l border-border' : ''}`}><StatusBadge status={row.courses[def.key] ?? 'NO_DATA'} /></td>)}
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
