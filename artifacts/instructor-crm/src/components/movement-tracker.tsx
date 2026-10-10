// Movement Tracker + Action Taken columns of the Instructors table (2026-10-09, per request).
//
// A Capability Manager logs a movement for an instructor -- a CM change (with a remark saying which
// Capability Manager it should change to), an external move, a DSA team move, a product move, or a
// deployment change -- and whoever actions it marks "Action Taken" yes / no. Every movement is kept
// (routes/movements.ts); the table cell shows the latest one and the dialog shows the whole history.
//
// The table rows are wouter <Link>s, so every interactive piece here is wrapped in a div that stops
// the click (see GenderCell in instructors.tsx for why preventDefault AND stopPropagation are both
// needed). The Dialog is rendered inside that wrapper too: React events from a portal bubble through
// the React tree, so the wrapper also keeps clicks inside the dialog from reaching the row's link.

import { useMemo, useState } from 'react';
import { History, Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

export type Movement = {
  id: number;
  instructor_id: number;
  employee_id: string | null;
  full_name: string;
  movement_type: string;
  remark: string;
  requested_by: string;
  requested_at: string;
  action_taken: 'yes' | 'no' | null;
  action_by: string | null;
  action_at: string | null;
};

// Labels as requested 2026-10-09. The stored values keep their original keys so movements already logged still show.
export const MOVEMENT_TYPES: { value: string; label: string }[] = [
  { value: 'cm_change', label: 'CM change' },
  { value: 'external_move', label: 'Team Movement' },
  { value: 'dsa_team', label: 'DSA team Move' },
  { value: 'product_move', label: 'Product Movement' },
  { value: 'deployment_yes', label: 'Ins/Men Deployment' },
  { value: 'deployment_no', label: 'Ins/Men Recall' },
];
export const movementLabel = (value: string) => MOVEMENT_TYPES.find((type) => type.value === value)?.label ?? value;
// After a movement is marked Action Taken = Yes, the Movement Tracker and Action Taken cells go back to blank once 24
// hours have passed (2026-10-09, per request), so the same instructor can be given a fresh movement. The movement
// itself is never deleted -- the dialog's History keeps everything. A "No" or a not-yet-actioned movement stays put.
export const ACTION_RESET_MS = 24 * 60 * 60 * 1000;
// Changes logged together (same requested_at) form one group; the cells show the whole latest group.
export function currentMovements(movements: Movement[], now: number = Date.now()): Movement[] {
  const latest = movements[0];
  if (!latest) return [];
  const group = movements.filter((movement) => movement.requested_at === latest.requested_at);
  const actedAt = group.map((movement) => (movement.action_taken === 'yes' && movement.action_at ? new Date(movement.action_at).getTime() : NaN));
  // Cleared once EVERY change in the group is Yes and the last of them is 24h old.
  if (actedAt.every((time) => !Number.isNaN(time)) && now - Math.max(...actedAt) >= ACTION_RESET_MS) return [];
  return group;
}
export const currentMovement = (movements: Movement[], now: number = Date.now()): Movement | undefined => currentMovements(movements, now)[0];
export const actionLabel = (value: string | null | undefined) => (value === 'yes' ? 'Yes' : value === 'no' ? 'No' : '');

const QUERY_KEY = ['instructor-movements'];
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
  return body as T;
}

// Last map handed out by useMovementsByInstructor, so the (non-React) CSV export can add the two columns too.
let knownMovements = new Map<number, Movement[]>();
export const getKnownMovements = () => knownMovements;

// One shared query for the whole table; returns every movement grouped by instructor, newest first.
export function useMovementsByInstructor(): Map<number, Movement[]> {
  const query = useQuery<{ movements: Movement[] }>({
    queryKey: QUERY_KEY,
    queryFn: async () => readJson(await fetch('/api/instructor-movements')),
  });
  return useMemo(() => {
    const map = new Map<number, Movement[]>();
    for (const movement of query.data?.movements ?? []) {
      const list = map.get(movement.instructor_id) ?? [];
      list.push(movement);
      map.set(movement.instructor_id, list);
    }
    knownMovements = map;
    return map;
  }, [query.data]);
}

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const TYPE_TONES: Record<string, string> = {
  cm_change: 'bg-[#e1eaf1] text-primary',
  external_move: 'bg-[#f6e4de] text-[#9b4434]',
  dsa_team: 'bg-[#e6e9fb] text-[#4a4fb0]',
  product_move: 'bg-[#fbeed3] text-[#8a5a0b]',
  deployment_yes: 'bg-[#dff0eb] text-[#256e65]',
  deployment_no: 'bg-secondary text-muted-foreground',
};

