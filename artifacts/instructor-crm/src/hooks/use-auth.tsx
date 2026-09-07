import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetCurrentUser,
  useLogout as useLogoutMutation,
  getGetCurrentUserQueryKey,
  type AppUser,
} from '@workspace/api-client-react';

type AuthContextValue = {
  user: AppUser | null;
  isLoading: boolean;
  logout: () => void;
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // 401 is the expected "not logged in yet" response — don't retry it, and
  // don't let react-query's default retry/backoff delay the redirect to
  // /login.
  const { data, isLoading } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false, staleTime: 60_000 },
  });

  const logoutMutation = useLogoutMutation({
    mutation: {
      onSettled: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      },
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isLoading,
      logout: () => logoutMutation.mutate(),
      isLoggingOut: logoutMutation.isPending,
    }),
    [data, isLoading, logoutMutation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export const ROLE_LABELS: Record<AppUser['role'], string> = {
  admin: 'Admin',
  manager: 'Manager',
};
