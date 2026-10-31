import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { identifyUser, resetUser } from "@/lib/posthog";
import { useSettings } from "@/hooks/useSettings";

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
  const queryClient = useQueryClient();
  const clearSessionSecrets = useSettings((state) => state.clearSensitiveSettings);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestGeneration = useRef(0);
  const activeRequestController = useRef<AbortController | null>(null);

  const applySignedOutState = useCallback(() => {
    requestGeneration.current += 1;
    activeRequestController.current?.abort();
    activeRequestController.current = null;
    queryClient.clear();
    clearSessionSecrets();
    setSession(null);
    setUser(null);
    resetUser();
  }, [queryClient, clearSessionSecrets]);

  useEffect(() => {
    let activeUserId: string | null = null;

    class AuthRequestCancelledError extends Error {
      constructor() {
        super("Auth request cancelled");
        this.name = "AuthRequestCancelledError";
      }
    }

    const cancelActiveRequest = () => {
      requestGeneration.current += 1;
      activeRequestController.current?.abort();
      activeRequestController.current = null;
    };

    const clearPrivateQueryCache = () => {
      // 认证边界变化时清空查询缓存，避免旧账号的私有数据残留。
      queryClient.clear();
    };

    const withCancellation = <T,>(promise: Promise<T>, signal: AbortSignal) => {
      return new Promise<T>((resolve, reject) => {
        const cleanup = () => signal.removeEventListener("abort", onAbort);
        const onAbort = () => {
          cleanup();
          reject(new AuthRequestCancelledError());
        };

        if (signal.aborted) {
          onAbort();
          return;
        }

        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
          (value) => {
            cleanup();
            resolve(value);
          },
          (error) => {
            cleanup();
            reject(error);
          },
        );
      });
    };

    const validateAndApplySession = async (
      incoming: Session | null,
      generation: number,
      signal: AbortSignal,
    ) => {
      const isCurrentRequest = () => requestGeneration.current === generation && !signal.aborted;

      if (!incoming) {
        if (isCurrentRequest()) {
          applySignedOutState();
          setIsLoading(false);
        }
        return;
      }

      let activeSession: Session | null = incoming;
      let userResult = await withCancellation(
        supabase.auth.getUser(incoming.access_token),
        signal,
      );

      if ((userResult.error || !userResult.data.user) && isCurrentRequest()) {
        if (typeof supabase.auth.refreshSession === "function") {
          const refreshed = await withCancellation(supabase.auth.refreshSession(), signal);
          const refreshedSession = refreshed.data.session;
          if (!refreshed?.error && refreshedSession?.access_token) {
            activeSession = refreshedSession;
            userResult = await withCancellation(
              supabase.auth.getUser(refreshedSession.access_token),
              signal,
            );
          }
        }
      }

      if (!isCurrentRequest()) return;

      if (userResult.error || !userResult.data.user) {
        if (isInvalidAuthError(userResult.error)) {
          await supabase.auth.signOut({ scope: "local" });
          if (isCurrentRequest()) applySignedOutState();
          return;
        }

        if (incoming.user) {
          if (activeUserId && activeUserId !== incoming.user.id) {
            clearPrivateQueryCache();
            clearSessionSecrets();
          }
          activeUserId = incoming.user.id;
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

      const authenticatedUser = userResult.data.user;
      if (activeUserId && activeUserId !== authenticatedUser.id) {
        clearPrivateQueryCache();
        clearSessionSecrets();
      }
      activeUserId = authenticatedUser.id;
      setSession(activeSession);
      setUser(authenticatedUser);
      identifyUser(authenticatedUser.id, {
        email: authenticatedUser.email,
        created_at: authenticatedUser.created_at,
      });
    };

    const startSessionValidation = (incoming: Session | null) => {
      cancelActiveRequest();
      const generation = requestGeneration.current;
      const controller = new AbortController();
      activeRequestController.current = controller;

      validateAndApplySession(incoming, generation, controller.signal)
        .catch((error) => {
          if (!(error instanceof AuthRequestCancelledError) && requestGeneration.current === generation) {
            console.error("Failed to validate auth session", error);
          }
        })
        .finally(() => {
          if (requestGeneration.current === generation) {
            activeRequestController.current = null;
            setIsLoading(false);
          }
        });
    };

    // 设置 auth 状态监听器
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          cancelActiveRequest();
          applySignedOutState();
          setIsLoading(false);
          return;
        }

        // Validate token before treating it as logged-in.
        startSessionValidation(session);
      }
    );

    // 获取初始 session
    const initialGeneration = requestGeneration.current;
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (requestGeneration.current === initialGeneration) startSessionValidation(session);
      })
      .catch((error) => {
        if (requestGeneration.current === initialGeneration) {
          console.error("Failed to load auth session", error);
          setIsLoading(false);
        }
      });

    return () => {
      cancelActiveRequest();
      subscription.unsubscribe();
    };
  }, [queryClient, clearSessionSecrets, applySignedOutState]);

  const signOut = async () => {
    applySignedOutState();
    setIsLoading(false);
    await supabase.auth.signOut({ scope: "local" });
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
