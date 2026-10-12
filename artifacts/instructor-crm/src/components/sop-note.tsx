// SOP note shown beside the controls where a change is made (2026-10-12, per request). The content lives in lib/sop.ts.
// `focus` is the role of the person looking at it: their steps come first and are marked "Your steps"; the other
// roles' steps follow so everyone sees the whole chain (CM -> Admin -> HRBP).

import { ClipboardList } from 'lucide-react';
import { SOPS, SOP_ROLE_LABELS, type SopRole } from '@/lib/sop';

const ORDER: SopRole[] = ['cm', 'admin', 'hrbp'];

export function SopNote({ id, focus = 'cm', className = '' }: { id: string; focus?: SopRole; className?: string }) {
  const sop = SOPS[id];
  if (!sop) return null;
  const roles = [focus, ...ORDER.filter((role) => role !== focus)].filter((role) => sop[role].length > 0);
  return <div role="note" data-testid={`sop-note-${id}`} className={`rounded-lg border border-[#e3c577] bg-[#fdf5df] px-3 py-2.5 text-[12px] leading-snug text-[#5c3d06] dark:border-[#6b5420] dark:bg-[#2e2410] dark:text-[#f1d996] ${className}`}>
    <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em]"><ClipboardList size={13} /> SOP — {sop.title}</div>
    <div className="mt-1.5 space-y-1.5">
      {roles.map((role) => <div key={role}>
        <div className="font-bold">{SOP_ROLE_LABELS[role]}{role === focus ? ' — your steps' : ''}</div>
        <ul className="ml-4 list-disc space-y-0.5">{sop[role].map((step) => <li key={step}>{step}</li>)}</ul>
      </div>)}
    </div>
  </div>;
}

// Several SOPs at once (the Admin-team Movement actions list shows one per type that is currently open).
export function SopNoteList({ ids, focus = 'admin', className = '' }: { ids: string[]; focus?: SopRole; className?: string }) {
  const known = ids.filter((id) => SOPS[id]);
  if (known.length === 0) return null;
  return <div className={`grid gap-2 md:grid-cols-2 ${className}`}>{known.map((id) => <SopNote key={id} id={id} focus={focus} />)}</div>;
}
