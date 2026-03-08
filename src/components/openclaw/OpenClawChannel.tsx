import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawChat } from "@/hooks/useOpenClawChat";
import { useOpenClawConnections } from "@/hooks/useOpenClawConnections";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, StopCircle, Bot, User, Plus, FileText, Lightbulb, BarChart3 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface OpenClawChannelProps {
  className?: string;
  initialMessage?: string;
}

const QUICK_PROMPTS = [
  { icon: FileText, label: "写小红书文案", prompt: "请帮我写一篇适合小红书发布的种草文案，标题要有吸引力带 emoji，正文包含痛点引入、解决方案、使用体验。" },
  { icon: BarChart3, label: "分析竞品差异", prompt: "请帮我分析竞品差异化策略，找出产品可以切入的差异化角度，给出定位建议和卖点提炼。" },
  { icon: Lightbulb, label: "头脑风暴变体", prompt: "请帮我基于当前创意进行头脑风暴，提出 3-5 个产品变体方向，说明切入角度和目标人群。" },
];

export function OpenClawChannel({ className, initialMessage }: OpenClawChannelProps) {
  const { user } = useAuth();
  const { connections } = useOpenClawConnections(user?.id);
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [initialSent, setInitialSent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const defaultConnection = connections.find(c => c.is_default) || connections[0];
  const activeConnectionId = selectedConnectionId || defaultConnection?.id;

  const { messages, loading, sending, streamingContent, sendMessage, abort } = useOpenClawChat(
    user?.id, sessionId, activeConnectionId
  );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Auto-send initial message
  useEffect(() => {
    if (initialMessage && !initialSent && activeConnectionId && !loading && !sending && connections.length > 0) {
      setInitialSent(true);
      // Small delay to ensure connection is ready
      const timer = setTimeout(() => {
        sendMessage(initialMessage);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialMessage, initialSent, activeConnectionId, loading, sending, connections.length]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewSession = () => {
    setSessionId(`session-${Date.now()}`);
    setInitialSent(false);
  };

  const handleQuickPrompt = (prompt: string) => {
    if (sending) return;
    sendMessage(prompt);
  };

  if (!user) {
    return (
      <div className={`flex items-center justify-center h-full text-muted-foreground text-sm ${className}`}>
        请先登录以使用 AI 对话
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-full gap-3 text-center px-6 ${className}`}>
        <Bot className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">尚未配置 OpenClaw 连接</p>
        <p className="text-xs text-muted-foreground/60">请在「设置」Tab 中添加你的 AI Agent 服务器地址</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">OpenClaw</span>
          {connections.length > 1 && (
            <select
              className="text-xs bg-transparent border border-border/30 rounded px-1.5 py-0.5 text-muted-foreground"
              value={activeConnectionId || ""}
              onChange={e => setSelectedConnectionId(e.target.value || undefined)}
            >
              {connections.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.is_default ? " (默认)" : ""}</option>
              ))}
            </select>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleNewSession}>
          <Plus className="w-3 h-3" /> 新对话
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && messages.length === 0 && !streamingContent && !initialMessage && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <Bot className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground/60">开始和你的 AI Agent 对话吧</p>
            {/* Quick prompt cards */}
            <div className="flex flex-wrap justify-center gap-2 mt-2 max-w-md">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => handleQuickPrompt(qp.prompt)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors text-xs text-muted-foreground hover:text-foreground"
                >
                  <qp.icon className="w-3.5 h-3.5 text-primary/70" />
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted/30 border border-border/20 rounded-bl-md"
            }`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-code:text-primary prose-code:bg-muted/40 prose-code:px-1 prose-code:rounded">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content.length > 300 ? `${msg.content.slice(0, 200)}...\n\n[完整上下文已发送给 Agent]` : msg.content}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-secondary-foreground" />
              </div>
            )}
          </div>
        ))}

        {/* Streaming */}
        {streamingContent && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm bg-muted/30 border border-border/20">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{streamingContent}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {sending && !streamingContent && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-muted/30 border border-border/20">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border/30">
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="输入消息... (Shift+Enter 换行)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-[120px] text-sm bg-muted/10 border-border/30 rounded-xl resize-none"
            rows={1}
          />
          {sending ? (
            <Button variant="ghost" size="sm" className="shrink-0 h-10 w-10 p-0 rounded-xl" onClick={abort}>
              <StopCircle className="w-5 h-5 text-destructive" />
            </Button>
          ) : (
            <Button size="sm" className="shrink-0 h-10 w-10 p-0 rounded-xl" onClick={handleSend} disabled={!input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
