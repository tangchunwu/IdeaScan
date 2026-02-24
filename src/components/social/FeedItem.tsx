import { useState, forwardRef } from "react";
import { Heart, MessageCircle, ChevronDown, ChevronUp, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonaAvatar } from "./PersonaAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getRoleLabel } from "./roleUtils";
import type { Comment } from "@/types/social";

interface FeedItemProps {
  comment: Comment;
  onReply?: (commentId: string, content: string) => Promise<void>;
  onLike?: (commentId: string) => Promise<void>;
  likedIds?: Set<string>;
  replyingToId?: string | null;
  depth?: number;
}

export const FeedItem = forwardRef<HTMLDivElement, FeedItemProps>(function FeedItem({
  comment,
  onReply,
  onLike,
  likedIds = new Set(),
  replyingToId,
  depth = 0,
}, ref) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  const persona = comment.persona;
  const replies = comment.replies || [];
  const hasReplies = replies.length > 0;
  const liked = likedIds.has(comment.id);
  const isWaitingForAI = replyingToId === comment.id;

  const handleSubmitReply = async () => {
    if (!replyContent.trim() || !onReply) return;
    setIsSubmitting(true);
    try {
      await onReply(comment.id, replyContent);
      setReplyContent("");
      setShowReplyInput(false);
    } catch (e) {
      console.error("Reply failed:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLike = async () => {
    if (!onLike) return;
    try { await onLike(comment.id); } catch (e) { console.error("Like failed:", e); }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  return (
    <div className={cn("group", depth > 0 && "ml-12 mt-3 pl-4 border-l-2 border-white/10")}>
      <div className="flex gap-3">
        {comment.is_ai && persona ? (
          <PersonaAvatar name={persona.name} avatarUrl={persona.avatar_url} role={persona.role} size="md" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">我</div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-foreground">{comment.is_ai && persona ? persona.name : "我"}</span>
            {comment.is_ai && persona && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {getRoleLabel(persona.role, persona.name)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{timeAgo(comment.created_at)}</span>
          </div>

          <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">{comment.content}</p>

          <div className="flex items-center gap-4 mt-2">
            <button onClick={handleLike} className={cn("flex items-center gap-1 text-xs transition-colors", liked ? "text-red-500" : "text-muted-foreground hover:text-red-500")}>
              <Heart className={cn("w-4 h-4", liked && "fill-current")} />
              <span>{(comment.likes_count || 0) + (liked && !comment.user_has_liked ? 1 : 0)}</span>
            </button>

            {comment.is_ai && onReply && (
              <button onClick={() => setShowReplyInput(!showReplyInput)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                <MessageCircle className="w-4 h-4" /><span>回复</span>
              </button>
            )}

            {hasReplies && (
              <button onClick={() => setShowReplies(!showReplies)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showReplies ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span>{replies.length} 条回复</span>
              </button>
            )}
          </div>

          {isWaitingForAI && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{persona?.name || "AI"} 正在思考...</span>
            </div>
          )}

          {showReplyInput && (
            <div className="mt-3 flex gap-2">
              <Textarea
                placeholder={`回复 ${persona?.name || 'AI'}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[60px] text-sm resize-none"
                disabled={isSubmitting}
              />
              <Button size="sm" onClick={handleSubmitReply} disabled={!replyContent.trim() || isSubmitting} className="self-end">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          )}
        </div>
      </div>

      {showReplies && hasReplies && (
        <div className="mt-2">
          {replies.map((reply) => (
            <FeedItem key={reply.id} comment={reply} onReply={onReply} onLike={onLike} likedIds={likedIds} replyingToId={replyingToId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});
