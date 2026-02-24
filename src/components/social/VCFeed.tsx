import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { FeedItem } from "./FeedItem";
import type { Comment } from "@/types/social";
import { getComments, generateDiscussion, replyToComment, toggleCommentLike, getUserLikes } from "@/services/socialService";
import { useSettings } from "@/hooks/useSettings";

interface VCFeedProps {
  validationId: string;
}

export function VCFeed({ validationId }: VCFeedProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const feedEndRef = useRef<HTMLDivElement>(null);
  const settings = useSettings();

  // Only send custom LLM config if user has configured an API key
  const llmConfig = settings.llmApiKey ? {
    llmBaseUrl: settings.llmBaseUrl || undefined,
    llmApiKey: settings.llmApiKey,
    llmModel: settings.llmModel || undefined,
  } : undefined;

  const buildCommentTree = (flatComments: Comment[]): Comment[] => {
    const commentMap = new Map<string, Comment>();
    const rootComments: Comment[] = [];
    flatComments.forEach(c => { commentMap.set(c.id, { ...c, replies: [] }); });
    flatComments.forEach(c => {
      const comment = commentMap.get(c.id)!;
      if (c.parent_id && commentMap.has(c.parent_id)) {
        commentMap.get(c.parent_id)!.replies!.push(comment);
      } else {
        rootComments.push(comment);
      }
    });
    return rootComments;
  };

  const getAllCommentIds = useCallback((comments: Comment[]): string[] => {
    const ids: string[] = [];
    const collect = (list: Comment[]) => {
      for (const c of list) {
        ids.push(c.id);
        if (c.replies) collect(c.replies);
      }
    };
    collect(comments);
    return ids;
  }, []);

  const loadComments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getComments(validationId);
      const tree = buildCommentTree(data);
      setComments(tree);
      // Load like statuses
      const allIds = data.map(c => c.id);
      const likes = await getUserLikes(allIds);
      setLikedIds(likes);
    } catch (e) {
      console.error("Failed to load comments:", e);
      setError("加载评论失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDiscussion = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await generateDiscussion(validationId, llmConfig);
      await loadComments();
    } catch (e) {
      console.error("Failed to generate discussion:", e);
      setError("生成讨论失败，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReply = async (commentId: string, content: string) => {
    setReplyingTo(commentId);
    try {
      await replyToComment(commentId, content, llmConfig);
      await loadComments();
      // Auto-scroll to bottom
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: "smooth" }), 300);
    } catch (e) {
      console.error("Reply failed:", e);
      throw e;
    } finally {
      setReplyingTo(null);
    }
  };

  const handleLike = async (commentId: string) => {
    try {
      const isLiked = await toggleCommentLike(commentId);
      setLikedIds(prev => {
        const next = new Set(prev);
        if (isLiked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
    } catch (e) {
      console.error("Like failed:", e);
    }
  };

  useEffect(() => {
    loadComments();
  }, [validationId]);

  if (isLoading) {
    return (
      <GlassCard className="p-8">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>加载创投圈讨论...</span>
        </div>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={loadComments}><RefreshCw className="w-4 h-4 mr-2" />重试</Button>
      </GlassCard>
    );
  }

  if (comments.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-amber-500" />
          </div>
          <h3 className="text-xl font-bold">开启 VC Circle 讨论</h3>
          <p className="text-muted-foreground text-sm">
            让 4 位 AI 专家（VC、产品经理、用户、分析师）对你的创意进行激烈讨论。你可以随时加入反驳他们！
          </p>
          <Button onClick={handleGenerateDiscussion} disabled={isGenerating} className="gap-2">
            {isGenerating ? (<><Loader2 className="w-4 h-4 animate-spin" />AI 专家正在思考...</>) : (<><Sparkles className="w-4 h-4" />召唤 AI 专家团</>)}
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">VC Circle</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{comments.length} 条讨论</span>
        </div>
        <Button variant="ghost" size="sm" onClick={loadComments} className="text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-6">
        {comments.map((comment) => (
          <FeedItem
            key={comment.id}
            comment={comment}
            onReply={handleReply}
            onLike={handleLike}
            likedIds={likedIds}
            replyingToId={replyingTo}
          />
        ))}
      </div>
      <div ref={feedEndRef} />
    </GlassCard>
  );
}
