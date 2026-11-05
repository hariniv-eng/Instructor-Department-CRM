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
    <TooltipContent side="bottom" align="end" className="max-w-[280px] whitespace-normal p-2.5 text-left text-[11px] leading-snug">
      <p className="mb-1.5 text-[12px] font-extrabold">{title}</p>
      {lines.length === 1 ? <p>{lines[0]}</p> : <ul className="list-disc space-y-1 pl-4">{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
    </TooltipContent>
  </Tooltip>;
}

// One entry per Overview card. Kept short (2026-11-05, per request: "I don't want this much data") -- one or two lines saying where the
// number comes from. Keep in step with the rules in api-server/src/routes/reports.ts (computeDepartmentAndExceptionRows,
// loadArchivePeople), api-server/src/lib/product.ts (productOf) and instructors.tsx (productLabel).
export const OVERVIEW_INFO: Record<string, { title: string; lines: string[] }> = {
  needsReview: { title: 'Needs review', lines: ['Darwin exit records (Approved / Pending) not yet reviewed by the Capability Manager.'] },
  teachosActions: { title: 'TeachOS access actions', lines: ['Remove access (marked Exited) + give access (in Darwin, not in TeachOS) + open Movement Tracker changes.'] },
  approvalPending: { title: 'Approval pending', lines: ['Darwin exit records still "Pending With Approver".'] },
  department: { title: 'Instructor Department', lines: ['Darwin\'s Instructors department + TeachOS\'s payroll-converted instructors.'] },
  instructorsMentors: { title: 'Instructors + Mentors', lines: ['Instructor Department without the Operations team.'] },
  ops: { title: 'Operations team', lines: ['Darwin department "Instructors – Delivery Support (Ops and Central Managers)".'] },
  exits: { title: 'Exit data', lines: ['Approved Darwin exits from the Instructor Archive (payroll-converted left out).'] },
  productMix: { title: 'Product mix', lines: ['Instructor Department split by Product, based on each person\'s TeachOS campus.'] },
  niatContribution: { title: 'NIAT contribution', lines: ['NIAT (Deployed) instructors + mentors by the cohort of the batches they taught in the last 30 days (60 if none).'] },
  topCampuses: { title: 'Top campuses', lines: ['Instructors + mentors per TeachOS campus, top 10.'] },
  managerWorkload: { title: 'Manager workload', lines: ['Instructor Department grouped by Capability Manager.'] },
  niatMap: { title: 'NIAT university locations', lines: ['Instructors + mentors placed by their TeachOS campus.'] },
};
