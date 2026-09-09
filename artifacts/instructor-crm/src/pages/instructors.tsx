import { useMemo, useState } from 'react';
import { Briefcase, Building2, GraduationCap, Search, UserCheck, Users, UsersRound } from 'lucide-react';
import { useGetReportsInstructors, useUpdateInstructorGender, getGetReportsInstructorsQueryKey } from '@workspace/api-client-react';
import type { AccessSplit, InstructorSummary } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, DownloadCsvButton, MiniStat, pct } from '@/components/ui-pieces';
import { downloadCsv, slugify, toCsv } from '@/lib/csv';

type CategoryKey = 'department' | 'instructors' | 'mentors' | 'ops_team';

// Each tab's people list is the same union of darwin_only + both + teachos_only
// that backs the matching Overview KPI card's count -- so "165 Instructors" here
// always agrees with the "Instructors" number on the Overview tab. See
// artifacts/api-server/src/routes/reports.ts's accessBreakdown for the source.
// "Instructor Department" (2026-09-09, per request) is the same combined
// Instructors + Mentors + Operations team rollup as the Overview tab's 4th
// KPI card of the same name -- access_breakdown.department already existed
// on the API response for that card, so this tab needed no backend change,
// just wiring up the same field here.
const CATEGORY_TABS: { key: CategoryKey; label: string; icon: typeof UsersRound; description: string }[] = [
  { key: 'department', label: 'Instructor Department', icon: Building2, description: 'Instructors + Mentors + Operations team, combined.' },
  { key: 'instructors', label: 'Instructors', icon: UsersRound, description: 'Everyone counted toward the TeachOS instructor count.' },
  { key: 'mentors', label: 'Mentors', icon: GraduationCap, description: 'Darwin — Mentors department.' },
  { key: 'ops_team', label: 'Operations team', icon: Briefcase, description: 'Darwin — Delivery Support (Ops), filed under Operations rather than Instructor or Mentor.' },
];

function formatCount(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

function mergedPeople(split: AccessSplit | undefined): InstructorSummary[] {
  if (!split) return [];
  const merged = [...(split.darwin_only?.people ?? []), ...(split.both?.people ?? []), ...(split.teachos_only?.people ?? [])];
  return merged.sort((a, b) => a.full_name.localeCompare(b.full_name));
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('');
}

// Gender filter (2026-09-09, per request) -- Darwin's raw "Gender" text
// (see reports.ts's toApiInstructorSummary) normalized down to three
// buckets so "male"/"Male"/"M" etc. all count the same way, and anyone with
// no gender on file (most commonly a TeachOS-only row with no Darwin record
// at all -- see the inDarwin gating on that field) falls into "Not on file"
// instead of silently being dropped from any bucket's count.
type GenderFilterKey = 'all' | 'male' | 'female' | 'unknown';
const GENDER_FILTERS: { key: GenderFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'unknown', label: 'Not on file' },
];
function normalizeGender(raw: string | null | undefined): 'male' | 'female' | 'unknown' {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'male' || value === 'm') return 'male';
  if (value === 'female' || value === 'f') return 'female';
  return 'unknown';
}

