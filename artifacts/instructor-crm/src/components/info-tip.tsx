import { useState } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// "Where does this number come from?" (2026-11-05, per request from the Capability Managers): a small (i) icon on each Overview card.
// Hover it (or tap / focus it on a phone or keyboard) to read how the card's numbers are worked out and which source they come from.
// The texts live in OVERVIEW_INFO below, one per card, so they can be updated in one place when a rule changes.
export function InfoTip({ title, lines, className = '', tone = 'muted', testId }: { title: string; lines: string[]; className?: string; tone?: 'muted' | 'light'; testId?: string }) {
  const [open, setOpen] = useState(false);
  return <Tooltip open={open} onOpenChange={setOpen} delayDuration={100}>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={`How "${title}" is calculated`}
        data-testid={testId}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${tone === 'light' ? 'text-primary-foreground/70 hover:bg-primary-foreground/15 hover:text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'} ${className}`}
      >
        <Info size={13} />
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" align="end" className="max-w-[340px] whitespace-normal p-3 text-left text-[11px] leading-snug">
      <p className="mb-1.5 text-[12px] font-extrabold">{title}</p>
      <ul className="list-disc space-y-1 pl-4">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
    </TooltipContent>
  </Tooltip>;
}

// One entry per Overview card. Keep in step with the rules in api-server/src/routes/reports.ts (computeDepartmentAndExceptionRows,
// loadArchivePeople), api-server/src/lib/product.ts (productOf) and instructors.tsx (productLabel).
export const OVERVIEW_INFO: Record<string, { title: string; lines: string[] }> = {
  needsReview: { title: 'Needs review (CM actions)', lines: [
    'People in the Instructor Department who have a Darwin exit record that is Approved or Pending With Approver (Revoked / Rejected do not count).',
    'Only people still in Darwin or TeachOS, and not filed under another department.',
    'Counted until their Capability Manager sets an Employee Status on the Instructors tab.',
    'Source: Darwinbox exit report (synced daily) + the Employee Status set on the Instructors tab.',
  ] },
  teachosActions: { title: 'TeachOS access actions (Admin team)', lines: [
    'Remove access: marked Exited or Absconded by their Capability Manager and still active in TeachOS (incl. payroll-converted people).',
    'Give access: instructors and mentors in Darwin only (no TeachOS record); Support, IIT X DSA and anyone with an approved / pending exit or marked Exited / Absconded are left out.',
    'Movement changes: Movement Tracker entries on the Instructors tab not yet marked as action taken.',
    'The count is the three added together. Serving-notice people are listed separately, not counted.',
  ] },
  approvalPending: { title: 'Approval pending (HRBP actions)', lines: [
    'Instructor Department people whose latest Darwin exit record is "Pending With Approver".',
    'People filed under another department are left out.',
    'Source: Darwinbox exit report, synced daily.',
  ] },
  // Written source-first (2026-11-05, per request): say WHERE the people come from, not just "instructors + mentors + ops".
  department: { title: 'Instructor Department', lines: [
    'Total count = Darwin\'s Instructors department + TeachOS\'s payroll-converted instructors. Together they are shown as the Instructor Department.',
    'Darwin\'s Instructors department: everyone whose Darwin department is "Instructors – <subject>", incl. "Instructors – Delivery Support (Ops and Central Managers)".',
    'TeachOS\'s payroll-converted instructors: active in TeachOS but with no Darwin record.',
    'Left out: the IIT Kharagpur team and people filed under another department.',
    'A person drops out once they are no longer in Darwin (Darwin people) or no longer active in TeachOS (payroll-converted people).',
    'Sources: Darwinbox active employees + TeachOS instructor roster (BigQuery), synced daily.',
  ] },
  instructorsMentors: { title: 'Instructors + Mentors', lines: [
    'From Darwin: instructors and mentors whose Darwin department is "Instructors – <subject>" (Frontend, Backend, DSA, English, Aptitude, Maths ...).',
    'Plus from TeachOS: payroll-converted instructors -- active in TeachOS, no Darwin record.',
    'The Operations team ("Instructors – Delivery Support") is not included. Each person is counted once.',
    'Sources: Darwinbox active employees + TeachOS instructor roster (BigQuery), synced daily.',
  ] },
  ops: { title: 'Operations team', lines: [
    'From Darwin: people whose Darwin department is "Instructors – Delivery Support (Ops and Central Managers)".',
    'Part of the Instructor Department but not counted as instructors or mentors; shown as Product "Support".',
    'Source: Darwinbox active employees, synced daily.',
  ] },
  exits: { title: 'Exit data (approved exits)', lines: [
    'From the Instructor Archive: people whose latest Darwin exit record is Approved, so their status is Exited.',
    'Payroll-converted people are left out (handled in the Exceptions).',
    'Date shown = last working day (Darwin "Date Of Exit").',
    '"+ / − since" compares with the list saved the previous day.',
    'Opening the card also lists upcoming exits: marked Exited / Absconded and waiting for approval, and serving notice.',
  ] },
  productMix: { title: 'Product mix', lines: [
    'The Instructor Department split by Product, from each person\'s TeachOS campus, checked in this order:',
    'Support = Operations team · Academy = campus has "Academy" · IIT X DSA = Darwin manager Jashwanth Dandu or campus "Nxtwave Institute of Advanced Technology - DSA" · IIT KGP = campus mentions IIT KGP / Kharagpur · Intensive = campus has "Intensive".',
    'NIAT (Training) = campus "Training Institute" or no campus yet · NIAT (Deployed) = any other campus.',
  ] },
  niatContribution: { title: 'Contribution of NIAT instructors & mentors', lines: [
    'NIAT (Deployed) instructors + mentors only (see Product mix).',
    'Cohort = the NIAT cohort (2024 / 2025 / 2026) of the batches they taught in the last 30 days, or the last 2 months if nothing in 30 days; upcoming (pending) sessions count too.',
    'Someone teaching two cohorts shows under both together (e.g. "2025 + 2026"). "No cohort yet" = no session in the last 2 months, or a batch not mapped to a cohort.',
    'Source: BigQuery session schedule (Instructor Contribution sync).',
  ] },
  topCampuses: { title: 'Top campuses', lines: [
    'Instructors + mentors (Support left out), counted per TeachOS campus; the 10 biggest are shown.',
    'Training Institute is not shown. Someone at two campuses counts at both.',
    'Source: TeachOS instructor roster (BigQuery).',
  ] },
  managerWorkload: { title: 'Manager workload', lines: [
    'Everyone in the Instructor Department (instructors, mentors, Operations team) grouped by their Capability Manager.',
    'Capability Manager = TeachOS\'s instructor manager, or the one set by hand on the Instructors tab when TeachOS has none.',
    'People without a Capability Manager are not listed.',
  ] },
  niatMap: { title: 'NIAT university locations', lines: [
    'Instructors + mentors (Support left out), placed on the map by their TeachOS campus.',
    'Click a pin to see the universities at that location and how many instructors and mentors each has.',
  ] },
};
