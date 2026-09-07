import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { LockKeyhole, Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useLogin, getGetCurrentUserQueryKey, type ApiError } from '@workspace/api-client-react';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Already signed in (e.g. typed /login directly) — bounce back to the app.
  useEffect(() => {
    if (user) setLocation('/');
  }, [user, setLocation]);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (user) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
        setLocation('/');
      },
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    loginMutation.mutate({ data: { email, password } });
  };

  const errorMessage =
    loginMutation.isError ? ((loginMutation.error as ApiError)?.message ?? 'Something went wrong. Try again.') : null;

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Database size={21} strokeWidth={2.4} />
          </span>
          <div className="text-center">
            <p className="text-[15px] font-extrabold tracking-[-0.02em]">Faculty Command Center</p>
            <p className="font-mono-ui mt-0.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Instructor Department</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4" data-testid="form-login">
              <div>
                <h1 className="text-[15px] font-bold">Sign in</h1>
                <p className="mt-1 text-[12px] text-muted-foreground">Use the account you were given access with.</p>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  data-testid="input-email"
                  placeholder="name@nxtwave.co.in"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-ring/25"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold">Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  data-testid="input-password"
                  placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-ring/25"
                />
              </label>

              {errorMessage && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] font-medium text-destructive" data-testid="text-login-error">
                  {errorMessage}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-sign-in">
                <LockKeyhole size={15} />
                {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