export default function InstructorsPage() {
  const reportQuery = useGetReportsInstructors();
  const report = reportQuery.data;
  const [category, setCategory] = useState<CategoryKey>('instructors');
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilterKey>('all');

  const split = report?.access_breakdown?.[category];
  const allPeople = useMemo(() => mergedPeople(split), [split]);
  const people = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allPeople.filter((person) => {
      if (genderFilter !== 'all' && normalizeGender(person.gender) !== genderFilter) return false;
      if (!query) return true;
      return person.full_name.toLowerCase().includes(query) || (person.employee_id ?? '').toLowerCase().includes(query) || (person.teachos_user_id ?? '').toLowerCase().includes(query);
    });
  }, [allPeople, search, genderFilter]);

  const activeTab = CATEGORY_TABS.find((tab) => tab.key === category)!;

  // Counts per gender bucket for the currently-viewed category (2026-09-09,
  // per request: "add a filter ... to check how many female and male
  // employees we have"). Computed from allPeople, same as the Capability
  // Manager coverage stats below, so switching category updates the counts
  // but the search box doesn't -- this is meant to answer "how many of this
  // category are Male/Female", not "how many of my search results are".
  const genderCounts = useMemo(() => {
    const counts: Record<GenderFilterKey, number> = { all: allPeople.length, male: 0, female: 0, unknown: 0 };
    for (const person of allPeople) counts[normalizeGender(person.gender)] += 1;
    return counts;
  }, [allPeople]);

  // Cross-category breakdown (2026-09-09, per follow-up request): picking a
  // gender from the dropdown shouldn't just filter the table for whichever
  // category tab happens to be active -- it should also answer "how many
  // Female/Male people are there in Instructor Department / Instructors /
  // Mentors / Operations team", all four at once, regardless of which tab
  // is currently selected. Each category's own access_breakdown split is
  // pulled and merged independently here (not derived from `allPeople`,
  // which only ever holds the ACTIVE tab's people).
  const genderBreakdown = useMemo(() => {
    if (genderFilter === 'all' || !report?.access_breakdown) return null;
    return CATEGORY_TABS.map((tab) => {
      const tabPeople = mergedPeople(report.access_breakdown?.[tab.key]);
      return { key: tab.key, label: tab.label, count: tabPeople.filter((person) => normalizeGender(person.gender) === genderFilter).length, total: tabPeople.length };
    });
  }, [report, genderFilter]);

  // Coverage check for the currently-viewed category (2026-09, per request):
  // how many of these people have a Capability Manager on file at all, vs.
  // how many don't -- computed client-side from the same list already
  // loaded for the table below, so switching category/search updates it
  // too. This is a visibility/audit aid, not a new backend computation --
  // capability_manager itself is the same TeachOS-sourced field already
  // shown in the Overview drill-down (see reports.ts's toApiInstructorSummary).
  const withCapabilityManager = allPeople.filter((person) => !!person.capability_manager).length;
  const missingCapabilityManager = allPeople.length - withCapabilityManager;

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro
      eyebrow="Workforce register / Darwin + TeachOS"
      title="Instructor records"
      description="Instructors, Mentors, and the Operations team -- each list is exactly who the matching Overview card counts."
    />

    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Filter by category">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = category === tab.key;
            return <button key={tab.key} type="button" data-testid={`button-category-${tab.key}`} onClick={() => setCategory(tab.key)} aria-pressed={isActive} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold transition-colors ${isActive ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon size={14} /> {tab.label}
              <span className="ml-1 font-mono-ui text-[10px] opacity-70">{formatCount(report?.kpis[tab.key === 'department' ? 'department_total_count' : tab.key === 'instructors' ? 'total_instructor_count' : tab.key === 'mentors' ? 'mentors_count' : 'ops_team_count'])}</span>
            </button>;
          })}
        </div>
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, employee ID, or TeachOS user ID..." data-testid="input-search-instructors" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/25" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        <label htmlFor="select-gender-filter" className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Gender</label>
        <select id="select-gender-filter" data-testid="select-gender-filter" value={genderFilter} onChange={(event) => setGenderFilter(event.target.value as GenderFilterKey)} className="h-9 rounded-lg border border-border bg-background px-2.5 text-[12px] font-bold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25">
          {GENDER_FILTERS.map((filter) => <option key={filter.key} value={filter.key}>{filter.label} ({formatCount(genderCounts[filter.key])} in {activeTab.label.toLowerCase()})</option>)}
        </select>
        {genderFilter !== 'all' && <span className="font-mono-ui text-[10px] text-muted-foreground">Table below is filtered to {activeTab.label.toLowerCase()}; see the breakdown card for every category.</span>}
      </div>
    </div>

    {genderFilter !== 'all' && genderBreakdown && <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f3e8fb] text-[#7c3aa8]"><Users size={16} /></span>
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Darwin — Gender field</p>
          <h2 className="text-[15px] font-extrabold tracking-[-0.03em]">{GENDER_FILTERS.find((filter) => filter.key === genderFilter)?.label} headcount, by category</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {genderBreakdown.map((row) => <MiniStat key={row.key} label={row.label} value={row.count} meta={`${pct(row.count, row.total)} of ${row.label.toLowerCase()}`} tone="muted" />)}
      </div>
    </section>}

    {!reportQuery.isLoading && !reportQuery.isError && allPeople.length > 0 && <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#dff0eb] text-[#287469]"><UserCheck size={16} /></span>
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">TeachOS-sourced, {activeTab.label.toLowerCase()} in view</p>
          <h2 className="text-[15px] font-extrabold tracking-[-0.03em]">Capability Manager coverage</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Assigned" value={withCapabilityManager} meta={`${pct(withCapabilityManager, allPeople.length)} of ${activeTab.label.toLowerCase()} have a Capability Manager on file`} tone="green" />
        <MiniStat label="Missing" value={missingCapabilityManager} meta="No valid Capability Manager name matched among their TeachOS candidates" tone={missingCapabilityManager > 0 ? 'amber' : 'muted'} />
        <MiniStat label="Total in category" value={allPeople.length} meta={`Every ${activeTab.label.toLowerCase()} counted, search excluded`} tone="muted" />
      </div>
    </section>}

    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><span data-testid="text-instructor-count">{people.length}</span> {activeTab.label.toLowerCase()} in view</p>
        <p className="text-[11px] text-muted-foreground">{activeTab.description}</p>
      </div>
      <DownloadCsvButton onClick={() => downloadInstructorsCsv(category, people)} disabled={people.length === 0} testId="button-download-instructors-csv" />
    </div>

    {reportQuery.isLoading && <div className="overflow-hidden rounded-xl border border-border bg-card"><div className="space-y-3 p-4">{[1, 2, 3, 4, 5].map((item) => <SkeletonBlock key={item} className="h-12" />)}</div></div>}
    {reportQuery.isError && <QueryError message="The instructor register could not be loaded." />}
    {!reportQuery.isLoading && !reportQuery.isError && people.length === 0 && <EmptyState title={`No ${activeTab.label.toLowerCase()} match this search`} description="Try a broader search or clear the search box." />}
    {!reportQuery.isLoading && !reportQuery.isError && people.length > 0 && <CategoryTable category={category} people={people} />}
  </div>;
}

