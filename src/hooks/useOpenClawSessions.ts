import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OpenClawSession {
  session_id: string;
  title: string;
  last_at: string;
  message_count: number;
  custom_title?: boolean;
}

export function useOpenClawSessions(userId: string | undefined) {
  const [sessions, setSessions] = useState<OpenClawSession[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) { setSessions([]); return; }
    setLoading(true);
    try {
      // Fetch messages and custom titles in parallel
      const [msgRes, titleRes] = await Promise.all([
        supabase
          .from('openclaw_messages' as any)
          .select('session_id, content, created_at, role')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('openclaw_session_titles' as any)
          .select('session_id, title')
          .eq('user_id', userId),
      ]);

      const data = msgRes.data;
      if (!data) { setSessions([]); return; }

      // Build custom title map
      const titleMap = new Map<string, string>();
      if (titleRes.data) {
        for (const row of titleRes.data as any[]) {
          titleMap.set(row.session_id, row.title);
        }
      }

      const map = new Map<string, { title: string; last_at: string; count: number; custom: boolean }>();
      for (const row of data as any[]) {
        const sid = row.session_id as string;
        const existing = map.get(sid);
        if (!existing) {
          const customTitle = titleMap.get(sid);
          const autoTitle = row.role === 'user'
            ? (row.content || '').replace(/\n/g, ' ').slice(0, 60)
            : '';
          map.set(sid, {
            title: customTitle || autoTitle,
            last_at: row.created_at,
            count: 1,
            custom: !!customTitle,
          });
        } else {
          existing.count++;
          existing.last_at = row.created_at;
          if (!existing.title && !existing.custom && row.role === 'user') {
            existing.title = (row.content || '').replace(/\n/g, ' ').slice(0, 60);
          }
        }
      }

      const result: OpenClawSession[] = Array.from(map.entries())
        .map(([session_id, v]) => ({
          session_id,
          title: v.title || '新对话',
          last_at: v.last_at,
          message_count: v.count,
          custom_title: v.custom,
        }))
        .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

      setSessions(result);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!userId) return;
    await Promise.all([
      supabase
        .from('openclaw_messages' as any)
        .delete()
        .eq('user_id', userId)
        .eq('session_id', sessionId),
      supabase
        .from('openclaw_session_titles' as any)
        .delete()
        .eq('user_id', userId)
        .eq('session_id', sessionId),
    ]);
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
  }, [userId]);

  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    if (!userId) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    // Upsert custom title
    await supabase
      .from('openclaw_session_titles' as any)
      .upsert(
        { user_id: userId, session_id: sessionId, title: trimmed, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,session_id' }
      );

    // Optimistic update
    setSessions(prev => prev.map(s =>
      s.session_id === sessionId ? { ...s, title: trimmed, custom_title: true } : s
    ));
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { sessions, loading, refresh, deleteSession, renameSession };
}
