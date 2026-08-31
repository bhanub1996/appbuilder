import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { api, setAccessToken } from "../api/client";

type User = { id: string; email: string; role: string };

type AuthValue = {
  user: User | null;
  signIn: (email: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = sessionStorage.getItem("user");
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const signIn = useCallback(async (email: string) => {
    const res = await api.login(email);
    setAccessToken(res.access_token);
    sessionStorage.setItem("user", JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const signOut = useCallback(() => {
    setAccessToken(null);
    sessionStorage.removeItem("user");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, signIn, signOut }),
    [user, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
