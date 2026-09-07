import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Database, Eye, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { chooseManagerView } from '@/hooks/use-view-mode';

// The entry screen shown whenever the app is opened without an existing
// Admin session and without "Manager view" already chosen for this tab (see
// App.tsx's Guard + hooks/use-view-mode.ts) -- 2026-09: Manager has no
// login of its own anymore, so this replaces what used to be an automatic
// redirect straight to /login for every unauthenticated visit.
export default function AccessChoicePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Already signed in as Admin -- skip straight past the chooser.
  useEffect(() => {
    if (user) setLocation('/');
  }, [user, setLocation]);

  const continueAsManager = () => {
    chooseManagerView();
    setLocation('/');
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <div className="w-full max-w-[640px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Database size={21} strokeWidth={2.4} />
          </span>
          <div className="text-center">
            <p className="text-[15px] font-extrabold tracking-[-0.02em]">Faculty Command Center</p>
            <p className="font-mono-ui mt-0.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Instructor Department</p>
          </div>
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-[15px] font-bold">How are you accessing this?</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">Pick one -- you can switch to Admin later from within Manager view.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex h-full flex-col p-6">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#e1eaf1] text-primary"><ShieldCheck size={19} /></span>
              <h2 className="mt-4 text-[14px] font-bold">Admin</h2>
              <p className="mt-1.5 flex-1 text-[12px] leading-5 text-muted-foreground">Sign in with your email and password for full access -- every tab, plus adding and editing instructor records.</p>
              <button
                type="button"
                data-testid="button-access-admin"
                onClick={() => setLocation('/login')}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                Sign in as Admin <ArrowRight size={14} />
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex h-full flex-col p-6">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-foreground"><Eye size={19} /></span>
              <h2 className="mt-4 text-[14px] font-bold">Manager</h2>
              <p className="mt-1.5 flex-1 text-[12px] leading-5 text-muted-foreground">View the Overview and Instructors tabs straight away -- no account needed. Read-only; no sign-in required.</p>
              <button
                type="button"
                data-testid="button-access-manager"
                onClick={continueAsManager}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary"
              >
                Continue as Manager <ArrowRight size={14} />
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
