import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawSessions } from "@/hooks/useOpenClawSessions";
import { MessageSquare, Loader2, MessageCircle, Trash2, Pencil, Check, X, Pin, PinOff } from "lucide-react";
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

const PINNED_KEY = "openclaw_pinned_sessions";

function getPinnedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function savePinnedIds(ids: Set<string>) {
  localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]));
}

export function OpenClawHistory({ currentSessionId, onSelectSession, onSessionDeleted }: OpenClawHistoryProps) {
  const { user } = useAuth();
  const { sessions, loading, deleteSession, renameSession } = useOpenClawSessions(user?.id);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(getPinnedIds);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renameTarget) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [renameTarget]);

  const togglePin = useCallback((sessionId: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
        toast.success("已取消置顶");
      } else {
        next.add(sessionId);
        toast.success("已置顶");
      }
      savePinnedIds(next);
      return next;
    });
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSession(deleteTarget);
      // Also unpin if pinned
      setPinnedIds(prev => {
        const next = new Set(prev);
        next.delete(deleteTarget);
        savePinnedIds(next);
        return next;
      });
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

  const startRename = (sessionId: string, currentTitle: string) => {
    setRenameTarget(sessionId);
    setRenameValue(currentTitle);
  };

  const confirmRename = async () => {
    if (!renameTarget || !renameValue.trim()) {
      setRenameTarget(null);
      return;
    }
    try {
      await renameSession(renameTarget, renameValue.trim());
      toast.success("已重命名");
    } catch {
      toast.error("重命名失败");
    } finally {
      setRenameTarget(null);
    }
  };

  const cancelRename = () => {
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); confirmRename(); }
    else if (e.key === "Escape") { cancelRename(); }
  };

  // Sort: pinned first, then by date
  const sortedSessions = [...sessions].sort((a, b) => {
    const aPinned = pinnedIds.has(a.session_id);
    const bPinned = pinnedIds.has(b.session_id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return new Date(b.last_at).getTime() - new Date(a.last_at).getTime();
  });

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
      <div className="space-y-0.5 p-1.5">
          {sortedSessions.map((s) => {
            const isActive = s.session_id === currentSessionId;
            const isRenaming = renameTarget === s.session_id;
            const isPinned = pinnedIds.has(s.session_id);

            return (
              <div
                key={s.session_id}
                className={`group relative rounded-lg transition-all duration-150 ${
                  isActive ? "bg-primary/10 shadow-sm" : "hover:bg-muted/50"
                }`}
              >
                <button
                  onClick={() => !isRenaming && onSelectSession(s.session_id)}
                  className="w-full text-left px-3 py-2 pr-20"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <MessageCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                      isActive ? "text-primary" : "text-muted-foreground/40"
                    }`} />
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={handleRenameKeyDown}
                            onBlur={confirmRename}
                            className="w-full text-[13px] leading-tight bg-background border border-primary/40 rounded-md px-1.5 py-0.5 outline-none focus:border-primary transition-colors"
                            maxLength={60}
                          />
                          <button
                            onMouseDown={e => { e.preventDefault(); confirmRename(); }}
                            className="p-0.5 rounded hover:bg-primary/10 transition-colors shrink-0"
                          >
                            <Check className="w-3.5 h-3.5 text-primary" />
                          </button>
                          <button
                            onMouseDown={e => { e.preventDefault(); cancelRename(); }}
                            className="p-0.5 rounded hover:bg-destructive/10 transition-colors shrink-0"
                          >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      ) : (
                        <p className={`text-[13px] leading-tight truncate ${
                          isActive ? "text-primary font-medium" : "text-foreground/80"
                        }`}>
                          {isPinned && <Pin className="w-3 h-3 inline-block mr-1 text-primary/60 -mt-0.5" />}
                          {s.title}
                        </p>
                      )}
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
                {/* Action buttons - visible on hover */}
                {!isRenaming && (
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(s.session_id); }}
                      className="p-1.5 rounded-md hover:bg-primary/10 transition-all"
                      title={isPinned ? "取消置顶" : "置顶"}
                    >
                      {isPinned
                        ? <PinOff className="w-3.5 h-3.5 text-primary/60 hover:text-primary transition-colors" />
                        : <Pin className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-primary transition-colors" />
                      }
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(s.session_id, s.title); }}
                      className="p-1.5 rounded-md hover:bg-primary/10 transition-all"
                      title="重命名"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-primary transition-colors" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(s.session_id); }}
                      className="p-1.5 rounded-md hover:bg-destructive/10 transition-all"
                      title="删除会话"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-destructive transition-colors" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
