import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OpenClawSession {
  session_id: string;
  /** First user message as session title */
  title: string;
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
      const { data } = await supabase
        .from('openclaw_messages' as any)
        .select('session_id, content, created_at, role')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (!data) { setSessions([]); return; }

      const map = new Map<string, { title: string; last_at: string; count: number }>();
      for (const row of data as any[]) {
        const sid = row.session_id as string;
        const existing = map.get(sid);
        if (!existing) {
          // Use first user message as title, fallback to any content
          const title = row.role === 'user'
            ? (row.content || '').replace(/\n/g, ' ').slice(0, 60)
            : '';
          map.set(sid, { title, last_at: row.created_at, count: 1 });
        } else {
          existing.count++;
          existing.last_at = row.created_at; // keep updating to latest
          // If title is still empty, try to grab first user message
          if (!existing.title && row.role === 'user') {
            existing.title = (row.content || '').replace(/\n/g, ' ').slice(0, 60);
          }
        }
      }

      // Sort by last_at descending
      const result: OpenClawSession[] = Array.from(map.entries())
        .map(([session_id, v]) => ({
          session_id,
          title: v.title || '新对话',
          last_at: v.last_at,
          message_count: v.count,
        }))
        .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

      setSessions(result);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { sessions, loading, refresh };
}