// The dialog is portalled to <body>, so a click inside it never reaches the row's <a> natively -- only React's
// synthetic bubbling does. preventDefault there would also cancel the form's submit (that was why "Log movement"
// did nothing), so it is only called for clicks that happened inside the cell itself.
const stopRowClick = (event: React.SyntheticEvent) => {
  event.stopPropagation();
  if (event.currentTarget.contains(event.target as Node)) event.preventDefault();
};
const stopPropagationOnly = (event: React.SyntheticEvent) => event.stopPropagation();

export function MovementCell({ instructorId, fullName, movements }: { instructorId: number; fullName: string; movements: Movement[] }) {
  const [open, setOpen] = useState(false);
  const group = currentMovements(movements);
  return <div onClick={stopRowClick} onKeyDown={(event) => event.stopPropagation()} className="min-w-0 text-[12px]">
    <div className="flex items-center gap-2">
      {group.length > 0
        ? <div className="min-w-0 flex-1 space-y-1.5">
          {group.map((movement) => <div key={movement.id} title={`${movementLabel(movement.movement_type)}: ${movement.remark} -- logged on ${formatWhen(movement.requested_at)}`}>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.05em] ${TYPE_TONES[movement.movement_type] ?? 'bg-secondary text-muted-foreground'}`}>{movementLabel(movement.movement_type)}</span>
            <div className="truncate text-muted-foreground">{movement.remark}</div>
          </div>)}
        </div>
        : <span className="flex-1 text-muted-foreground">—</span>}
      <button type="button" onClick={() => setOpen(true)} data-testid={`button-movement-${instructorId}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary" title={group.length ? 'Log another movement or see the history' : 'Log a movement'}>
        {group.length ? <><History size={12} />{movements.length > 1 ? movements.length : ''}</> : <Plus size={12} />}
      </button>
    </div>
    <MovementDialog open={open} onOpenChange={setOpen} instructorId={instructorId} fullName={fullName} movements={movements} />
  </div>;
}

function MovementDialog({ open, onOpenChange, instructorId, fullName, movements }: { open: boolean; onOpenChange: (open: boolean) => void; instructorId: number; fullName: string; movements: Movement[] }) {
  const queryClient = useQueryClient();
  // Several changes can be logged in one go (2026-10-10, per request): e.g. a product move that also changes the
  // Capability Manager. Each "+" adds another Movement + Remark pair.
  const MAX_CHANGES = 6;
  const blankChange = () => ({ type: 'cm_change', remark: '' });
  const [changes, setChanges] = useState([blankChange()]);
  const updateChange = (index: number, patch: Partial<{ type: string; remark: string }>) => setChanges((list) => list.map((change, i) => (i === index ? { ...change, ...patch } : change)));
  const log = useMutation({
    mutationFn: async () => readJson<{ movements: Movement[] }>(await fetch(`/api/instructors/${instructorId}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: changes.map((change) => ({ movement_type: change.type, remark: change.remark })) }),
    })),
    onSuccess: () => {
      const count = changes.length;
      setChanges([blankChange()]);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: count > 1 ? 'Movements logged' : 'Movement logged', description: `${count} ${count > 1 ? 'changes' : 'change'} recorded for ${fullName}.` });
    },
    onError: (error) => toast({ variant: 'destructive', title: "Couldn't log the movement", description: error instanceof Error ? error.message : 'Try again.' }),
  });
  const inputClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25';
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]" onClick={stopPropagationOnly}>
      <DialogHeader>
        <DialogTitle>Movement tracker — {fullName}</DialogTitle>
        <DialogDescription>Log a change for this instructor, and use + if more than one thing changes (for example a product move that also changes the Capability Manager). Mark it Yes in the Action Taken column once it is done; the two columns clear 24 hours after that.</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); log.mutate(); }}>
        {changes.map((change, index) => <div key={index} className="space-y-2 rounded-lg border border-border/70 p-3" data-testid={`movement-change-${index}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Change {index + 1}</span>
            {changes.length > 1 && <button type="button" onClick={() => setChanges((list) => list.filter((_, i) => i !== index))} aria-label={`Remove change ${index + 1}`} data-testid={`button-remove-change-${index}`} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X size={14} /></button>}
          </div>
          <label className="block text-[12px] font-bold">Movement
            <select value={change.type} onChange={(event) => updateChange(index, { type: event.target.value })} data-testid={`select-movement-type-${index}`} className={`${inputClass} mt-1`}>
              {MOVEMENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-[12px] font-bold">Remark
            <textarea value={change.remark} onChange={(event) => updateChange(index, { remark: event.target.value })} rows={2} maxLength={1000} data-testid={`input-movement-remark-${index}`} placeholder={change.type === 'cm_change' ? 'Which Capability Manager should this instructor move to?' : 'What is changing, and to what?'} className={`${inputClass} mt-1 resize-y`} />
          </label>
          {index === changes.length - 1 && changes.length < MAX_CHANGES && <button type="button" onClick={() => setChanges((list) => [...list, blankChange()])} data-testid="button-add-change" className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-secondary"><Plus size={12} /> Add another change</button>}
        </div>)}
        <div className="flex justify-end">
          <button type="submit" disabled={log.isPending || changes.some((change) => !change.remark.trim())} data-testid="button-submit-movement" className="rounded-lg bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{log.isPending ? 'Saving…' : changes.length > 1 ? `Log ${changes.length} movements` : 'Log movement'}</button>
        </div>
      </form>
      <div>
        <h3 className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">History ({movements.length})</h3>
        {movements.length === 0 && <p className="text-[12px] text-muted-foreground">No movements logged yet.</p>}
        <ul className="space-y-2">
          {movements.map((movement) => <li key={movement.id} className="rounded-lg border border-border p-3 text-[12px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.05em] ${TYPE_TONES[movement.movement_type] ?? 'bg-secondary text-muted-foreground'}`}>{movementLabel(movement.movement_type)}</span>
              <span className="text-muted-foreground">{formatWhen(movement.requested_at)} · {movement.requested_by}</span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap">{movement.remark}</p>
            <p className="mt-1.5 text-muted-foreground">Action taken: <span className="font-bold text-foreground">{actionLabel(movement.action_taken) || 'Not yet'}</span>{movement.action_taken && movement.action_at ? ` · ${movement.action_by ? `${movement.action_by}, ` : ''}${formatWhen(movement.action_at)}` : ''}</p>
          </li>)}
        </ul>
      </div>
    </DialogContent>
  </Dialog>;
}

// Action Taken applies to the latest group of changes: blank until someone actions it, then Yes or No for all of them.
export function ActionTakenCell({ movements }: { movements: Movement[] }) {
  const queryClient = useQueryClient();
  const group = currentMovements(movements);
  const latest = group[0];
  const update = useMutation({
    mutationFn: async (action: 'yes' | 'no' | null) => Promise.all(group.map(async (movement) => readJson<Movement>(await fetch(`/api/instructor-movements/${movement.id}/action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_taken: action }),
    })))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (error) => toast({ variant: 'destructive', title: "Couldn't save Action Taken", description: error instanceof Error ? error.message : 'Try again.' }),
  });
  if (!latest) return <div className="text-[12px] text-muted-foreground">—</div>;
  return <div onClick={stopRowClick} className="text-[12px]">
    <select
      value={group.every((movement) => movement.action_taken === latest.action_taken) ? (latest.action_taken ?? '') : ''}
      onChange={(event) => update.mutate(event.target.value === '' ? null : (event.target.value as 'yes' | 'no'))}
      disabled={update.isPending}
      data-testid={`select-action-taken-${latest.instructor_id}`}
      title={latest.action_taken && latest.action_at ? `Marked ${actionLabel(latest.action_taken)}${latest.action_by ? ` by ${latest.action_by}` : ''} on ${formatWhen(latest.action_at)}` : 'Not actioned yet'}
      className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-[11px] font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:opacity-60"
    >
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </div>;
}
