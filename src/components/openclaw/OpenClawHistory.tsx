import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawSessions, type OpenClawSession } from "@/hooks/useOpenClawSessions";
import { MessageSquare, Clock, Loader2 } from "lucide-react";
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
      <div className="space-y-1 p-2">
        {sessions.map((s) => (
          <button
            key={s.session_id}
            onClick={() => onSelectSession(s.session_id)}
            className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 group ${
              s.session_id === currentSessionId
                ? "bg-primary/10 border border-primary/20"
                : "hover:bg-muted/40 border border-transparent"
            }`}
          >
            <p className={`text-sm truncate leading-snug ${
              s.session_id === currentSessionId ? "text-primary font-medium" : "text-foreground/90"
            }`}>
              {s.last_message || "新对话"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/60">
                {formatDistanceToNow(new Date(s.last_at), { addSuffix: true, locale: zhCN })}
              </span>
              <span className="text-[10px] text-muted-foreground/40">
                · {s.message_count} 条
              </span>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
