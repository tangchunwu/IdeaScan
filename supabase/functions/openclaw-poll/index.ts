import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { connection_id, token } = await req.json();
    if (!connection_id || !token) {
      return new Response(JSON.stringify({ error: 'connection_id and token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify connection ownership and token
    const { data: conn, error: connErr } = await serviceClient
      .from('openclaw_connections')
      .select('id, user_id, token, mode')
      .eq('id', connection_id)
      .single();

    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conn.token !== token) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conn.mode !== 'relay') {
      return new Response(JSON.stringify({ error: 'Connection is not in relay mode' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch pending messages for this connection
    const { data: pendingMessages, error: msgErr } = await serviceClient
      .from('openclaw_messages')
      .select('id, session_id, role, content, metadata, created_at')
      .eq('connection_id', connection_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (msgErr) {
      console.error('[openclaw-poll] query error:', msgErr);
      return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update last_synced_at to track bridge online status
    await serviceClient
      .from('openclaw_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection_id);

    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(JSON.stringify({ messages: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark as processing
    const pendingIds = pendingMessages.map((m: any) => m.id);
    await serviceClient
      .from('openclaw_messages')
      .update({ status: 'processing' })
      .in('id', pendingIds);

    // For each unique session, fetch history for context
    const sessionIds = [...new Set(pendingMessages.map((m: any) => m.session_id))];
    const sessionsContext: Record<string, any[]> = {};

    for (const sid of sessionIds) {
      const { data: history } = await serviceClient
        .from('openclaw_messages')
        .select('role, content')
        .eq('user_id', conn.user_id)
        .eq('session_id', sid)
        .eq('status', 'delivered')
        .order('created_at', { ascending: true })
        .limit(20);
      sessionsContext[sid] = history || [];
    }

    return new Response(JSON.stringify({
      messages: pendingMessages,
      context: sessionsContext,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[openclaw-poll] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
