import { useState } from "react";
import { TrendingTopic, saveTopicInterest, removeTopicInterest, trackTopicClick } from "@/services/discoverService";
import { GlassCard } from "@/components/shared/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Bookmark,
  BookmarkCheck,
  Zap,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendingTopicCardProps {
  topic: TrendingTopic;
  userInterest?: 'saved' | 'validated' | 'dismissed' | null;
  onInterestChange?: (topicId: string, interest: 'saved' | 'validated' | 'dismissed' | null) => void;
}

export function TrendingTopicCard({ topic, userInterest, onInterestChange }: TrendingTopicCardProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [currentInterest, setCurrentInterest] = useState(userInterest);

  // Calculate heat level for visual styling
  const getHeatLevel = (score: number) => {
    if (score >= 80) return { level: 'hot', color: 'text-red-500', bg: 'bg-red-500/10' };
    if (score >= 60) return { level: 'warm', color: 'text-orange-500', bg: 'bg-orange-500/10' };
    if (score >= 40) return { level: 'rising', color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
    return { level: 'new', color: 'text-blue-500', bg: 'bg-blue-500/10' };
  };

  const heatInfo = getHeatLevel(topic.heat_score);

  // Calculate sentiment ratio
  const totalSentiment = topic.sentiment_positive + topic.sentiment_negative + topic.sentiment_neutral;
  const positiveRatio = totalSentiment > 0 ? Math.round((topic.sentiment_positive / totalSentiment) * 100) : 0;
  const negativeRatio = totalSentiment > 0 ? Math.round((topic.sentiment_negative / totalSentiment) * 100) : 0;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (currentInterest === 'saved') {
        await removeTopicInterest(topic.id);
        setCurrentInterest(null);
        onInterestChange?.(topic.id, null);
        toast({ title: "已取消收藏" });
      } else {
        await saveTopicInterest(topic.id, 'saved');
        setCurrentInterest('saved');
        onInterestChange?.(topic.id, 'saved');
        toast({ title: "已收藏", description: "可在历史记录中查看" });
      }
    } catch (error) {
      toast({
        title: "操作失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidate = async () => {
    // 记录验证点击
    await trackTopicClick(topic.id, topic.keyword, 'validate');
    // Navigate to validate page with pre-filled idea
    navigate(`/validate?idea=${encodeURIComponent(topic.keyword)}`);
  };

  return (
    <GlassCard className="p-5 hover:shadow-lg transition-all duration-300 group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {topic.category && (
              <Badge variant="outline" className="text-xs">
                {topic.category}
              </Badge>
            )}
            <Badge className={cn("text-xs", heatInfo.bg, heatInfo.color, "border-0")}>
              <Flame className="w-3 h-3 mr-1" />
              {topic.heat_score}°
            </Badge>
          </div>
          <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
            {topic.keyword}
          </h3>
        </div>

        {/* Growth indicator */}
        {topic.growth_rate !== null && (
          <div className={cn(
            "flex items-center gap-1 text-sm font-medium",
            topic.growth_rate >= 0 ? "text-green-500" : "text-red-500"
          )}>
            {topic.growth_rate >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            {topic.growth_rate > 0 ? '+' : ''}{topic.growth_rate}%
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <MessageSquare className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-medium">{topic.sample_count}</div>
          <div className="text-xs text-muted-foreground">样本数</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <Zap className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-medium">{topic.avg_engagement.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">互动量</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <div className="flex items-center justify-center gap-1 mb-1">
            <ThumbsUp className="w-3 h-3 text-green-500" />
            <ThumbsDown className="w-3 h-3 text-red-500" />
          </div>
          <div className="text-sm font-medium">{positiveRatio}% / {negativeRatio}%</div>
          <div className="text-xs text-muted-foreground">情感比</div>
        </div>
      </div>

      {/* Pain Points */}
      {topic.top_pain_points.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            核心痛点
          </div>
          <div className="flex flex-wrap gap-1">
            {topic.top_pain_points.slice(0, 3).map((point, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {point}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Related Keywords */}
      {topic.related_keywords.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2">相关关键词</div>
          <div className="flex flex-wrap gap-1">
            {topic.related_keywords.slice(0, 4).map((kw, idx) => (
              <span key={idx} className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                #{kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {topic.sources.length > 0 && (
        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
          数据来源:
          {topic.sources.map((source, idx) => (
            <span key={idx} className="flex items-center gap-1">
              {source.platform === 'xiaohongshu' && '📕小红书'}
              {source.platform === 'douyin' && '🎵抖音'}
              {source.platform === 'weibo' && '📱微博'}
              ({source.count})
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            "flex-1",
            currentInterest === 'saved' && "text-primary"
          )}
        >
          {currentInterest === 'saved' ? (
            <BookmarkCheck className="w-4 h-4 mr-1" />
          ) : (
            <Bookmark className="w-4 h-4 mr-1" />
          )}
          {currentInterest === 'saved' ? '已收藏' : '收藏'}
        </Button>
        <Button
          size="sm"
          onClick={handleValidate}
          className="flex-1 bg-gradient-to-r from-primary to-primary/80"
        >
          立即验证
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </GlassCard>
  );
}
