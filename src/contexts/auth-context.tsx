"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser, logout as logoutRequest } from "@/lib/auth/api";
import type { User } from "@/lib/auth/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  serverError: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverError, setServerError] = useState(false);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    const result = await getCurrentUser();
    if (result.data) {
      setUser(result.data);
      setServerError(false);
    } else {
      setUser(null);
      setServerError(result.error?.status === undefined);
    }
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    document.cookie = "userData=; Max-Age=0; Path=/; SameSite=Lax";
  }, []);

  useEffect(() => {
    // The provider must synchronize its initial state with the server session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    const revalidate = () => void refreshUser();
    const onVisible = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    serverError,
    refreshUser,
    logout,
  }), [user, isLoading, serverError, refreshUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
