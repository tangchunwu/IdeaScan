import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "admin_gate_token";

export const useAdminGate = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem(STORAGE_KEY);
    setIsUnlocked(!!token);
    setIsChecking(false);
  }, []);

  const verify = useCallback(async (password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-gate-verify", {
        body: { password },
      });

      if (error) return { ok: false, error: "验证失败" };

      if (data?.ok && data?.token) {
        sessionStorage.setItem(STORAGE_KEY, data.token);
        setIsUnlocked(true);
        return { ok: true };
      }

      return { ok: false, error: data?.error || "密码错误" };
    } catch {
      return { ok: false, error: "网络错误" };
    }
  }, []);

  const lock = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setIsUnlocked(false);
  }, []);

  return { isUnlocked, isChecking, verify, lock };
};
