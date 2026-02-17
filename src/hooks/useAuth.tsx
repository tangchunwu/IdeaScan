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

    const { data, error } = await supabase.auth.getUser(incoming.access_token);
    if (error || !data.user) {
      // The cached token can become invalid when switching to another Supabase project.
      await supabase.auth.signOut({ scope: "local" });
      applySignedOutState();
      return;
    }

    setSession(incoming);
    setUser(data.user);
    identifyUser(data.user.id, {
      email: data.user.email,
      created_at: data.user.created_at,
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
