import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { message, session_id, image, connection_id } = await req.json();
    if (!session_id || (!message && !image)) {
      return new Response(JSON.stringify({ error: 'message or image, and session_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve connection config
    let openclawUrl: string | null = null;
    let openclawToken: string | null = null;
    let resolvedConnectionId: string | null = connection_id || null;

    if (connection_id) {
      const { data: conn } = await supabase.from('openclaw_connections')
        .select('id, url, token').eq('id', connection_id).eq('user_id', userId).single();
      if (conn) { openclawUrl = conn.url; openclawToken = conn.token; resolvedConnectionId = conn.id; }
    }

    if (!openclawUrl) {
      const { data: defaultConn } = await supabase.from('openclaw_connections')
        .select('id, url, token').eq('user_id', userId).eq('is_default', true).limit(1).single();
      if (defaultConn) { openclawUrl = defaultConn.url; openclawToken = defaultConn.token; resolvedConnectionId = defaultConn.id; }
    }

    if (!openclawUrl) {
      const { data: anyConn } = await supabase.from('openclaw_connections')
        .select('id, url, token').eq('user_id', userId).limit(1).single();
      if (anyConn) { openclawUrl = anyConn.url; openclawToken = anyConn.token; resolvedConnectionId = anyConn.id; }
    }

    if (!openclawUrl) {
      return new Response(JSON.stringify({ error: 'OpenClaw URL not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save user message
    const dbContent = image ? (message ? `${message}\n📷 [图片已发送]` : '📷 [图片已发送]') : message;
    await supabase.from('openclaw_messages').insert({
      user_id: userId, session_id, role: 'user', content: dbContent, connection_id: resolvedConnectionId,
    });

    // Load recent history
    const { data: history } = await supabase.from('openclaw_messages')
      .select('role, content').eq('user_id', userId).eq('session_id', session_id)
      .order('created_at', { ascending: true }).limit(20);

    const messages: Array<{ role: string; content: unknown }> = [];
    const historyRows = history || [];
    for (const m of historyRows.slice(0, -1)) {
      messages.push({ role: m.role, content: m.content });
    }

    // Multimodal support
    if (image) {
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      if (message) contentParts.push({ type: 'text', text: message });
      contentParts.push({ type: 'image_url', image_url: { url: image } });
      messages.push({ role: 'user', content: contentParts });
    } else {
      messages.push({ role: 'user', content: message });
    }

    // Call OpenClaw (OpenAI-compatible streaming)
    const openclawResponse = await fetch(`${openclawUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(openclawToken ? { Authorization: `Bearer ${openclawToken}` } : {}),
      },
      body: JSON.stringify({ model: 'default', messages, stream: true }),
    });

    if (!openclawResponse.ok) {
      const errText = await openclawResponse.text();
      console.error('[openclaw-chat] upstream error:', openclawResponse.status, errText);
      return new Response(JSON.stringify({ error: `OpenClaw returned ${openclawResponse.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stream SSE pass-through
    const reader = openclawResponse.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(encoder.encode(chunk));
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) fullContent += delta;
                } catch { /* skip */ }
              }
            }
          }
          if (fullContent.trim()) {
            const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
            await serviceClient.from('openclaw_messages').insert({
              user_id: userId, session_id, role: 'assistant', content: fullContent.trim(), connection_id: resolvedConnectionId,
            });
          }
          controller.close();
        } catch (err) { controller.error(err); }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (err) {
    console.error('[openclaw-chat] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
