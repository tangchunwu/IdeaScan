import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Settings decryption (shared with user-settings function) ──

async function deriveKey(userId: string): Promise<CryptoKey> {
  const serverSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const keyMaterial = new TextEncoder().encode(userId + serverSecret);
  const baseKey = await crypto.subtle.importKey('raw', keyMaterial, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('lovable-user-settings-v2'), iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function decryptLegacyXOR(encoded: string, userId: string): string {
  try {
    const key = userId + (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.slice(0, 32) || '');
    const keyBytes = new TextEncoder().encode(key);
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    const result = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    return new TextDecoder().decode(result);
  } catch { return ''; }
}

async function decryptSettings(encoded: string, userId: string): Promise<string> {
  try {
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    if (bytes[0] === 0x02) {
      const ivLength = bytes[1];
      const iv = bytes.slice(2, 2 + ivLength);
      const ciphertext = bytes.slice(2 + ivLength);
      const key = await deriveKey(userId);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return new TextDecoder().decode(decrypted);
    }
    return decryptLegacyXOR(encoded, userId);
  } catch { return ''; }
}

/** Fetch and decrypt user settings, returning image-gen related fields */
async function getImageGenConfig(userId: string): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  try {
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await serviceClient.from('user_settings').select('settings_encrypted').eq('user_id', userId).maybeSingle();
    if (!data?.settings_encrypted) return null;
    const plain = await decryptSettings(data.settings_encrypted, userId);
    if (!plain) return null;
    const settings = JSON.parse(plain);
    if (settings.imageGenBaseUrl && settings.imageGenApiKey && settings.imageGenModel) {
      return { baseUrl: settings.imageGenBaseUrl, apiKey: settings.imageGenApiKey, model: settings.imageGenModel };
    }
    return null;
  } catch (e) {
    console.error('[openclaw-chat] Failed to load image gen config:', e);
    return null;
  }
}

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

    const { message, session_id, image, connection_id, file } = await req.json();
    if (!session_id || (!message && !image && !file)) {
      return new Response(JSON.stringify({ error: 'message, image, or file, and session_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve connection config
    let openclawUrl: string | null = null;
    let openclawToken: string | null = null;
    let resolvedConnectionId: string | null = connection_id || null;
    let connectionMode: string = 'direct';

    if (connection_id) {
      const { data: conn } = await supabase.from('openclaw_connections')
        .select('id, url, token, mode').eq('id', connection_id).eq('user_id', userId).single();
      if (conn) { openclawUrl = conn.url; openclawToken = conn.token; resolvedConnectionId = conn.id; connectionMode = (conn as any).mode || 'direct'; }
    }

    if (!openclawUrl && connectionMode === 'direct') {
      const { data: defaultConn } = await supabase.from('openclaw_connections')
        .select('id, url, token, mode').eq('user_id', userId).eq('is_default', true).limit(1).single();
      if (defaultConn) { openclawUrl = defaultConn.url; openclawToken = defaultConn.token; resolvedConnectionId = defaultConn.id; connectionMode = (defaultConn as any).mode || 'direct'; }
    }

    if (!openclawUrl && connectionMode === 'direct') {
      const { data: anyConn } = await supabase.from('openclaw_connections')
        .select('id, url, token, mode').eq('user_id', userId).limit(1).single();
      if (anyConn) { openclawUrl = anyConn.url; openclawToken = anyConn.token; resolvedConnectionId = anyConn.id; connectionMode = (anyConn as any).mode || 'direct'; }
    }

    if (connectionMode === 'direct' && !openclawUrl) {
      return new Response(JSON.stringify({ error: 'OpenClaw URL not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save user message
    let dbContent = message || '';
    if (image) dbContent += (dbContent ? '\n' : '') + '📷 [图片已发送]';
    if (file) dbContent += (dbContent ? '\n' : '') + `📎 [文件: ${file.name || 'unknown'}]`;
    if (!dbContent) dbContent = '📷 [图片已发送]';

    const messageStatus = connectionMode === 'relay' ? 'pending' : 'delivered';
    await supabase.from('openclaw_messages').insert({
      user_id: userId, session_id, role: 'user', content: dbContent, connection_id: resolvedConnectionId,
      status: messageStatus,
    } as any);

    // ── Relay mode: just queue the message and return ──
    if (connectionMode === 'relay') {
      return new Response(JSON.stringify({ relay: true, connection_id: resolvedConnectionId }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load recent history
    const { data: history } = await supabase.from('openclaw_messages')
      .select('role, content').eq('user_id', userId).eq('session_id', session_id)
      .order('created_at', { ascending: true }).limit(20);

    const systemContent = '你是用户的 AI Agent 助手。';

    const messages: Array<{ role: string; content: unknown }> = [
      { role: 'system', content: systemContent },
    ];
    const historyRows = history || [];
    for (const m of historyRows.slice(0, -1)) {
      messages.push({ role: m.role, content: m.content });
    }

    // Multimodal support
    const userContentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    if (message) userContentParts.push({ type: 'text', text: message });
    if (file) {
      const fileDesc = `[用户上传了文件: ${file.name} (类型: ${file.type})]\n\n文件内容:\n${file.data}`;
      userContentParts.push({ type: 'text', text: fileDesc });
    }
    if (image) {
      userContentParts.push({ type: 'image_url', image_url: { url: image } });
    }

    if (userContentParts.length === 1 && userContentParts[0].type === 'text') {
      messages.push({ role: 'user', content: userContentParts[0].text! });
    } else if (userContentParts.length > 0) {
      messages.push({ role: 'user', content: userContentParts });
    } else {
      messages.push({ role: 'user', content: message || '' });
    }

    // Call OpenClaw (OpenAI-compatible streaming) with timeout
    const TIMEOUT_MS = 120_000; // 120 seconds — image gen can be slow
    const fetchController = new AbortController();
    const timeoutId = setTimeout(() => fetchController.abort(), TIMEOUT_MS);

    let openclawResponse: Response;
    try {
      openclawResponse = await fetch(`${openclawUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(openclawToken ? { Authorization: `Bearer ${openclawToken}` } : {}),
        },
        body: JSON.stringify({ model: 'default', messages, stream: true }),
        signal: fetchController.signal,
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      console.error('[openclaw-chat] fetch error:', fetchErr);
      const errMsg = isTimeout
        ? 'Agent 服务器响应超时（图片生成通常较慢，请稍后重试）'
        : `连接 Agent 失败: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    clearTimeout(timeoutId);

    if (!openclawResponse.ok) {
      const errText = await openclawResponse.text();
      console.error('[openclaw-chat] upstream error:', openclawResponse.status, errText.slice(0, 300));
      const isGatewayTimeout = openclawResponse.status === 524 || openclawResponse.status === 504;
      const userMsg = isGatewayTimeout
        ? 'Agent 服务器网关超时（图片生成耗时较长，请稍等片刻后重试）'
        : `OpenClaw 返回错误 ${openclawResponse.status}`;
      return new Response(JSON.stringify({ error: userMsg }), {
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
