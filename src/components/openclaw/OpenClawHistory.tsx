import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawSessions } from "@/hooks/useOpenClawSessions";
import { MessageSquare, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface OpenClawHistoryProps {
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onSessionDeleted?: (deletedSessionId: string) => void;
}

export function OpenClawHistory({ currentSessionId, onSelectSession, onSessionDeleted }: OpenClawHistoryProps) {
  const { user } = useAuth();
  const { sessions, loading, deleteSession } = useOpenClawSessions(user?.id);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSession(deleteTarget);
      if (deleteTarget === currentSessionId) {
        onSessionDeleted?.(deleteTarget);
      }
      toast.success("会话已删除");
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

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
    <>
      <ScrollArea className="h-full">
        <div className="space-y-0.5 p-1.5">
          {sessions.map((s) => {
            const isActive = s.session_id === currentSessionId;
            return (
              <div
                key={s.session_id}
                className={`group relative rounded-lg transition-all duration-150 overflow-hidden ${
                  isActive ? "bg-primary/10 shadow-sm" : "hover:bg-muted/50"
                }`}
              >
                <button
                  onClick={() => onSelectSession(s.session_id)}
                  className="w-full text-left px-3 py-2 pr-8"
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
                {/* Delete button - visible on hover */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(s.session_id); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                  title="删除会话"
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-destructive transition-colors" />
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除会话？</AlertDialogTitle>
            <AlertDialogDescription>
              该会话的所有消息将被永久删除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
