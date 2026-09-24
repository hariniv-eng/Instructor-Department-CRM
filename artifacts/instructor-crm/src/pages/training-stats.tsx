import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, RefreshCw } from 'lucide-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, TopStat, TablePager, TableSearchInput, usePagedRows, formatKpi } from '@/components/ui-pieces';

// "Training Stats" (2026-09-23, per request): an instructor's OWN
// training/upskilling progress, distinct from every other tab here, which
// tracks session-TEACHING activity. Sourced from BigQuery's
// niat_instructor_unit_wise_completion_and_best_attempt_details, aggregated
// server-side per (instructor, tracked course) -- see fetchCourseStatusRows
// in api-server/src/lib/connectors/instructorLearningStatus.ts and GET
// /reports/training-stats in reports.ts.
//
// Split into 3 SUB-TABS (2026-09-24, per request): Tech groups the original
// 5 track groups (Frontend Development, Backend Development, DSA, Gen AI,
// DSML) matching Ankush's reference sheet; Math and Aptitude share ONE
// tab/button ("I don't want two separate sheets or two separate tabs for
// math and aptitude. I want it in one only") even though they're still two
// separate track groups in the taxonomy underneath; English has no taxonomy
// columns yet (still waiting on Ankush's course list) -- its tab renders
// with an explanatory empty state rather than being hidden, since all 3
// buttons should always be visible.
//
// EACH TAB SHOWS ONLY ITS OWN SUBJECT'S INSTRUCTORS (2026-09-24, per
// request -- "we know the bifurcation using the teacher's data... if I'm
// trying to open only tech, to only see the tech-related instructors...
// if I'm trying to open English-related learning stats, I need to only see
// the data of English instructors"). This reverses the earlier "same
// roster for every tab" build: rows are now filtered client-side by each
// instructor's `subject_area` (from classifyDepartment() -- see
// TECH_AREAS/subject_area in api-server/src/lib/departmentTaxonomy.ts and
// routes/reports.ts), matched against the active tab's subjectAreas below.
// A row whose subject_area is null (classifyDepartment() couldn't resolve
// one -- e.g. a flat "Mentors" string with no sub-area) won't appear on ANY
// tab until a human fills in Manual Subject for them on the Instructors tab.
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
  subject_area: string | null;
  courses: Record<string, CourseStatus>;
};

type TrainingStatsResponse = {
  taxonomy: TrainingCourseDef[];
  tech_areas: string[];
  count: number;
  rows: TrainingStatsRow[];
  synced_at: string | null;
};

const QUERY_KEY = ['reports', 'training-stats'];

// The 3 sub-tab buttons. `trackGroups` names which taxonomy track group(s)
// supply this tab's COLUMNS; `subjectAreas` decides which ROWS (instructors)
// show on it, matched against each row's `subject_area`. Tech's subject
// areas come from the server's `tech_areas` list (the same RULES-derived set
// classifyDepartment() uses) rather than being hardcoded here, so this file
// can't drift out of sync with departmentTaxonomy.ts -- see 'TECH' handling
// below. "english" intentionally maps to a track group name that doesn't
// exist in TRAINING_COURSE_TAXONOMY yet (see backend
// trainingCourseTaxonomy.ts) -- that's expected until Ankush's English
// course list is confirmed, and is handled below as an empty tab rather
// than an error.
const SUB_TABS: { key: string; label: string; trackGroups: string[]; subjectAreas: string[] | 'TECH' }[] = [
  { key: 'tech', label: 'Tech', trackGroups: ['Frontend Development', 'Backend Development', 'DSA', 'Gen AI', 'DSML'], subjectAreas: 'TECH' },
  { key: 'math_aptitude', label: 'Math and Aptitude', trackGroups: ['Aptitude', 'Math'], subjectAreas: ['Aptitude', 'Math'] },
  { key: 'english', label: 'English', trackGroups: ['English'], subjectAreas: ['English'] },
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
  const activeTaxonomy = data ? data.taxonomy.filter((d) => activeSubTab.trackGroups.includes(d.trackGroup)) : [];
  // Each tab shows only ITS OWN subject's instructors (2026-09-24, per
  // request -- see the big comment above SUB_TABS). "TECH" resolves against
  // the server-supplied tech_areas list; the other tabs use their own static
  // list. A row with subject_area === null never matches any tab. Re-derived
  // per tab so page 2 of Tech doesn't carry over confusingly into Math and
  // Aptitude's row list.
  const activeSubjectAreas = activeSubTab.subjectAreas === 'TECH' ? (data?.tech_areas ?? []) : activeSubTab.subjectAreas;
  const activeRows = data ? data.rows.filter((row) => row.subject_area !== null && activeSubjectAreas.includes(row.subject_area)) : [];
  // Search box (2026-09-24, per request: "where ever there are tables in
  // the application add search option to search for any person") -- matches
  // name or employee ID, same two fields the Instructors tab's own search
  // already checks. Applied after the subject-area filter above, so a
  // search on the Tech tab only searches among tech instructors, not the
  // whole roster.
  const [search, setSearch] = useState('');
  const searchedRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeRows;
    return activeRows.filter((row) => row.full_name.toLowerCase().includes(query) || (row.employee_id ?? '').toLowerCase().includes(query));
  }, [activeRows, search]);
  const pager = usePagedRows(searchedRows, 50);
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

    {data && <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid max-w-xs grid-cols-1">
        <TopStat
          label={`${activeSubTab.label} instructors tracked`}
          value={formatKpi(activeRows.length)}
          meta={data.synced_at ? `Last synced -- ${new Date(data.synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet -- click Sync Now'}
          icon={<GraduationCap size={16} />}
          tone="navy"
        />
      </div>
      {activeRows.length > 0 && <TableSearchInput value={search} onChange={setSearch} testId="input-search-training-stats" />}
    </div>}

    {data && pendingCount > 0 && <p className="mb-6 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
      <strong className="font-semibold text-foreground">{pendingCount} column{pendingCount === 1 ? '' : 's'}</strong> ({activeTaxonomy.filter((d) => d.courseTitles.length === 0).map((d) => d.label).join(', ')}) don't have a confirmed course mapping yet and show as "Mapping pending" for everyone -- see Instructor_Learning_Status_Course_Mapping_Review.xlsx.
    </p>}

    {data && activeTaxonomy.length === 0 && <EmptyState
      title={`No ${activeSubTab.label} courses configured yet`}
      description={`The ${activeSubTab.label} tab is ready, but no courses have been mapped to it yet -- let Claude know which courses to track and this tab will populate the same way the others did.`}
    />}

    {data && activeTaxonomy.length > 0 && data.count === 0 && <EmptyState title="No training-status data yet" description="Click Sync Now to pull the latest from BigQuery." />}

    {data && activeTaxonomy.length > 0 && data.count > 0 && activeRows.length === 0 && <EmptyState
      title={`No ${activeSubTab.label} instructors classified yet`}
      description="No instructor's Subject is set to this area yet -- set it on the Instructors tab (Subject column) and it'll show up here."
    />}

    {data && activeTaxonomy.length > 0 && activeRows.length > 0 && searchedRows.length === 0 && <EmptyState title="No one matches this search" description="Try a broader search or clear the search box." />}

    {data && activeTaxonomy.length > 0 && searchedRows.length > 0 && (
      <div className="rounded-lg border border-border">
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
