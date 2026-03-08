import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    let userId: string | null = null;
    try {
      const { data: claimsData, error: claimsError } = await (supabase.auth as any).getClaims(token);
      if (!claimsError && claimsData?.claims?.sub) userId = claimsData.claims.sub;
    } catch {}
    if (!userId) {
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id || null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { connection_id } = await req.json().catch(() => ({}));

    // Build user context
    const { data: userData } = await supabase.auth.getUser(token);
    const userEmail = userData?.user?.email || 'unknown';
    const userName = userData?.user?.user_metadata?.full_name || userEmail.split('@')[0];

    // Get recent validations for context
    const { data: recentValidations } = await supabase
      .from('validations')
      .select('idea, overall_score, tags, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const validationSummary = (recentValidations || [])
      .map((v: any) => `- ${v.idea} (得分: ${v.overall_score || '待评'}, 标签: ${(v.tags || []).join(', ')})`)
      .join('\n');

    const markdown = `# About My Human

> 此文件由 IdeaScan 系统自动同步
> 最后更新: ${new Date().toISOString()}

## 基本信息
- 用户名: ${userName}
- 邮箱: ${userEmail}

## 最近验证的创业想法
${validationSummary || '暂无验证记录'}

## 使用场景
该用户正在使用 IdeaScan 平台验证创业想法，请基于以上背景信息提供更个性化的回答。
`;

    let query = supabase.from('openclaw_connections').select('id, name, url, token').eq('user_id', userId);
    if (connection_id) query = query.eq('id', connection_id);
    const { data: connections } = await query;

    if (!connections?.length) {
      return new Response(JSON.stringify({ error: '未找到 OpenClaw 连接' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    for (const conn of connections) {
      try {
        const res = await fetch(`${(conn as any).url.replace(/\/$/, '')}/tools/invoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...((conn as any).token ? { Authorization: `Bearer ${(conn as any).token}` } : {}),
          },
          body: JSON.stringify({
            tool: 'file_write',
            args: { path: 'workspace/USER.md', content: markdown, mode: 'overwrite' },
          }),
        });
        if (res.ok) {
          await serviceClient.from('openclaw_connections')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', (conn as any).id);
          results.push({ id: (conn as any).id, name: (conn as any).name, success: true });
        } else {
          const errText = await res.text();
          results.push({ id: (conn as any).id, name: (conn as any).name, success: false, error: `HTTP ${res.status}` });
        }
      } catch (err) {
        results.push({ id: (conn as any).id, name: (conn as any).name, success: false, error: (err as Error).message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sync-user-to-openclaw] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
