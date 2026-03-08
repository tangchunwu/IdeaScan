import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useReferral() {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [usesCount, setUsesCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch or create referral code
  const fetchCode = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("referral_codes")
        .select("code, uses_count")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCode(data.code);
        setUsesCount(data.uses_count);
      } else {
        // Generate new code
        const newCode = `IS-${user.id.slice(0, 4).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const { error: insertErr } = await supabase
          .from("referral_codes")
          .insert({ user_id: user.id, code: newCode });
        if (insertErr) throw insertErr;
        setCode(newCode);
        setUsesCount(0);
      }
    } catch (e) {
      console.error("Referral code error:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  const redeemCode = useCallback(async (inputCode: string) => {
    if (!user) return { success: false, error: "not_logged_in" };
    try {
      const { data, error } = await supabase.rpc("redeem_referral", {
        p_code: inputCode,
        p_user_id: user.id,
      });
      if (error) throw error;
      const result = data as any;
      return result;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }, [user]);

  const shareUrl = code ? `${window.location.origin}/auth?ref=${code}` : null;

  return { code, usesCount, loading, shareUrl, redeemCode, refetch: fetchCode };
}
