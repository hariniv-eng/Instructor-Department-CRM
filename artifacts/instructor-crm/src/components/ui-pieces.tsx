import { AlertTriangle, Check, CircleCheck, LoaderCircle } from 'lucide-react';

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
    <div>
      <p className="font-mono-ui mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <h1 className="text-[28px] font-extrabold tracking-[-0.045em] text-foreground sm:text-[34px]">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">{description}</p>}
    </div>
    {action}
  </div>;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-secondary ${className}`} />;
}

export function QueryError({ message = 'We could not load this view.' }: { message?: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-[#e8b4aa] bg-[#fff6f3] p-8 text-center">
    <span className="grid h-10 w-10 place-items-center rounded-full bg-[#f8ded7] text-[#a94334]"><AlertTriangle size={18} /></span>
    <p className="mt-3 text-[14px] font-bold text-[#71342b]">{message}</p>
    <p className="mt-1 text-[12px] text-[#9b6258]">Try refreshing or check the source connection.</p>
  </div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-8 text-center">
    <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-muted-foreground"><CircleCheck size={18} /></span>
    <p className="mt-3 text-[14px] font-bold">{title}</p>
    <p className="mt-1 max-w-sm text-[12px] leading-5 text-muted-foreground">{description}</p>
  </div>;
}

export function SaveButton({ pending, children = 'Save changes' }: { pending: boolean; children?: React.ReactNode }) {
  return <button type="submit" disabled={pending} data-testid="button-save-changes" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-70">
    {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{children}
  </button>;
}