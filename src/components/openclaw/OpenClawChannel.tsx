import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawChat, type ToolCallInfo } from "@/hooks/useOpenClawChat";
import { useOpenClawConnections } from "@/hooks/useOpenClawConnections";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Loader2, StopCircle, Bot, User, Plus,
  Pencil, Image, Search, Lightbulb, Wrench, ImageOff, ZoomIn,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface OpenClawChannelProps {
  className?: string;
  initialMessage?: string;
}

const TOOL_LABELS: Record<string, string> = {
  file_write: "写入文件",
  file_read: "读取文件",
  image_generate: "生成图片",
  web_search: "联网搜索",
  xiaohongshu_publish: "发布小红书",
  xiaohongshu_search: "搜索小红书",
};

const QUICK_PROMPTS = [
  {
    icon: Pencil,
    label: "一键发小红书",
    prompt: "请完成完整的小红书发布流程：1) 写一篇种草文案 2) 生成配图 3) 发布到小红书。请依次使用你的工具完成，每步告诉我进度。",
  },
  {
    icon: Image,
    label: "生成营销图",
    prompt: "请为我的产品生成一组适合小红书/朋友圈的营销配图，风格现代简洁。使用你的图片生成工具。",
  },
  {
    icon: Search,
    label: "竞品深度调研",
    prompt: "请联网搜索我的竞品信息，分析差异化机会，输出调研报告并保存到 workspace/competitor-report.md。",
  },
  {
    icon: Lightbulb,
    label: "头脑风暴",
    prompt: "请头脑风暴 5 个产品变体方向，评估可行性，将结果保存为 workspace/ideas.md。",
  },
];

function ToolStatusBadge({ tool }: { tool: ToolCallInfo }) {
  const label = TOOL_LABELS[tool.name] || tool.name;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
      {tool.status === "calling" ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Wrench className="w-3 h-3" />
      )}
      {label}
      {tool.status === "calling" && "..."}
    </span>
  );
}

/** Convert bare image URLs to markdown image syntax */
// Match image URLs with extensions OR common image service path patterns
const IMAGE_URL_RE = /^(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|svg|bmp|tiff?)(?:\?\S*)?)$/gim;
const IMAGE_SERVICE_RE = /^(https?:\/\/\S*(?:\/(?:image|img|pic|photo|media|upload|generate|render|cdn)\S*))$/gim;
const DATA_URI_RE = /^(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)$/gm;
const INCOMPLETE_IMG_RE = /!\[[^\]]*\]\([^)]*$/;

function preprocessImageUrls(content: string): string {
  return content
    .replace(IMAGE_URL_RE, '![]($1)')
    .replace(DATA_URI_RE, '![]($1)');
}

function stripIncompleteImages(content: string): string {
  const match = content.match(INCOMPLETE_IMG_RE);
  if (match) return content.slice(0, match.index);
  return content;
}

function ChatImage({ src, alt }: { src?: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState(false);

  if (error || !src) {
    return (
      <div className="flex items-center justify-center w-full h-32 rounded-xl bg-muted/30 border border-border/20">
        <ImageOff className="w-6 h-6 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <>
      <div className="relative group cursor-pointer inline-block" onClick={() => setPreview(true)}>
        {!loaded && <Skeleton className="absolute inset-0 rounded-xl" />}
        <img
          src={src}
          alt={alt || ""}
          className={`rounded-xl max-h-72 max-w-full object-contain shadow-sm border border-border/10 transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
        {loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 rounded-xl transition-colors">
            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
          </div>
        )}
      </div>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 bg-background/95 backdrop-blur-sm">
          <img src={src} alt={alt || ""} className="w-full h-full object-contain rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  );
}

const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => <ChatImage src={src} alt={alt} />,
};

function renderMessageContent(content: string, isStreaming = false) {
  let processed = preprocessImageUrls(content);
  if (isStreaming) processed = stripIncompleteImages(processed);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-code:text-primary prose-code:bg-muted/40 prose-code:px-1 prose-code:rounded [&_img+img]:mt-2">
      <ReactMarkdown components={markdownComponents}>{processed}</ReactMarkdown>
    </div>
  );
}

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

  const { messages, loading, sending, streamingContent, activeTools, sendMessage, abort } = useOpenClawChat(
    user?.id, sessionId, activeConnectionId
  );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, activeTools]);

  // Auto-send initial message
  useEffect(() => {
    if (initialMessage && !initialSent && activeConnectionId && !loading && !sending && connections.length > 0) {
      setInitialSent(true);
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
            <p className="text-sm text-muted-foreground/60">你的 AI Agent 已就绪，可以直接下达任务指令</p>
            <div className="grid grid-cols-2 gap-2 mt-2 max-w-sm w-full">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => handleQuickPrompt(qp.prompt)}
                  className="flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <qp.icon className="w-3.5 h-3.5 text-primary/70" />
                    <span className="text-xs font-medium text-foreground">{qp.label}</span>
                  </div>
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
                <div className="space-y-2">
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.tool_calls.map(tc => <ToolStatusBadge key={tc.id} tool={tc} />)}
                    </div>
                  )}
                  {msg.content && renderMessageContent(msg.content)}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">
                  {msg.content.length > 300 ? `${msg.content.slice(0, 200)}...\n\n[完整上下文已发送给 Agent]` : msg.content}
                </p>
              )}
              {msg.image_url && (
                <img src={msg.image_url} alt="uploaded" className="mt-2 rounded-lg max-h-40 object-contain" />
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-secondary-foreground" />
              </div>
            )}
          </div>
        ))}

        {/* Streaming + active tool indicators */}
        {(streamingContent || (sending && activeTools.length > 0)) && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm bg-muted/30 border border-border/20">
              {activeTools.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {activeTools.map(tc => <ToolStatusBadge key={tc.id} tool={tc} />)}
                </div>
              )}
              {streamingContent && renderMessageContent(streamingContent, true)}
            </div>
          </div>
        )}

        {sending && !streamingContent && activeTools.length === 0 && (
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
            placeholder="输入任务指令... (Shift+Enter 换行)"
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
