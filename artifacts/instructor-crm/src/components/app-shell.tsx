import { useState } from 'react';
import { Bell, ChevronRight, Database, LayoutDashboard, Menu, UploadCloud, UsersRound, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/instructors', label: 'Instructors', icon: UsersRound },
  { href: '/uploads', label: 'Source uploads', icon: UploadCloud },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[76px] items-center justify-between border-b border-sidebar-border px-6">
          <Link href="/" data-testid="link-brand" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Database size={19} strokeWidth={2.4} />
            </span>
            <span>
              <span className="block text-[14px] font-extrabold tracking-[-0.02em]">Instructor Dept</span>
              <span className="font-mono-ui mt-0.5 block text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/55">Operations CRM</span>
            </span>
          </Link>
          <button type="button" aria-label="Close navigation" data-testid="button-close-navigation" onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-7">
          <p className="font-mono-ui mb-3 px-3 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Workspace</p>
          <nav className="space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? location === '/' : location.startsWith(href);
              return (
                <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
                  <Icon size={17} strokeWidth={active ? 2.4 : 2} />
                  <span>{label}</span>
                  {active && <ChevronRight size={14} className="ml-auto" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/55">Data pulse</span>
              <span className="h-2 w-2 rounded-full bg-[#70d2a2] shadow-[0_0_0_3px_rgba(112,210,162,.12)]" />
            </div>
            <p className="text-[12px] leading-5 text-sidebar-foreground/70">All source systems are reporting normally.</p>
            <p className="font-mono-ui mt-3 text-[10px] text-sidebar-foreground/40">LAST CHECK · 09:42 IST</p>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border px-2 pt-4">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#d4e1ee] text-[11px] font-extrabold text-[#263d58]">AS</div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-bold">Aarav Shah</p>
              <p className="font-mono-ui truncate text-[10px] text-sidebar-foreground/45">OPS ADMIN</p>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && <button type="button" aria-label="Close navigation overlay" data-testid="button-navigation-overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[#142238]/45 md:hidden" />}

      <div className="md:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Open navigation" data-testid="button-open-navigation" onClick={() => setMobileOpen(true)} className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-foreground md:hidden">
              <Menu size={18} />
            </button>
            <div className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex">
              <span>Instructor Department</span><ChevronRight size={13} /><span className="font-semibold text-foreground">{location === '/' ? 'Overview' : location.startsWith('/uploads') ? 'Source uploads' : 'Instructors'}</span>
            </div>
            <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:hidden">ID / OPS</span>
          </div>
          <div className="relative flex items-center gap-2">
            <button type="button" aria-label="Show notifications" data-testid="button-notifications" onClick={() => setNotificationsOpen((value) => !value)} className={`relative rounded-lg p-2.5 transition-colors hover:bg-secondary ${notificationsOpen ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}>
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#d45e47]" />
            </button>
            {notificationsOpen && <div className="absolute right-0 top-12 z-30 w-72 rounded-xl border border-border bg-card p-4 shadow-lg animate-rise">
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Attention queue</p>
              <p className="mt-2 text-[13px] font-semibold">4 records need reconciliation</p>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Open the instructor register to review the current exceptions.</p>
              <Link href="/instructors" data-testid="link-notification-instructors" onClick={() => setNotificationsOpen(false)} className="mt-3 inline-flex text-[12px] font-bold text-primary hover:underline">Review queue <ChevronRight size={14} /></Link>
            </div>}
            <div className="ml-2 hidden h-8 w-px bg-border sm:block" />
            <button type="button" data-testid="button-profile" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-secondary">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d4e1ee] text-[11px] font-extrabold text-[#263d58]">AS</span>
              <span className="hidden sm:block"><span className="block text-[12px] font-bold leading-4">Aarav Shah</span><span className="font-mono-ui block text-[9px] text-muted-foreground">OPS ADMIN</span></span>
            </button>
          </div>
        </header>
        <main className="min-h-[calc(100dvh-76px)] px-5 py-7 sm:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}