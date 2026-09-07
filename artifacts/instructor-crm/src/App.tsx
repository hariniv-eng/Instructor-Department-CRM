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
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

// Paths the "manager" role can't see — Darwin/TeachOS breakdown detail and
// source uploads stay admin-only (see requireRole("admin") on the matching
// backend routes). Overview ("/") and Instructors are open to both roles.
const ADMIN_ONLY_PATHS = ['/darwin-breakdown', '/teachos-breakdown', '/uploads'];

function FullscreenLoader() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Loading…</p>
    </div>
  );
}

// Redirects to /login when unauthenticated, and keeps a "manager" account
// off the admin-only tabs even if they type the URL directly.
function Guard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation('/login');
      return;
    }
    if (user.role === 'manager' && ADMIN_ONLY_PATHS.some((path) => location === path || location.startsWith(`${path}/`))) {
      setLocation('/');
    }
  }, [isLoading, user, location, setLocation]);

  if (isLoading) return <FullscreenLoader />;
  if (!user) return <FullscreenLoader />;

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
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
