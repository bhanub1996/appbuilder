import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, setAccessToken, type AuthUser } from "@/lib/api";

type AuthValue = {
  user: AuthUser | null;
  ready: boolean;
  signIn: (email: string) => Promise<AuthUser>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Read after mount so server and first client render agree.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw) as AuthUser);
    } catch {
      /* ignore malformed session */
    }
    setReady(true);
  }, []);

  const signIn = useCallback(async (email: string) => {
    const res = await api.login(email);
    setAccessToken(res.access_token);
    sessionStorage.setItem("user", JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  }, []);

  const signOut = useCallback(() => {
    setAccessToken(null);
    sessionStorage.removeItem("user");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signOut }),
    [user, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
