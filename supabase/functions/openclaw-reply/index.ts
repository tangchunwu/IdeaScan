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
    const { connection_id, token, message_id, session_id, content, streaming, done } = await req.json();
    if (!connection_id || !token) {
      return new Response(JSON.stringify({ error: 'connection_id and token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify connection
    const { data: conn, error: connErr } = await serviceClient
      .from('openclaw_connections')
      .select('id, user_id, token, mode')
      .eq('id', connection_id)
      .single();

    if (connErr || !conn || conn.token !== token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conn.mode !== 'relay') {
      return new Response(JSON.stringify({ error: 'Connection is not in relay mode' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If streaming mode: update existing message content incrementally
    if (streaming && message_id) {
      if (done) {
        // Final update: mark as delivered
        await serviceClient
          .from('openclaw_messages')
          .update({ content, status: 'delivered' })
          .eq('id', message_id)
          .eq('connection_id', connection_id);
      } else {
        // Incremental update: keep status as processing
        await serviceClient
          .from('openclaw_messages')
          .update({ content, status: 'processing' })
          .eq('id', message_id)
          .eq('connection_id', connection_id);
      }

      return new Response(JSON.stringify({ ok: true, message_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Non-streaming: create a new assistant message
    if (!session_id || !content) {
      return new Response(JSON.stringify({ error: 'session_id and content required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark the original user message(s) as delivered
    if (message_id) {
      await serviceClient
        .from('openclaw_messages')
        .update({ status: 'delivered' })
        .eq('id', message_id)
        .eq('connection_id', connection_id);
    }

    // Insert assistant reply
    const { data: inserted, error: insertErr } = await serviceClient
      .from('openclaw_messages')
      .insert({
        user_id: conn.user_id,
        session_id,
        role: 'assistant',
        content,
        connection_id,
        status: 'delivered',
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[openclaw-reply] insert error:', insertErr);
      return new Response(JSON.stringify({ error: 'Failed to save reply' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, message_id: inserted.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[openclaw-reply] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
