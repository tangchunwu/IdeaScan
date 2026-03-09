import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawChat, type ToolCallInfo } from "@/hooks/useOpenClawChat";
import { useOpenClawConnections } from "@/hooks/useOpenClawConnections";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Loader2, StopCircle, Bot, User, Plus,
  Pencil, Image, Search, Lightbulb, Wrench, ImageOff, ZoomIn, RefreshCw,
  Check, ChevronDown, Server, Copy, CheckCheck,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface OpenClawChannelProps {
  className?: string;
  initialMessage?: string;
  sessionId?: string;
  onNewSession?: () => void;
  historyToggle?: React.ReactNode;
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

/* ─── Tool Status Badge (color-coded, with argument preview) ─── */
function ToolStatusBadge({ tool }: { tool: ToolCallInfo }) {
  const label = TOOL_LABELS[tool.name] || tool.name;
  const isDone = tool.status === "done";

  // Extract a short preview from arguments
  let argPreview = "";
  try {
    const args = JSON.parse(tool.arguments || "{}");
    const preview = args.query || args.filename || args.file || args.prompt || args.keyword || args.url;
    if (preview && typeof preview === "string") {
      argPreview = preview.length > 24 ? preview.slice(0, 22) + "…" : preview;
    }
  } catch { /* ignore */ }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-300 ${
      isDone
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
        : "bg-primary/10 text-primary border-primary/20 animate-pulse"
    }`}>
      {isDone ? (
        <Check className="w-3 h-3" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin" />
      )}
      <span>{label}</span>
      {argPreview && (
        <span className="text-[10px] opacity-60 max-w-[120px] truncate">· {argPreview}</span>
      )}
    </span>
  );
}

/* ─── Code Block with Copy Button ─── */
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeText = String(children).replace(/\n$/, "");
  const language = className?.replace("language-", "") || "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeText]);

  return (
    <div className="relative group my-2 rounded-xl overflow-hidden border border-border/40 bg-muted/30">
      {language && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border/30 text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
          <span>{language}</span>
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-background/80 border border-border/30 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/80 z-10"
        title="复制代码"
      >
        {copied ? (
          <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className={className}>{codeText}</code>
      </pre>
    </div>
  );
}

/** Convert bare image URLs to markdown image syntax */
const IMAGE_URL_RE = /^(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|svg|bmp|tiff?)(?:\?\S*)?)$/gim;
const IMAGE_SERVICE_RE = /^(https?:\/\/\S*(?:\/(?:image|img|pic|photo|media|upload|generate|render|cdn)\S*))$/gim;
const DATA_URI_RE = /^(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)$/gm;
const INCOMPLETE_IMG_RE = /!\[[^\]]*\]\([^)]*$/;

function preprocessImageUrls(content: string): string {
  return content
    .replace(IMAGE_URL_RE, '![]($1)')
    .replace(IMAGE_SERVICE_RE, (match, url) => {
      if (/!\[.*\]\(/.test(match)) return match;
      return `![](${url})`;
    })
    .replace(DATA_URI_RE, '![]($1)');
}

function stripIncompleteImages(content: string): string {
  const match = content.match(INCOMPLETE_IMG_RE);
  if (match) return content.slice(0, match.index);
  return content;
}

const ChatImage = React.forwardRef<HTMLDivElement, { src?: string; alt?: string }>(
  function ChatImage({ src, alt }, ref) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState(false);

  if (error || !src) {
    return (
      <div ref={ref} className="flex flex-col items-center justify-center w-full h-32 rounded-xl bg-muted/30 border border-border/20 gap-2">
        <ImageOff className="w-6 h-6 text-muted-foreground/40" />
        {src && (
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs text-primary/70 hover:text-primary underline truncate max-w-[80%]">
            打开原始链接
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      <div ref={ref} className="relative group cursor-pointer inline-block" onClick={() => setPreview(true)}>
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
});

const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => <ChatImage src={src} alt={alt} />,
  code: ({ children, className, ...props }: any) => {
    const isInline = !className && typeof children === "string" && !children.includes("\n");
    if (isInline) {
      return <code className="px-1.5 py-0.5 rounded-md bg-muted/50 text-primary text-xs font-mono border border-border/20" {...props}>{children}</code>;
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  pre: ({ children }: any) => <>{children}</>,
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-2 rounded-lg border border-border/30">
      <table className="min-w-full text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="px-3 py-2 bg-muted/40 text-left font-semibold text-foreground/80 border-b border-border/30">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="px-3 py-1.5 border-b border-border/20 text-foreground/70">{children}</td>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>
  ),
};

function formatTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function renderMessageContent(content: string, isStreaming = false) {
  let processed = preprocessImageUrls(content);
  if (isStreaming) processed = stripIncompleteImages(processed);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 [&_img+img]:mt-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{processed}</ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom rounded-full" />
      )}
    </div>
  );
}

export function OpenClawChannel({ className, initialMessage, sessionId: externalSessionId, onNewSession, historyToggle }: OpenClawChannelProps) {
  const { user } = useAuth();
  const { connections } = useOpenClawConnections(user?.id);
  const [internalSessionId, setInternalSessionId] = useState(() => `session-${Date.now()}`);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | undefined>();
  const sessionId = externalSessionId || internalSessionId;
  const [input, setInput] = useState("");
  const [initialSent, setInitialSent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const defaultConnection = connections.find(c => c.is_default) || connections[0];
  const activeConnectionId = selectedConnectionId || defaultConnection?.id;
  const activeConnection = connections.find(c => c.id === activeConnectionId);

  const { messages, loading, sending, streamingContent, activeTools, sendMessage, abort, retryFromError } = useOpenClawChat(
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
    if (onNewSession) {
      onNewSession();
    } else {
      setInternalSessionId(`session-${Date.now()}`);
    }
    setInitialSent(false);
  };

  const handleQuickPrompt = (prompt: string) => {
    if (sending) return;
    sendMessage(prompt);
  };

  const getUserInitial = () => {
    if (!user?.email) return "U";
    return user.email[0].toUpperCase();
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
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Bot className="w-8 h-8 text-primary/60" />
        </div>
        <p className="text-sm font-medium text-foreground">尚未配置 OpenClaw 连接</p>
        <p className="text-xs text-muted-foreground/70">请在「设置」Tab 中添加你的 AI Agent 服务器地址</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header - Refined */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 backdrop-blur-sm bg-background/80">
        <div className="flex items-center gap-2">
          {historyToggle}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">
              {activeConnection?.name || "OpenClaw"}
            </span>
            <span className="text-[10px] text-muted-foreground/60">AI Agent</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connections.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border/40 bg-muted/20 hover:bg-muted/40">
                  <Server className="w-3 h-3 text-muted-foreground" />
                  {activeConnection?.name || "选择连接"}
                  <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                {connections.map(c => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => setSelectedConnectionId(c.id)}
                    className="text-xs gap-2 cursor-pointer"
                  >
                    <Server className="w-3 h-3 text-muted-foreground/60" />
                    <span className="flex-1">{c.name}</span>
                    {c.id === activeConnectionId && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-xs gap-1.5 hover:bg-muted/50 transition-all hover:scale-105" 
            onClick={handleNewSession}
          >
            <Plus className="w-3.5 h-3.5" /> 新对话
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="relative">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <div className="absolute inset-0 w-6 h-6 rounded-full bg-primary/20 animate-ping" />
            </div>
          </div>
        )}

        {!loading && messages.length === 0 && !streamingContent && !initialMessage && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-transparent flex items-center justify-center shadow-lg">
                <Bot className="w-10 h-10 text-primary" />
              </div>
              <div className="absolute -inset-1 bg-gradient-to-br from-primary/20 to-transparent rounded-2xl blur-xl -z-10 animate-pulse" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground mb-1">AI Agent 已就绪</p>
              <p className="text-sm text-muted-foreground/70">选择快捷指令或直接下达任务</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 max-w-md w-full">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => handleQuickPrompt(qp.prompt)}
                  className="group flex flex-col items-start gap-2 px-4 py-3.5 rounded-xl border border-border/40 bg-gradient-to-br from-muted/30 to-muted/10 hover:from-muted/50 hover:to-muted/20 hover:border-primary/30 transition-all duration-300 text-left hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
                    <qp.icon className="w-4 h-4 text-primary/80 group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-xs font-medium text-foreground/90 group-hover:text-foreground transition-colors">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
            {msg.role === "assistant" && (
              <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <Bot className="w-4 h-4 text-primary" />
                {sending && messages[messages.length - 1]?.id === msg.id && (
                  <div className="absolute inset-0 rounded-xl bg-primary/20 animate-pulse" />
                )}
              </div>
            )}
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
              msg.role === "user"
                ? "bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground rounded-br-md shadow-primary/20"
                : "glass-card border border-border/30 rounded-bl-md backdrop-blur-md"
            }`}>
              {msg.role === "assistant" ? (
                <div className="space-y-2.5">
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.tool_calls.map(tc => <ToolStatusBadge key={tc.id} tool={tc} />)}
                    </div>
                  )}
                  {msg.content && renderMessageContent(msg.content)}
                  {msg.is_error && msg.retry_prompt && (
                    <button
                      onClick={() => retryFromError(msg.id)}
                      disabled={sending}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/30 transition-all disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重试
                    </button>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">
                  {msg.content.length > 300 ? `${msg.content.slice(0, 200)}...\n\n[完整上下文已发送给 Agent]` : msg.content}
                </p>
              )}
              {msg.image_url && (
                <img src={msg.image_url} alt="uploaded" className="mt-2.5 rounded-xl max-h-40 object-contain shadow-md" />
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-secondary/30 to-secondary/10 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <span className="text-xs font-semibold text-secondary-foreground">{getUserInitial()}</span>
              </div>
            )}
          </div>
        ))}

        {/* Streaming + active tool indicators */}
        {(streamingContent || (sending && activeTools.length > 0)) && (
          <div className="flex gap-3 justify-start animate-fade-in">
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <Bot className="w-4 h-4 text-primary" />
              <div className="absolute inset-0 rounded-xl bg-primary/20 animate-pulse" />
            </div>
            <div className="max-w-[75%] rounded-2xl rounded-bl-md px-4 py-3 text-sm glass-card border border-border/30 backdrop-blur-md shadow-sm">
              {activeTools.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {activeTools.map(tc => <ToolStatusBadge key={tc.id} tool={tc} />)}
                </div>
              )}
              {streamingContent && renderMessageContent(streamingContent, true)}
            </div>
          </div>
        )}

        {sending && !streamingContent && activeTools.length === 0 && (
          <div className="flex gap-3 justify-start animate-fade-in">
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 shadow-sm">
              <Bot className="w-4 h-4 text-primary" />
              <div className="absolute inset-0 rounded-xl bg-primary/20 animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-bl-md px-5 py-3.5 glass-card border border-border/30 backdrop-blur-md shadow-sm">
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1.4s' }} />
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '200ms', animationDuration: '1.4s' }} />
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '400ms', animationDuration: '1.4s' }} />
                </div>
                <span className="text-xs text-muted-foreground/70 ml-1">AI 正在思考</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input - Modernized */}
      <div className="px-4 py-4 border-t border-border/30 backdrop-blur-sm bg-background/80">
        <div className="flex gap-2.5 items-end">
          <div className="flex-1 relative">
            <Textarea
              placeholder="输入任务指令... (Shift+Enter 换行)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[44px] max-h-[120px] text-sm glass-card border-border/40 rounded-2xl resize-none pr-3 pl-4 py-3 backdrop-blur-md focus:border-primary/50 transition-all shadow-sm"
              rows={1}
            />
          </div>
          {sending ? (
            <Button 
              variant="ghost" 
              size="sm" 
              className="shrink-0 h-11 w-11 p-0 rounded-xl hover:bg-destructive/10 transition-all hover:scale-105" 
              onClick={abort}
            >
              <StopCircle className="w-5 h-5 text-destructive" />
            </Button>
          ) : (
            <Button 
              size="sm" 
              className="shrink-0 h-11 w-11 p-0 rounded-xl bg-gradient-to-br from-primary to-primary/80 hover:from-primary hover:to-primary shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100" 
              onClick={handleSend} 
              disabled={!input.trim()}
            >
              <Send className="w-4.5 h-4.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
