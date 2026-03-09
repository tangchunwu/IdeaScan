import { useAuth } from "@/hooks/useAuth";
import { useOpenClawSessions } from "@/hooks/useOpenClawSessions";
import { MessageSquare, Clock, Loader2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OpenClawHistoryProps {
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
}

export function OpenClawHistory({ currentSessionId, onSelectSession }: OpenClawHistoryProps) {
  const { user } = useAuth();
  const { sessions, loading } = useOpenClawSessions(user?.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
        <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm text-muted-foreground/70">暂无对话记录</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 p-1.5">
        {sessions.map((s) => {
          const isActive = s.session_id === currentSessionId;
          return (
            <button
              key={s.session_id}
              onClick={() => onSelectSession(s.session_id)}
              className={`w-full text-left rounded-lg px-3 py-2 transition-all duration-150 group overflow-hidden ${
                isActive
                  ? "bg-primary/10 shadow-sm"
                  : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <MessageCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                  isActive ? "text-primary" : "text-muted-foreground/40"
                }`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] leading-tight truncate ${
                    isActive ? "text-primary font-medium" : "text-foreground/80"
                  }`}>
                    {s.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-muted-foreground/50">
                      {formatDistanceToNow(new Date(s.last_at), { addSuffix: true, locale: zhCN })}
                    </span>
                    <span className="text-[10px] text-muted-foreground/30">·</span>
                    <span className="text-[10px] text-muted-foreground/40">
                      {s.message_count} 条
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
