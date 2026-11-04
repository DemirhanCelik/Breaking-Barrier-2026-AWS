import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, authMode, type SessionUser } from './api';
import * as cognito from './auth/cognito';

interface SessionValue {
  user: SessionUser | null;
  loading: boolean;
  /** Demo picker (AUTH_MODE=demo / mock). */
  signIn: (userId: string) => Promise<SessionUser>;
  /** Amazon Cognito email + password. */
  signInWithPassword: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (userId: string) => {
    const u = await api.signIn(userId);
    setUser(u);
    return u;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    await cognito.signIn(email, password);
    const u = await api.getSession();
    if (!u) {
      cognito.signOut();
      throw new Error('Signed in, but the API did not accept the session.');
    }
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(async () => {
    if (authMode === 'cognito') cognito.signOut();
    await api.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signInWithPassword, signOut }),
    [user, loading, signIn, signInWithPassword, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
