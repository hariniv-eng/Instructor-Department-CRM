import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppShell } from '@/components/app-shell';
import DashboardPage from '@/pages/dashboard';
import InstructorDetailPage from '@/pages/instructor-detail';
import InstructorsPage from '@/pages/instructors';
import UploadsPage from '@/pages/uploads';
import TeachosBreakdownPage from '@/pages/teachos-breakdown';
import DarwinBreakdownPage from '@/pages/darwin-breakdown';
import LoginPage from '@/pages/login';
import AccessChoicePage from '@/pages/access-choice';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { isManagerViewChosen } from '@/hooks/use-view-mode';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

// Paths that stay Admin-only — Darwin/TeachOS breakdown detail and source
// uploads (see requireAuth+requireRole("admin") on the matching backend
// routes). Overview ("/") and Instructors are what "Manager view" shows.
//
// 2026-09: there's no Manager *login* anymore — the /access chooser sends
// someone either to /login (Admin) or straight into these public paths as
// "Manager view" (isManagerViewChosen(), a per-tab sessionStorage flag set
// by /access — see hooks/use-view-mode.ts). Any actual session user is
// necessarily Admin now, since the backend's /auth/login rejects any other
// role (see api-server/src/routes/auth.ts).
const ADMIN_ONLY_PATHS = ['/darwin-breakdown', '/teachos-breakdown', '/uploads'];

function FullscreenLoader() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Loading…</p>
    </div>
  );
}

// Sends an unauthenticated visit to /login (Admin-only paths) or to the
// /access chooser (everything else, unless Manager view was already chosen
// this tab) — and keeps an Admin-only path out of reach for Manager view
// even if someone types the URL directly.
function Guard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const isAdminOnlyPath = ADMIN_ONLY_PATHS.some((path) => location === path || location.startsWith(`${path}/`));
  const hasManagerView = isManagerViewChosen();

  useEffect(() => {
    if (isLoading || user) return;
    if (isAdminOnlyPath) {
      setLocation('/login');
    } else if (!hasManagerView) {
      setLocation('/access');
    }
  }, [isLoading, user, isAdminOnlyPath, hasManagerView, setLocation]);

  if (isLoading) return <FullscreenLoader />;
  if (!user && (isAdminOnlyPath || !hasManagerView)) return <FullscreenLoader />;

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/access" component={AccessChoicePage} />
      <Route>
        {/* Keep a shared shell (sidebar, navbar) outside the boundary so it
            survives a page crash. */}
        <RoutedErrorBoundary>
          <Guard>
            <AppShell>
              <Switch>
                <Route path="/" component={DashboardPage} />
                <Route path="/instructors" component={InstructorsPage} />
                <Route path="/instructors/:id" component={InstructorDetailPage} />
                <Route path="/teachos-breakdown" component={TeachosBreakdownPage} />
                <Route path="/darwin-breakdown" component={DarwinBreakdownPage} />
                <Route path="/uploads" component={UploadsPage} />
                <Route component={NotFound} />
              </Switch>
            </AppShell>
          </Guard>
        </RoutedErrorBoundary>
      </Route>
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
