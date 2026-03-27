import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OpenClawConnection {
  id: string;
  user_id: string;
  name: string;
  url: string;
  token: string | null;
  mode: 'direct' | 'relay';
  is_default: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useOpenClawConnections(userId: string | undefined) {
  const [connections, setConnections] = useState<OpenClawConnection[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setConnections([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('openclaw_connections' as any)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setConnections((data as any[]) || []);
    } catch (e) {
      console.error('Load connections error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const addConnection = useCallback(async (name: string, url: string, token: string) => {
    if (!userId) return;
    const isFirst = connections.length === 0;
    const { error } = await supabase
      .from('openclaw_connections' as any)
      .insert({ user_id: userId, name, url, token: token || null, is_default: isFirst } as any);
    if (error) { toast.error('添加失败'); throw error; }
    toast.success('连接已添加');
    await load();
  }, [userId, connections.length, load]);

  const updateConnection = useCallback(async (id: string, updates: Partial<Pick<OpenClawConnection, 'name' | 'url' | 'token'>>) => {
    const { error } = await supabase
      .from('openclaw_connections' as any)
      .update(updates as any)
      .eq('id', id);
    if (error) { toast.error('更新失败'); throw error; }
    toast.success('已更新');
    await load();
  }, [load]);

  const deleteConnection = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('openclaw_connections' as any)
      .delete()
      .eq('id', id);
    if (error) { toast.error('删除失败'); throw error; }
    toast.success('连接已删除');
    await load();
  }, [load]);

  const setDefault = useCallback(async (id: string) => {
    if (!userId) return;
    await supabase.from('openclaw_connections' as any).update({ is_default: false } as any).eq('user_id', userId);
    await supabase.from('openclaw_connections' as any).update({ is_default: true } as any).eq('id', id);
    toast.success('已设为默认');
    await load();
  }, [userId, load]);

  const syncToOpenClaw = useCallback(async (connectionId?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-user-to-openclaw', {
        body: connectionId ? { connection_id: connectionId } : {},
      });
      if (error) { toast.error(`同步失败: ${error.message}`); return; }
      const results = data?.results || [];
      const successes = results.filter((r: any) => r.success);
      const failures = results.filter((r: any) => !r.success);
      if (successes.length > 0) toast.success(`已同步 ${successes.length} 个连接`);
      if (failures.length > 0) toast.error(`${failures.length} 个连接同步失败`);
      await load();
    } catch (e: any) {
      toast.error(`同步失败: ${e.message || '未知错误'}`);
    }
  }, [load]);

  return { connections, loading, addConnection, updateConnection, deleteConnection, setDefault, syncToOpenClaw, reload: load };
}