// Column set is per-category: Instructors get Subject + Payroll (the two
// things the user singled out for this bucket); Mentors get Subject instead
// of Payroll; Operations team gets Department in place of a subject, since
// ops rows aren't teaching one. Campus (the institutes list) is common to all three.
// Department (Darwin's raw department field, e.g. "Instructors -- Frontend")
// is now its own explicit column for Instructors and Mentors too (2026-09-09,
// per request) -- separate from Subject (dept_area, the derived teaching
// area used for the taxonomy) rather than replacing it. Operations team
// already showed this same `department` value in what was labeled "Subject"
// for other categories, so it keeps its single "Department" column as-is
// rather than gaining a second, redundant one.
// Designation (Darwin's raw "Designation" field) is its own explicit column
// for every category (2026-09-09, per request, mirroring the same change on
// the Overview tab's drill-down table) -- it used to be shown only as a
// small line under the person's name; that's removed now that it has its
// own column, to avoid showing the same value twice in one row.
// Rows are Links (for click-through to the instructor detail page), so this
// uses a CSS grid rather than a real <table> -- an <a> can't be a direct
// child of <tbody> -- matching the grid-row pattern this page already used.
// Columns are fixed pixel widths, not fr/minmax, and the header + rows sit
// together inside one horizontally-scrolling container: a full 32-character
// TeachOS user ID doesn't fit alongside the other columns, and letting the
// grid compress it was what made the ID visually run into the Subject
// column next to it. Fixed widths never compress -- the row scrolls
// sideways instead, per the user's explicit ask for a horizontal scrollbar.
// Tailwind's build-time scanner only picks up class names it can find as
// complete literal text in the source, so each category's grid template is
// spelled out in full below rather than assembled from interpolated pieces
// -- a dynamically-built arbitrary-value class silently gets no CSS at all.
// Gender is the last column for every category (2026-09-09, per request) --
// a plain read-only value when it came from Darwin, or a Male/Female
// dropdown when it didn't, so a human can mark it for whoever Darwin can't
// supply it for (150px, added to every literal template below -- see
// PersonRow's gender cell; kept as full literal strings, not interpolated,
// per the Tailwind gotcha explained above).
function gridColsClass(category: CategoryKey): string {
  if (category === 'instructors') return 'grid-cols-[260px_190px_130px_280px_160px_170px_220px_140px_190px_130px_150px]';
  // "Instructor Department" (the combined list) has the same column set as
  // Mentors: Subject + Department, Campus, no Payroll (payroll status isn't
  // a meaningful concept for the Mentors/Ops rows mixed into this list).
  if (category === 'mentors' || category === 'department') return 'grid-cols-[260px_190px_130px_280px_160px_170px_240px_140px_190px_150px]';
  // Operations team has no Campus column -- ops rows aren't deployed to a
  // teaching campus the way instructors and mentors are. It also has only
  // one Subject/Department-style column (labeled "Department"), not both.
  return 'grid-cols-[260px_190px_130px_280px_280px_140px_190px_150px]';
}

