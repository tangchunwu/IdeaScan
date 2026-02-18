import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { identifyUser, resetUser } from "@/lib/posthog";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const invalidAuthPattern = /invalid jwt|jwt.*expired|expired.*jwt|invalid or expired session|auth session missing|refresh token|authentication required/i;

const isInvalidAuthError = (errorLike: unknown) => {
  if (!errorLike || typeof errorLike !== "object") return false;
  const e = errorLike as Record<string, unknown>;
  const status = Number(e.status ?? e.code ?? 0);
  const message = String(e.message ?? e.error_description ?? e.error ?? "").toLowerCase();
  return status === 401 || invalidAuthPattern.test(message);
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySignedOutState = () => {
    setSession(null);
    setUser(null);
    resetUser();
  };

  const validateAndApplySession = async (incoming: Session | null) => {
    if (!incoming) {
      applySignedOutState();
      return;
    }

    let activeSession: Session | null = incoming;
    let userResult = await supabase.auth.getUser(incoming.access_token);

    if (userResult.error || !userResult.data.user) {
      const refreshFn = (supabase.auth as any).refreshSession;
      if (typeof refreshFn === "function") {
        const refreshed = await refreshFn.call(supabase.auth);
        const refreshedSession = (refreshed as any)?.data?.session as Session | null | undefined;
        if (!refreshed?.error && refreshedSession?.access_token) {
          activeSession = refreshedSession;
          userResult = await supabase.auth.getUser(refreshedSession.access_token);
        }
      }
    }

    if (userResult.error || !userResult.data.user) {
      if (isInvalidAuthError(userResult.error)) {
        // Token确实失效才清理本地登录态，避免网络抖动导致误登出
        await supabase.auth.signOut({ scope: "local" });
        applySignedOutState();
        return;
      }

      if (incoming.user) {
        setSession(incoming);
        setUser(incoming.user);
        identifyUser(incoming.user.id, {
          email: incoming.user.email,
          created_at: incoming.user.created_at,
        });
        return;
      }

      applySignedOutState();
      return;
    }

    setSession(activeSession);
    setUser(userResult.data.user);
    identifyUser(userResult.data.user.id, {
      email: userResult.data.user.email,
      created_at: userResult.data.user.created_at,
    });
  };

  useEffect(() => {
    // 设置 auth 状态监听器
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          applySignedOutState();
          setIsLoading(false);
          return;
        }

        // Validate token before treating it as logged-in.
        validateAndApplySession(session).finally(() => setIsLoading(false));
      }
    );

    // 获取初始 session
    supabase.auth.getSession()
      .then(({ data: { session } }) => validateAndApplySession(session))
      .finally(() => setIsLoading(false));

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    applySignedOutState();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
