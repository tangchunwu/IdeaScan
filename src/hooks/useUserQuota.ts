import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { supabase } from "@/integrations/supabase/client";

interface QuotaResult {
  can_use: boolean;
  used: number;
  total: number;
}

export function useUserQuota() {
  const { user } = useAuth();
  const settings = useSettings();
  const needsTikhubQuota = !settings.tikhubToken && settings.enableTikhubFallback;

  const { data: quota, isLoading, refetch } = useQuery({
    queryKey: ['user-quota', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('check_tikhub_quota', {
        p_user_id: user!.id
      });
      
      if (error) {
        console.error('Failed to check quota:', error);
        return null;
      }
      
      // RPC returns an array with one row
      return (data as QuotaResult[])?.[0] || null;
    },
    enabled: !!user && needsTikhubQuota,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // User has their own TikHub Token = unlimited usage
  const hasOwnTikhub = !!settings.tikhubToken;
  const bypassQuota = hasOwnTikhub || !settings.enableTikhubFallback;

  return {
    freeRemaining: bypassQuota ? Infinity : Math.max(0, (quota?.total || 3) - (quota?.used || 0)),
    freeUsed: quota?.used || 0,
    freeTotal: quota?.total || 3,
    canValidate: bypassQuota || (quota?.can_use ?? true),
    hasOwnTikhub,
    isLoading: isLoading && !!user,
    refetch,
  };
}
