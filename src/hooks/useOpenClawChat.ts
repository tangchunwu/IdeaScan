import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
  status: 'calling' | 'done';
  startedAt?: number;
  finishedAt?: number;
}

export interface FileAttachment {
  name: string;
  type: string;
  /** base64 data or plain text content */
  data: string;
}

export interface OpenClawMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;
  file_name?: string;
  tool_calls?: ToolCallInfo[];
  created_at: string;
  is_error?: boolean;
  retry_prompt?: string;
}

export function useOpenClawChat(userId: string | undefined, sessionId: string, connectionId?: string) {
  const [messages, setMessages] = useState<OpenClawMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeTools, setActiveTools] = useState<ToolCallInfo[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setSending(false);
    setStreamingContent('');
    setActiveTools([]);
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    if (!userId || !sessionId) { setMessages([]); return () => { active = false; }; }
    setMessages([]);
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('openclaw_messages' as any)
        .select('id, role, content, created_at')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      if (!active) return;
      setMessages(
        ((data as any[]) ?? [])
          .filter((r: any) => r.role === 'user' || r.role === 'assistant')
          .map((r: any) => ({ ...r, role: r.role as 'user' | 'assistant' }))
      );
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId, sessionId]);

  const sendMessage = useCallback(async (content: string, imageBase64?: string, file?: FileAttachment) => {
    if (!userId || (!content.trim() && !imageBase64 && !file) || sending) return;

    let displayContent = content.trim();
    if (imageBase64 && !displayContent) displayContent = '📷 [图片]';
    if (file && !displayContent) displayContent = `📎 ${file.name}`;

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayContent,
      image_url: imageBase64,
      file_name: file?.name,
      created_at: new Date().toISOString(),
    }]);
    setSending(true);
    setStreamingContent('');
    setActiveTools([]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const controller = new AbortController();
      abortRef.current = controller;

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;
      const url = `${SUPABASE_URL}/functions/v1/openclaw-chat`;
      const body: Record<string, any> = {
        message: content.trim() || (imageBase64 ? '请描述这张图片' : '请处理这个文件'),
        session_id: sessionId,
      };
      if (connectionId) body.connection_id = connectionId;
      if (imageBase64) body.image = imageBase64;
      if (file) body.file = { name: file.name, type: file.type, data: file.data };

      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => null as any);
        const message =
          (errPayload && (errPayload.error || errPayload.message)) ||
          res.statusText ||
          `HTTP ${res.status}`;

        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ ${message}`,
          is_error: true,
          retry_prompt: content.trim() || undefined,
          created_at: new Date().toISOString(),
        }]);
        setStreamingContent('');
        setActiveTools([]);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      const toolCallsMap: Record<number, ToolCallInfo> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              const contentDelta = choice.delta?.content;
              if (contentDelta) {
                accumulated += contentDelta;
                setStreamingContent(accumulated);
              }

              const tcDeltas = choice.delta?.tool_calls;
              if (Array.isArray(tcDeltas)) {
                for (const tc of tcDeltas) {
                  const idx = tc.index ?? 0;
                  if (!toolCallsMap[idx]) {
                    toolCallsMap[idx] = {
                      id: tc.id || `tool-${idx}`,
                      name: tc.function?.name || '',
                      arguments: '',
                      status: 'calling',
                      startedAt: Date.now(),
                    };
                  }
                  if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
                  if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
                  setActiveTools(Object.values(toolCallsMap));
                }
              }

              if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
                for (const k of Object.keys(toolCallsMap)) {
                  toolCallsMap[Number(k)].status = 'done';
                  toolCallsMap[Number(k)].finishedAt = Date.now();
                }
                setActiveTools(Object.values(toolCallsMap));
              }
            } catch { /* skip */ }
          }
        }
      }

      const finalToolCalls = Object.values(toolCallsMap);
      if (accumulated.trim() || finalToolCalls.length) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: accumulated.trim(),
          tool_calls: finalToolCalls.length ? finalToolCalls : undefined,
          created_at: new Date().toISOString(),
        }]);
      }
      setStreamingContent('');
      setActiveTools([]);
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ 连接失败: ${err instanceof Error ? err.message : '未知错误'}`,
          is_error: true,
          retry_prompt: content.trim() || undefined,
          created_at: new Date().toISOString(),
        }]);
      }
      setStreamingContent('');
      setActiveTools([]);
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [userId, sessionId, connectionId, sending]);

  const abort = useCallback(() => { abortRef.current?.abort(); }, []);

  const retryFromError = useCallback((errorMessageId: string) => {
    const errorMsg = messages.find(m => m.id === errorMessageId);
    if (!errorMsg?.retry_prompt || sending) return;
    const prompt = errorMsg.retry_prompt;
    setMessages(prev => prev.filter(m => m.id !== errorMessageId));
    setTimeout(() => sendMessage(prompt), 400);
  }, [messages, sending, sendMessage]);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  const retryMessage = useCallback((messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg || sending) return;
    const content = msg.role === 'user' ? msg.content : (msg.retry_prompt || '');
    if (!content) return;
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setTimeout(() => sendMessage(content), 400);
  }, [messages, sending, sendMessage]);

  return { messages, loading, sending, streamingContent, activeTools, sendMessage, abort, retryFromError, deleteMessage, retryMessage };
}