// Name column header/label is per-category -- "Instructor Department" mixes
// all three roles, so it gets a neutral "Person" rather than "Instructor".
function nameColumnLabel(category: CategoryKey): string {
  if (category === 'ops_team') return 'Team member';
  if (category === 'mentors') return 'Mentor';
  if (category === 'department') return 'Person';
  return 'Instructor';
}

// Column set mirrors gridColsClass/CategoryTable below exactly, so the CSV
// always matches what's on screen for the active category tab.
function downloadInstructorsCsv(category: CategoryKey, people: InstructorSummary[]) {
  const headers = [nameColumnLabel(category), 'Designation', 'Employee ID', 'TeachOS User ID'];
  if (category === 'ops_team') headers.push('Department'); else headers.push('Subject', 'Department');
  if (category !== 'ops_team') headers.push('Campus');
  headers.push('Date of joining');
  headers.push('Capability Manager');
  if (category === 'instructors') headers.push('Payroll');
  headers.push('Gender');

  const rows = people.map((person) => {
    const row: string[] = [person.full_name, person.designation ?? '', person.employee_id ?? '', person.teachos_user_id ?? ''];
    if (category === 'ops_team') row.push(person.department ?? ''); else row.push(person.dept_area ?? '', person.department ?? '');
    if (category !== 'ops_team') row.push(person.institutes?.join(', ') ?? '');
    row.push(person.date_of_joining ?? '');
    row.push(person.capability_manager ?? '');
    if (category === 'instructors') row.push(person.is_payroll ? 'Payroll' : 'Nxtwave');
    row.push(person.gender ?? '');
    return row;
  });

  downloadCsv(`${slugify(category)}.csv`, toCsv(headers, rows));
}

function CategoryTable({ category, people }: { category: CategoryKey; people: InstructorSummary[] }) {
  const columns = gridColsClass(category);
  return <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
    <div className="overflow-x-auto">
      <div className="w-max min-w-full">
        <div className={`grid gap-4 border-b border-border bg-[#f4f7f9] px-5 py-3.5 text-left font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground ${columns}`}>
          <span>{nameColumnLabel(category)}</span>
          <span>Designation</span>
          <span>Employee ID</span>
          <span>TeachOS User ID</span>
          {category === 'ops_team' ? <span>Department</span> : <><span>Subject</span><span>Department</span></>}
          {category !== 'ops_team' && <span>Campus</span>}
          <span>Date of joining</span>
          <span>Capability Manager</span>
          {category === 'instructors' && <span>Payroll</span>}
          <span>Gender</span>
        </div>
        <div>{people.map((person) => <PersonRow key={person.id} category={category} person={person} columns={columns} />)}</div>
      </div>
    </div>
  </div>;
}

