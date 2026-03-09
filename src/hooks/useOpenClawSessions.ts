import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OpenClawSession {
  session_id: string;
  last_message: string;
  last_at: string;
  message_count: number;
}

export function useOpenClawSessions(userId: string | undefined) {
  const [sessions, setSessions] = useState<OpenClawSession[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) { setSessions([]); return; }
    setLoading(true);
    try {
      // Get all messages grouped by session_id, ordered by latest first
      const { data } = await supabase
        .from('openclaw_messages' as any)
        .select('session_id, content, created_at, role')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!data) { setSessions([]); return; }

      const map = new Map<string, OpenClawSession>();
      for (const row of data as any[]) {
        const sid = row.session_id as string;
        if (!map.has(sid)) {
          // First row per session is the latest message (desc order)
          const preview = row.role === 'user' ? row.content : row.content;
          map.set(sid, {
            session_id: sid,
            last_message: (preview || '').slice(0, 80),
            last_at: row.created_at,
            message_count: 1,
          });
        } else {
          map.get(sid)!.message_count++;
        }
      }

      setSessions(Array.from(map.values()));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { sessions, loading, refresh };
}
