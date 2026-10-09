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
import { History, Plus } from 'lucide-react';
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

export const MOVEMENT_TYPES: { value: string; label: string }[] = [
  { value: 'cm_change', label: 'CM change' },
  { value: 'external_move', label: 'Externally Move' },
  { value: 'dsa_team', label: 'DSA team' },
  { value: 'product_move', label: 'Product Move' },
  { value: 'deployment_yes', label: 'Deployment - Yes' },
  { value: 'deployment_no', label: 'Deployment - No' },
];
export const movementLabel = (value: string) => MOVEMENT_TYPES.find((type) => type.value === value)?.label ?? value;
export const actionLabel = (value: string | null | undefined) => (value === 'yes' ? 'Yes' : value === 'no' ? 'No' : '');

const QUERY_KEY = ['instructor-movements'];
const NAME_STORAGE_KEY = 'fcc-movement-name';

const readStoredName = () => {
  try { return window.localStorage.getItem(NAME_STORAGE_KEY) ?? ''; } catch { return ''; }
};
const storeName = (name: string) => {
  try { window.localStorage.setItem(NAME_STORAGE_KEY, name); } catch { /* private window: the name just isn't remembered */ }
};

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

const stopRowClick = (event: React.SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); };

export function MovementCell({ instructorId, fullName, movements }: { instructorId: number; fullName: string; movements: Movement[] }) {
  const [open, setOpen] = useState(false);
  const latest = movements[0];
  return <div onClick={stopRowClick} onKeyDown={(event) => event.stopPropagation()} className="min-w-0 text-[12px]">
    <div className="flex items-center gap-2">
      {latest
        ? <div className="min-w-0 flex-1" title={`${movementLabel(latest.movement_type)}: ${latest.remark} -- logged by ${latest.requested_by} on ${formatWhen(latest.requested_at)}`}>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.05em] ${TYPE_TONES[latest.movement_type] ?? 'bg-secondary text-muted-foreground'}`}>{movementLabel(latest.movement_type)}</span>
          <div className="truncate text-muted-foreground">{latest.remark}</div>
        </div>
        : <span className="flex-1 text-muted-foreground">—</span>}
      <button type="button" onClick={() => setOpen(true)} data-testid={`button-movement-${instructorId}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-bold text-foreground transition-colors hover:bg-secondary" title={latest ? 'Log another movement or see the history' : 'Log a movement'}>
        {latest ? <><History size={12} />{movements.length > 1 ? movements.length : ''}</> : <Plus size={12} />}
      </button>
    </div>
    <MovementDialog open={open} onOpenChange={setOpen} instructorId={instructorId} fullName={fullName} movements={movements} />
  </div>;
}

function MovementDialog({ open, onOpenChange, instructorId, fullName, movements }: { open: boolean; onOpenChange: (open: boolean) => void; instructorId: number; fullName: string; movements: Movement[] }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState('cm_change');
  const [remark, setRemark] = useState('');
  const [name, setName] = useState(readStoredName);
  const log = useMutation({
    mutationFn: async () => readJson<Movement>(await fetch(`/api/instructors/${instructorId}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movement_type: type, remark, requested_by: name }),
    })),
    onSuccess: () => {
      storeName(name.trim());
      setRemark('');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Movement logged', description: `${movementLabel(type)} recorded for ${fullName}.` });
    },
    onError: (error) => toast({ variant: 'destructive', title: "Couldn't log the movement", description: error instanceof Error ? error.message : 'Try again.' }),
  });
  const inputClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25';
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]" onClick={stopRowClick}>
      <DialogHeader>
        <DialogTitle>Movement tracker — {fullName}</DialogTitle>
        <DialogDescription>Log a change for this instructor. The action owner marks it done in the Action Taken column.</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); log.mutate(); }}>
        <label className="block text-[12px] font-bold">Movement
          <select value={type} onChange={(event) => setType(event.target.value)} data-testid="select-movement-type" className={`${inputClass} mt-1`}>
            {MOVEMENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-[12px] font-bold">Remark
          <textarea value={remark} onChange={(event) => setRemark(event.target.value)} rows={3} maxLength={1000} data-testid="input-movement-remark" placeholder={type === 'cm_change' ? 'Which Capability Manager should this instructor move to?' : 'What is changing, and to what?'} className={`${inputClass} mt-1 resize-y`} />
        </label>
        <label className="block text-[12px] font-bold">Your name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} data-testid="input-movement-name" placeholder="So the log shows who raised it" className={`${inputClass} mt-1`} />
        </label>
        <div className="flex justify-end">
          <button type="submit" disabled={log.isPending || !remark.trim() || !name.trim()} data-testid="button-submit-movement" className="rounded-lg bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{log.isPending ? 'Saving…' : 'Log movement'}</button>
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

// Action Taken applies to the LATEST movement: blank until someone actions it, then Yes or No.
export function ActionTakenCell({ movements }: { movements: Movement[] }) {
  const queryClient = useQueryClient();
  const latest = movements[0];
  const update = useMutation({
    mutationFn: async (action: 'yes' | 'no' | null) => readJson<Movement>(await fetch(`/api/instructor-movements/${latest.id}/action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_taken: action, action_by: readStoredName() || null }),
    })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (error) => toast({ variant: 'destructive', title: "Couldn't save Action Taken", description: error instanceof Error ? error.message : 'Try again.' }),
  });
  if (!latest) return <div className="text-[12px] text-muted-foreground">—</div>;
  return <div onClick={stopRowClick} className="text-[12px]">
    <select
      value={latest.action_taken ?? ''}
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