function PersonRow({ category, person, columns }: { category: CategoryKey; person: InstructorSummary; columns: string }) {
  const campus = person.institutes && person.institutes.length > 0 ? person.institutes.join(', ') : '—';
  return <Link href={`/instructors/${person.id}`} data-testid={`link-instructor-${person.id}`} className={`group grid items-center gap-4 border-b border-border/70 px-5 py-4 transition-colors last:border-0 hover:bg-[#f8fafb] ${columns}`}>
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e1eaf1] text-[11px] font-extrabold text-primary">{initials(person.full_name)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-foreground">{person.full_name}</span>
      </span>
    </div>
    <div className="truncate text-[12px] text-muted-foreground">{person.designation || '—'}</div>
    <div className="truncate font-mono-ui text-[11px] text-muted-foreground">{person.employee_id || '—'}</div>
    <div className="truncate font-mono-ui text-[11px] text-muted-foreground">{person.teachos_user_id || ''}</div>
    {category === 'ops_team' ? <div className="truncate text-[12px] text-muted-foreground">{person.department || '—'}</div> : <>
      <div className="truncate text-[12px] text-muted-foreground">{person.dept_area || '—'}</div>
      <div className="truncate text-[12px] text-muted-foreground">{person.department || '—'}</div>
    </>}
    {category !== 'ops_team' && <div className="truncate text-[12px] text-muted-foreground">{campus}</div>}
    {/* No Darwin access right now -> blank (not "--"), per request: this
        column is specifically Darwin's date of joining, not a general
        "unknown" placeholder. See date_of_joining's gating in reports.ts. */}
    <div className="truncate font-mono-ui text-[11px] text-muted-foreground">{person.date_of_joining || ''}</div>
    {/* No valid Capability Manager name matched among this person's TeachOS
        candidates -- flagged distinctly (not just a blank/dash) so a gap in
        this data is easy to spot at a glance while scanning the table, per
        the coverage section above. */}
    <div className="truncate text-[12px]">{person.capability_manager ? <span className="text-foreground">{person.capability_manager}</span> : <span className="inline-flex rounded-full bg-[#fff7db] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#8b6207]">Missing</span>}</div>
    {category === 'instructors' && <div>{person.is_payroll ? <span className="inline-flex rounded-full bg-[#e6e9fb] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#4a4fb0]">Payroll</span> : <span className="inline-flex rounded-full bg-secondary px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">Nxtwave</span>}</div>}
    <GenderCell person={person} />
  </Link>;
}

// Gender is read-only text when Darwin supplied it (person.gender_source ===
// 'darwin') -- Darwin's own value is never overridden here. Otherwise
// (no Darwin record, or a Darwin record with gender left blank) this shows
// an editable Male/Female dropdown so whoever knows the person can mark it
// (2026-09-09, per request). Reachable by either Admin or Manager -- see
// the dedicated PATCH /instructors/:id/gender route (requireAuth only, no
// requireRole, unlike the other manual-edit fields on the detail page).
// stopPropagation on the wrapping div is required: PersonRow's whole row is
// a wouter <Link>, so without it, opening/using the dropdown would also
// trigger the row's click-through navigation to the instructor detail page.
function GenderCell({ person }: { person: InstructorSummary }) {
  const queryClient = useQueryClient();
  const updateGender = useUpdateInstructorGender({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetReportsInstructorsQueryKey() });
      },
    },
  });

  if (person.gender_source === 'darwin') {
    return <div className="truncate text-[12px] text-muted-foreground">{person.gender ?? '—'}</div>;
  }

  const value = person.gender === 'male' || person.gender === 'female' ? person.gender : '';
  return <div onClick={(event) => event.stopPropagation()} className="text-[12px]">
    <select
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        updateGender.mutate({ id: person.id, data: { manual_gender: next === '' ? null : (next as 'male' | 'female') } });
      }}
      disabled={updateGender.isPending}
      data-testid={`select-manual-gender-${person.id}`}
      title="No gender on file from Darwin -- mark it manually"
      className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-[11px] font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:opacity-60"
    >
      <option value="">Not on file</option>
      <option value="male">Male</option>
      <option value="female">Female</option>
    </select>
  </div>;
}
