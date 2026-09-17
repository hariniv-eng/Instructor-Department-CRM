import { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, BookOpen, Building2, ChevronDown, GraduationCap, MapPin, Search, UserCheck, Users, UsersRound, Wallet, X } from 'lucide-react';
import { useGetReportsInstructors, useUpdateInstructorGender, useUpdateInstructorSubject, useUpdateInstructorExitVerification, getGetReportsInstructorsQueryKey } from '@workspace/api-client-react';
import type { AccessSplit, InstructorSummary } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { PageIntro, EmptyState, QueryError, SkeletonBlock, DownloadCsvButton, MiniStat, pct } from '@/components/ui-pieces';
import { downloadCsv, slugify, toCsv } from '@/lib/csv';
import { useAuth } from '@/hooks/use-auth';

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
// Multi-select (2026-09-15, per request): every filter on this page now
// holds an ARRAY of selected keys rather than one -- an empty array means
// "no filter, show everyone" (this used to be the literal key 'all', now
// dropped from every filter's key type/option list since it's no longer a
// selectable checkbox, just the implicit "nothing checked" state). Picking
// more than one value within a single filter is OR'd (e.g. Male OR
// Female); different filters still combine with AND, same as before.
type GenderFilterKey = 'male' | 'female' | 'unknown';
const GENDER_FILTERS: { key: GenderFilterKey; label: string }[] = [
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

// Subject filter (2026-09-15, per request) -- Darwin's derived teaching-area
// field (dept_area, see departmentTaxonomy.ts) that already backs the
// "Subject" column on this page. Options are computed from whatever values
// are actually present in the active category (see subjectOptions below)
// rather than a hardcoded list -- departmentTaxonomy.ts's areas can grow
// over time and this filter should never silently miss a new one.
// "Not set" (UNSPECIFIED_SUBJECT) covers a null dept_area -- most commonly
// an Operations team row (excluded from the tech/non_tech taxonomy
// entirely) or a TeachOS-only row with no Darwin department match at all.
const UNSPECIFIED_SUBJECT = '__unspecified__';

// Capability Manager filter (2026-09-15, per request), same "same as
// gender" treatment: computed from the manager names actually present in
// the active category rather than a hardcoded list, so this doesn't need
// touching as TeachOS's own roster of managers changes over time.
const NO_CAPABILITY_MANAGER = '__none__';

// Payroll filter (2026-09-15, per request) -- mirrors the Payroll/Nxtwave
// badge already shown in the table for the Instructors category.
type PayrollFilterKey = 'payroll' | 'nxtwave';
const PAYROLL_FILTERS: { key: PayrollFilterKey; label: string }[] = [
  { key: 'payroll', label: 'Payroll' },
  { key: 'nxtwave', label: 'Nxtwave' },
];

// Campus filter (2026-09-15, per request), same "same as gender" treatment
// -- computed from the institute names actually present in the active
// category, same as Subject and Capability Manager above. Unlike those,
// `institutes` is a LIST per person (someone can be deployed to more than
// one campus at once, or transitioning between two), so this is a
// contains-match against that list rather than an equality check against
// a single value -- see matchesCampus() below. "Not set" (UNSPECIFIED_CAMPUS)
// covers an empty institutes list, e.g. Operations team rows (no Campus
// column at all) or an instructor not yet deployed anywhere.
const UNSPECIFIED_CAMPUS = '__unspecified__';
// Multi-select OR match: a person counts if they're deployed to ANY of the
// selected campuses (or, if "Not set" is among the selected values, if
// they have no institutes at all).
function matchesCampus(person: InstructorSummary, campusFilters: string[]): boolean {
  const institutes = person.institutes ?? [];
  return campusFilters.some((filter) => (filter === UNSPECIFIED_CAMPUS ? institutes.length === 0 : institutes.includes(filter)));
}

// Formats a multi-select filter's current selection for its breakdown card
// title and its trigger button -- one label when a single value is picked,
// a comma-joined list for two or three, else "N selected" so the header
// never runs unbounded.
function selectionSummary(selected: string[], labelFor: (key: string) => string): string {
  if (selected.length <= 3) return selected.map(labelFor).join(', ');
  return `${selected.length} selected`;
}

// Maintained Subject/area roster (2026-09-15, per request) -- mirrors
// departmentTaxonomy.ts's RULES-derived SUBJECT_AREAS exactly, since the
// manual-entry dropdown below must only ever offer names the backend's
// PATCH /instructors/:id/subject route will actually accept (it 400s on
// anything not on that list). Keep these two lists in sync by hand if a
// new area is ever added to that taxonomy.
const SUBJECT_AREAS: string[] = [
  'Frontend',
  'Backend',
  'DSA',
  'GenAI',
  'Artificial Intelligence & Emerging Technologies',
  'Interdisciplinary & Applied Sciences',
  'English',
  'Aptitude',
  'Math',
];

export default function InstructorsPage() {
  const reportQuery = useGetReportsInstructors();
  const report = reportQuery.data;
  const [category, setCategory] = useState<CategoryKey>('instructors');
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilterKey[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string[]>([]);
  const [capabilityManagerFilter, setCapabilityManagerFilter] = useState<string[]>([]);
  const [payrollFilter, setPayrollFilter] = useState<PayrollFilterKey[]>([]);
  const [campusFilter, setCampusFilter] = useState<string[]>([]);

  // Resets every filter back to "nothing selected" (= all) in one click
  // (2026-09-15, per request) -- deliberately leaves `search` and
  // `category` alone, since those aren't filters in the same sense (the
  // tab you're on, and a free-text lookup), just the 5 filters above.
  function clearFilters() {
    setGenderFilter([]);
    setSubjectFilter([]);
    setCapabilityManagerFilter([]);
    setPayrollFilter([]);
    setCampusFilter([]);
  }

  const split = report?.access_breakdown?.[category];
  const allPeople = useMemo(() => mergedPeople(split), [split]);
  const people = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allPeople.filter((person) => {
      if (genderFilter.length > 0 && !genderFilter.includes(normalizeGender(person.gender))) return false;
      if (subjectFilter.length > 0 && !subjectFilter.includes(person.dept_area || UNSPECIFIED_SUBJECT)) return false;
      if (capabilityManagerFilter.length > 0 && !capabilityManagerFilter.includes(person.capability_manager || NO_CAPABILITY_MANAGER)) return false;
      if (payrollFilter.length > 0 && !payrollFilter.includes(person.is_payroll ? 'payroll' : 'nxtwave')) return false;
      if (campusFilter.length > 0 && !matchesCampus(person, campusFilter)) return false;
      if (!query) return true;
      return person.full_name.toLowerCase().includes(query) || (person.employee_id ?? '').toLowerCase().includes(query) || (person.teachos_user_id ?? '').toLowerCase().includes(query);
    });
  }, [allPeople, search, genderFilter, subjectFilter, capabilityManagerFilter, payrollFilter, campusFilter]);

  const activeTab = CATEGORY_TABS.find((tab) => tab.key === category)!;

  // Counts per gender bucket for the currently-viewed category (2026-09-09,
  // per request: "add a filter ... to check how many female and male
  // employees we have"). Computed from allPeople, same as the Capability
  // Manager coverage stats below, so switching category updates the counts
  // but the search box doesn't -- this is meant to answer "how many of this
  // category are Male/Female", not "how many of my search results are".
  const genderCounts = useMemo(() => {
    const counts: Record<GenderFilterKey, number> = { male: 0, female: 0, unknown: 0 };
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
    if (genderFilter.length === 0 || !report?.access_breakdown) return null;
    return CATEGORY_TABS.map((tab) => {
      const tabPeople = mergedPeople(report.access_breakdown?.[tab.key]);
      return { key: tab.key, label: tab.label, count: tabPeople.filter((person) => genderFilter.includes(normalizeGender(person.gender))).length, total: tabPeople.length };
    });
  }, [report, genderFilter]);

  // Subject filter options + counts for the currently-viewed category
  // (2026-09-15, per request) -- same "same as gender" treatment as above,
  // but the option set itself is data-driven (see UNSPECIFIED_SUBJECT's
  // comment) rather than a fixed list.
  const subjectOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of allPeople) {
      const key = person.dept_area || UNSPECIFIED_SUBJECT;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const areas = [...counts.keys()].filter((key) => key !== UNSPECIFIED_SUBJECT).sort((a, b) => a.localeCompare(b));
    const options = areas.map((area) => ({ key: area, label: area, count: counts.get(area)! }));
    if (counts.has(UNSPECIFIED_SUBJECT)) options.push({ key: UNSPECIFIED_SUBJECT, label: 'Not set', count: counts.get(UNSPECIFIED_SUBJECT)! });
    return options;
  }, [allPeople]);

  const subjectBreakdown = useMemo(() => {
    if (subjectFilter.length === 0 || !report?.access_breakdown) return null;
    return CATEGORY_TABS.map((tab) => {
      const tabPeople = mergedPeople(report.access_breakdown?.[tab.key]);
      return { key: tab.key, label: tab.label, count: tabPeople.filter((person) => subjectFilter.includes(person.dept_area || UNSPECIFIED_SUBJECT)).length, total: tabPeople.length };
    });
  }, [report, subjectFilter]);

  // Capability Manager filter options + counts, same pattern as Subject
  // above (2026-09-15, per request).
  const capabilityManagerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of allPeople) {
      const key = person.capability_manager || NO_CAPABILITY_MANAGER;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const managers = [...counts.keys()].filter((key) => key !== NO_CAPABILITY_MANAGER).sort((a, b) => a.localeCompare(b));
    const options = managers.map((manager) => ({ key: manager, label: manager, count: counts.get(manager)! }));
    if (counts.has(NO_CAPABILITY_MANAGER)) options.push({ key: NO_CAPABILITY_MANAGER, label: 'Not on file', count: counts.get(NO_CAPABILITY_MANAGER)! });
    return options;
  }, [allPeople]);

  const capabilityManagerBreakdown = useMemo(() => {
    if (capabilityManagerFilter.length === 0 || !report?.access_breakdown) return null;
    return CATEGORY_TABS.map((tab) => {
      const tabPeople = mergedPeople(report.access_breakdown?.[tab.key]);
      return { key: tab.key, label: tab.label, count: tabPeople.filter((person) => capabilityManagerFilter.includes(person.capability_manager || NO_CAPABILITY_MANAGER)).length, total: tabPeople.length };
    });
  }, [report, capabilityManagerFilter]);

  // Payroll filter counts + breakdown, same pattern as Gender above
  // (2026-09-15, per request).
  const payrollCounts = useMemo(() => {
    const counts: Record<PayrollFilterKey, number> = { payroll: 0, nxtwave: 0 };
    for (const person of allPeople) counts[person.is_payroll ? 'payroll' : 'nxtwave'] += 1;
    return counts;
  }, [allPeople]);

  const payrollBreakdown = useMemo(() => {
    if (payrollFilter.length === 0 || !report?.access_breakdown) return null;
    return CATEGORY_TABS.map((tab) => {
      const tabPeople = mergedPeople(report.access_breakdown?.[tab.key]);
      return { key: tab.key, label: tab.label, count: tabPeople.filter((person) => payrollFilter.includes(person.is_payroll ? 'payroll' : 'nxtwave')).length, total: tabPeople.length };
    });
  }, [report, payrollFilter]);

  // Campus filter options + counts for the currently-viewed category
  // (2026-09-15, per request), same pattern as Subject/Capability Manager
  // above -- except a person can count toward more than one option here
  // (see matchesCampus's comment), so these counts don't sum to allPeople.length.
  const campusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let unspecified = 0;
    for (const person of allPeople) {
      const institutes = person.institutes ?? [];
      if (institutes.length === 0) { unspecified += 1; continue; }
      for (const institute of institutes) counts.set(institute, (counts.get(institute) ?? 0) + 1);
    }
    const campuses = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    const options = campuses.map((campus) => ({ key: campus, label: campus, count: counts.get(campus)! }));
    if (unspecified > 0) options.push({ key: UNSPECIFIED_CAMPUS, label: 'Not set', count: unspecified });
    return options;
  }, [allPeople]);

  const campusBreakdown = useMemo(() => {
    if (campusFilter.length === 0 || !report?.access_breakdown) return null;
    return CATEGORY_TABS.map((tab) => {
      const tabPeople = mergedPeople(report.access_breakdown?.[tab.key]);
      return { key: tab.key, label: tab.label, count: tabPeople.filter((person) => matchesCampus(person, campusFilter)).length, total: tabPeople.length };
    });
  }, [report, campusFilter]);

  const anyFilterActive = genderFilter.length > 0 || subjectFilter.length > 0 || capabilityManagerFilter.length > 0 || payrollFilter.length > 0 || campusFilter.length > 0;

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
      <div className="flex flex-wrap items-center gap-4 border-t border-border/70 pt-3">
        <MultiSelectFilter
          label="Gender"
          options={GENDER_FILTERS.map((filter) => ({ key: filter.key, label: filter.label, count: genderCounts[filter.key] }))}
          selected={genderFilter}
          onChange={(next) => setGenderFilter(next as GenderFilterKey[])}
          testId="select-gender-filter"
          widthClass="w-[170px]"
        />
        <MultiSelectFilter label="Subject" options={subjectOptions} selected={subjectFilter} onChange={setSubjectFilter} testId="select-subject-filter" />
        <MultiSelectFilter label="Capability Manager" options={capabilityManagerOptions} selected={capabilityManagerFilter} onChange={setCapabilityManagerFilter} testId="select-capability-manager-filter" />
        <MultiSelectFilter
          label="Payroll"
          options={PAYROLL_FILTERS.map((filter) => ({ key: filter.key, label: filter.label, count: payrollCounts[filter.key] }))}
          selected={payrollFilter}
          onChange={(next) => setPayrollFilter(next as PayrollFilterKey[])}
          testId="select-payroll-filter"
          widthClass="w-[170px]"
        />
        <MultiSelectFilter label="Campus" options={campusOptions} selected={campusFilter} onChange={setCampusFilter} testId="select-campus-filter" />
        {anyFilterActive && <button type="button" data-testid="button-clear-filters" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary">
          <X size={13} /> Clear filters
        </button>}
        {anyFilterActive && <span className="font-mono-ui text-[10px] text-muted-foreground">Table below is filtered to {activeTab.label.toLowerCase()}; see the breakdown card(s) below for every category.</span>}
      </div>
    </div>

    {genderFilter.length > 0 && genderBreakdown && <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f3e8fb] text-[#7c3aa8]"><Users size={16} /></span>
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Darwin — Gender field</p>
          <h2 className="text-[15px] font-extrabold tracking-[-0.03em]">{selectionSummary(genderFilter, (key) => GENDER_FILTERS.find((filter) => filter.key === key)?.label ?? key)} headcount, by category</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {genderBreakdown.map((row) => <MiniStat key={row.key} label={row.label} value={row.count} meta={`${pct(row.count, row.total)} of ${row.label.toLowerCase()}`} tone="muted" />)}
      </div>
    </section>}

    {subjectFilter.length > 0 && subjectBreakdown && <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e3f0fb] text-[#1d6fa5]"><BookOpen size={16} /></span>
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Darwin — derived teaching area</p>
          <h2 className="text-[15px] font-extrabold tracking-[-0.03em]">{selectionSummary(subjectFilter, (key) => (key === UNSPECIFIED_SUBJECT ? 'Not set' : key))} headcount, by category</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {subjectBreakdown.map((row) => <MiniStat key={row.key} label={row.label} value={row.count} meta={`${pct(row.count, row.total)} of ${row.label.toLowerCase()}`} tone="muted" />)}
      </div>
    </section>}

    {capabilityManagerFilter.length > 0 && capabilityManagerBreakdown && <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#dff0eb] text-[#287469]"><UserCheck size={16} /></span>
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">TeachOS — Capability Manager</p>
          <h2 className="text-[15px] font-extrabold tracking-[-0.03em]">{selectionSummary(capabilityManagerFilter, (key) => (key === NO_CAPABILITY_MANAGER ? 'Not on file' : key))} headcount, by category</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {capabilityManagerBreakdown.map((row) => <MiniStat key={row.key} label={row.label} value={row.count} meta={`${pct(row.count, row.total)} of ${row.label.toLowerCase()}`} tone="muted" />)}
      </div>
    </section>}

    {payrollFilter.length > 0 && payrollBreakdown && <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e6e9fb] text-[#4a4fb0]"><Wallet size={16} /></span>
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Payroll status</p>
          <h2 className="text-[15px] font-extrabold tracking-[-0.03em]">{selectionSummary(payrollFilter, (key) => PAYROLL_FILTERS.find((filter) => filter.key === key)?.label ?? key)} headcount, by category</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {payrollBreakdown.map((row) => <MiniStat key={row.key} label={row.label} value={row.count} meta={`${pct(row.count, row.total)} of ${row.label.toLowerCase()}`} tone="muted" />)}
      </div>
    </section>}

    {campusFilter.length > 0 && campusBreakdown && <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#fbe9e3] text-[#b0511f]"><MapPin size={16} /></span>
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Campus</p>
          <h2 className="text-[15px] font-extrabold tracking-[-0.03em]">{selectionSummary(campusFilter, (key) => (key === UNSPECIFIED_CAMPUS ? 'Not set' : key))} headcount, by category</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {campusBreakdown.map((row) => <MiniStat key={row.key} label={row.label} value={row.count} meta={`${pct(row.count, row.total)} of ${row.label.toLowerCase()}`} tone="muted" />)}
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

// Checkbox-list dropdown backing every filter on this page (2026-09-15, per
// request -- "add multiple filter options"). A native <select multiple>
// needs ctrl/cmd-click to pick more than one value, which is not
// discoverable and doesn't work on touch at all -- this is the standard
// checkbox-popover pattern instead: click the trigger to open, check any
// number of options, click outside (or the trigger again) to close.
// `selected`/`onChange` are plain string arrays so gender/payroll's typed
// keys and subject/capability-manager/campus's dynamic string keys can all
// share one component -- callers narrow the type back with `as` where
// needed (see the two typed filters' onChange props in the JSX below).
function MultiSelectFilter({ label, options, selected, onChange, testId, widthClass = 'max-w-[220px]' }: {
  label: string;
  options: { key: string; label: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
  testId: string;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((existing) => existing !== key) : [...selected, key]);
  }

  const summary = selected.length === 0
    ? 'All'
    : selected.length === 1
      ? (options.find((option) => option.key === selected[0])?.label ?? selected[0])
      : `${selected.length} selected`;

  return <div className="flex flex-wrap items-center gap-2">
    <label className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</label>
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-9 items-center justify-between gap-2 rounded-lg border bg-background px-2.5 text-[12px] font-bold outline-none transition-colors focus:ring-2 focus:ring-ring/25 ${widthClass} ${selected.length > 0 ? 'border-primary text-primary' : 'border-border text-foreground'}`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-[280px] w-max min-w-[220px] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
        {options.length === 0 && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No options for this category</p>}
        {options.map((option) => <label key={option.key} data-testid={`${testId}-option-${option.key}`} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-secondary">
          <input type="checkbox" checked={selected.includes(option.key)} onChange={() => toggle(option.key)} className="h-3.5 w-3.5 shrink-0 accent-primary" />
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{option.label}</span>
          <span className="shrink-0 font-mono-ui text-[10px] text-muted-foreground">{formatCount(option.count)}</span>
        </label>)}
      </div>}
    </div>
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
// Email (Darwin's Org Email Id -- 2026-09-15, per request) sits right after
// TeachOS User ID, alongside the other identity/ID columns, in every
// category's grid template (220px, added to every literal template below --
// kept as full literal strings, not interpolated, per the Tailwind gotcha
// explained above). Location (Darwin's own Work Location field --
// 2026-09-15, per request) sits right after Email -- distinct from Campus
// (institutes, TeachOS deployment), which stays where it was (150px).
// Trailing 190px on every variant below is the new Exit column (2026-09-17,
// per request) -- wide enough for the "Serving Notice Period" dropdown
// option text (the longest of the three) without clipping.
function gridColsClass(category: CategoryKey): string {
  if (category === 'instructors') return 'grid-cols-[260px_190px_130px_280px_220px_150px_160px_170px_220px_140px_190px_130px_150px_190px]';
  // "Instructor Department" (the combined list) has the same column set as
  // Mentors: Subject + Department, Campus, no Payroll (payroll status isn't
  // a meaningful concept for the Mentors/Ops rows mixed into this list).
  if (category === 'mentors' || category === 'department') return 'grid-cols-[260px_190px_130px_280px_220px_150px_160px_170px_240px_140px_190px_150px_190px]';
  // Operations team has no Campus column -- ops rows aren't deployed to a
  // teaching campus the way instructors and mentors are. It also has only
  // one Subject/Department-style column (labeled "Department"), not both.
  return 'grid-cols-[260px_190px_130px_280px_220px_150px_280px_140px_190px_150px_190px]';
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
  const headers = [nameColumnLabel(category), 'Designation', 'Employee ID', 'TeachOS User ID', 'Email', 'Location (Darwin)'];
  if (category === 'ops_team') headers.push('Department'); else headers.push('Subject', 'Department');
  if (category !== 'ops_team') headers.push('Campus');
  headers.push('Date of joining');
  headers.push('Capability Manager');
  if (category === 'instructors') headers.push('Payroll');
  headers.push('Gender');
  headers.push('Exit');

  const rows = people.map((person) => {
    const row: string[] = [person.full_name, person.designation ?? '', person.employee_id ?? '', person.teachos_user_id ?? '', person.org_email ?? '', person.work_location ?? ''];
    if (category === 'ops_team') row.push(person.department ?? ''); else row.push(person.dept_area ?? '', person.department ?? '');
    if (category !== 'ops_team') row.push(person.institutes?.join(', ') ?? '');
    row.push(person.date_of_joining ?? '');
    row.push(person.capability_manager ?? '');
    if (category === 'instructors') row.push(person.is_payroll ? 'Payroll' : 'Nxtwave');
    row.push(person.gender ?? '');
    // Blank when there's no exit record at all; "Not reviewed" when one
    // exists but no Capability Manager has verified it yet; otherwise the
    // reviewed label -- mirrors ExitCell's dash-vs-dropdown split below.
    row.push(person.exit_flag ? EXIT_VERIFICATION_LABELS[person.exit_verification ?? ''] ?? 'Not reviewed' : '');
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
          <span>Email</span>
          <span>Location (Darwin)</span>
          {category === 'ops_team' ? <span>Department</span> : <><span>Subject</span><span>Department</span></>}
          {category !== 'ops_team' && <span>Campus</span>}
          <span>Date of joining</span>
          <span>Capability Manager</span>
          {category === 'instructors' && <span>Payroll</span>}
          <span>Gender</span>
          <span>Exit</span>
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
    {/* No Darwin access right now -> blank, not "--", same gating as
        date_of_joining below -- see org_email's comment in reports.ts. */}
    <div className="truncate text-[12px] text-muted-foreground">{person.org_email || ''}</div>
    <div className="truncate text-[12px] text-muted-foreground">{person.work_location || ''}</div>
    {category === 'ops_team' ? <div className="truncate text-[12px] text-muted-foreground">{person.department || '—'}</div> : <>
      <SubjectCell person={person} />
      <div className="truncate text-[12px] text-muted-foreground">{person.department || '—'}</div>
    </>}
    {category !== 'ops_team' && <div className="truncate text-[12px] text-muted-foreground">{campus}</div>}
    {/* No Darwin access right now -> blank (not "--"), per request: this
        column is specifically Darwin's date of joining, not a general
        "unknown" placeholder. See date_of_joining's gating in reports.ts. */}
    <div className="truncate font-mono-ui text-[11px] text-muted-foreground">{person.date_of_joining || ''}</div>
    <CapabilityManagerCell person={person} />
    {category === 'instructors' && <div>{person.is_payroll ? <span className="inline-flex rounded-full bg-[#e6e9fb] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#4a4fb0]">Payroll</span> : <span className="inline-flex rounded-full bg-secondary px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">Nxtwave</span>}</div>}
    <GenderCell person={person} />
    <ExitCell person={person} />
  </Link>;
}

// Gender is read-only text when Darwin supplied it (person.gender_source ===
// 'darwin') -- Darwin's own value is never overridden here. Otherwise
// (no Darwin record, or a Darwin record with gender left blank) this shows
// an editable Male/Female dropdown so whoever knows the person can mark it
// (2026-09-09, per request). Reachable by either Admin or Manager -- see
// the dedicated PATCH /instructors/:id/gender route (requireAuth only, no
// requireRole, unlike the other manual-edit fields on the detail page).
// preventDefault + stopPropagation on the wrapping div are BOTH required:
// PersonRow's whole row is a wouter <Link>, rendered as a real <a href=...>.
// stopPropagation alone (2026-09-15's original fix) isn't enough -- it stops
// wouter's own onClick (attached to that <a>) from firing, but wouter's
// onClick is also what calls preventDefault() to stop the browser's native
// anchor navigation. Block that handler from ever running and the native
// "follow this link" behavior fires unopposed instead of being suppressed --
// clicking the dropdown was redirecting straight to the instructor detail
// page (2026-09-16, per report), the opposite of the intended fix. Calling
// preventDefault() here too suppresses the browser's default action for the
// whole dispatch regardless of which element's listener calls it.
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
  return <div onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} className="text-[12px]">
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

const EXIT_VERIFICATION_LABELS: Record<string, string> = {
  exited: 'Exited',
  serving_notice_period: 'Serving Notice Period',
  payroll_converted: 'Payroll Converted',
};

// Exit column (2026-09-17, per request): for anyone with a live Darwinbox
// exit record on file (person.exit_flag), shows an editable dropdown so a
// Capability Manager can record their read on the situation -- Exited,
// Serving Notice Period, or Payroll Converted. This is a TRACKING LABEL
// ONLY (see exitVerification's comment in the schema): picking a value here
// never changes computed/manual status or the standing instructor headcount
// -- that stays the separate Manual Status control on the instructor detail
// page. Everyone else (no exit record) just gets a dash, same as e.g.
// designation's fallback above. Reachable by either Admin or Manager, same
// population as Gender above -- see the dedicated PATCH
// /instructors/:id/exit-verification route (requireAuth only, no
// requireRole). preventDefault + stopPropagation on the wrapping div are
// BOTH required here too -- see GenderCell's comment above for why.
function ExitCell({ person }: { person: InstructorSummary }) {
  const queryClient = useQueryClient();
  const updateExitVerification = useUpdateInstructorExitVerification({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetReportsInstructorsQueryKey() });
      },
    },
  });

  if (!person.exit_flag) {
    return <div className="truncate text-[12px] text-muted-foreground">—</div>;
  }

  const value = person.exit_verification ?? '';
  return <div onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} className="text-[12px]">
    <select
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        updateExitVerification.mutate({ id: person.id, data: { exit_verification: next === '' ? null : (next as 'exited' | 'serving_notice_period' | 'payroll_converted') } });
      }}
      disabled={updateExitVerification.isPending}
      data-testid={`select-exit-verification-${person.id}`}
      title="Exit record on file -- verify what's actually going on with this person"
      className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-[11px] font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:opacity-60"
    >
      <option value="">Not reviewed</option>
      <option value="exited">{EXIT_VERIFICATION_LABELS.exited}</option>
      <option value="serving_notice_period">{EXIT_VERIFICATION_LABELS.serving_notice_period}</option>
      <option value="payroll_converted">{EXIT_VERIFICATION_LABELS.payroll_converted}</option>
    </select>
  </div>;
}

// Capability Manager is always read-only text here -- the manual-entry
// dropdown this cell used to show for people with no TeachOS-matched
// Capability Manager was removed (2026-09-16, per request): a missing
// Capability Manager here means the person isn't in TeachOS at all yet, not
// a data gap someone should paper over by hand -- once they're added to
// TeachOS, their real Capability Manager comes through the normal sync
// like everyone else's. The dedicated PATCH /instructors/:id/capability-
// manager route (and manual_capability_manager column) are left in place
// server-side in case a manual override is wanted again later; nothing in
// this page calls it anymore.
//
// A manually-set value from before this change (capability_manager_source
// === 'manual') still displays normally here -- this only removes the
// ability to set new ones, not existing data.
function CapabilityManagerCell({ person }: { person: InstructorSummary }) {
  // No valid Capability Manager name matched among this person's TeachOS
  // candidates and none has been set manually either -- flagged distinctly
  // (not just a blank/dash) so a gap in this data is easy to spot at a
  // glance while scanning the table, per the coverage section above.
  return <div className="truncate text-[12px]">{person.capability_manager ? <span className="text-foreground">{person.capability_manager}</span> : <span className="inline-flex rounded-full bg-[#fff7db] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#8b6207]">Missing</span>}</div>;
}

// Subject is read-only text when classifyDepartment() resolved one
// (person.dept_area_source === 'computed') -- the computed value is never
// overridden here. Otherwise (no usable Darwin department string, or a
// TeachOS-only row with no Darwin match at all -- see
// departmentTaxonomy.ts) this shows an editable dropdown, populated from
// that same taxonomy's recognized areas, so a human who knows the
// person's real teaching area can mark it (2026-09-15, per request).
// PersonRow only renders this for non-Operations-team categories -- ops
// rows never had a Subject column, and their null dept_area is
// intentional, not a gap this editor should fill.
//
// Admin-only, same gating as CapabilityManagerCell above (no separate
// Manager login anymore, so `user` truthy means signed in as Admin). See
// the dedicated PATCH /instructors/:id/subject route. Same
// preventDefault + stopPropagation requirement as GenderCell above (the
// whole row is a wouter <Link>, rendered as a real <a href=...> -- see
// GenderCell's comment for why stopPropagation alone isn't enough).
function SubjectCell({ person }: { person: InstructorSummary }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const updateSubject = useUpdateInstructorSubject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetReportsInstructorsQueryKey() });
      },
    },
  });

  // No department string classifyDepartment() could resolve, and none has
  // been set manually either -- flagged distinctly (not just a blank/dash)
  // so a gap in this data is easy to spot at a glance while scanning the
  // table.
  if (person.dept_area_source === 'computed' || !user) {
    return <div className="truncate text-[12px]">{person.dept_area ? <span className="text-muted-foreground">{person.dept_area}</span> : <span className="inline-flex rounded-full bg-[#fff7db] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#8b6207]">Missing</span>}</div>;
  }

  const value = person.dept_area_source === 'manual' && person.dept_area ? person.dept_area : '';
  return <div onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} className="text-[12px]">
    <select
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        updateSubject.mutate({ id: person.id, data: { manual_dept_area: next === '' ? null : next } });
      }}
      disabled={updateSubject.isPending}
      data-testid={`select-manual-subject-${person.id}`}
      title="No Subject resolved from Darwin's department -- mark it manually"
      className={`h-8 w-full rounded-md border bg-background px-1.5 text-[11px] font-semibold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:opacity-60 ${value ? 'border-border text-foreground' : 'border-[#f0d78c] text-[#8b6207]'}`}
    >
      <option value="">Missing -- pick one</option>
      {SUBJECT_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
    </select>
  </div>;
}
