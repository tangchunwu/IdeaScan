import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBackground, GlassCard, Navbar, LoadingSpinner, SettingsDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useCreateValidation } from "@/hooks/useValidation";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Search,
  X,
  Plus,
  Lightbulb,
  Target,
  TrendingUp,
  LogIn,
  FileText,
  CheckCircle2
} from "lucide-react";
import { Link } from "react-router-dom";

const suggestedTags = [
  "美妆护肤", "穿搭时尚", "美食探店", "家居生活",
  "母婴育儿", "健身运动", "旅行攻略", "数码科技"
];

const exampleIdeas = [
  "开一家专门做猫咪主题下午茶的咖啡店",
  "设计一款帮助职场人管理时间的APP",
  "做手工皮具定制的网店",
];

const Validate = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [idea, setIdea] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [progress, setProgress] = useState(0);
  const createMutation = useCreateValidation();

  const handleAddTag = (tag: string) => {
    if (!selectedTags.includes(tag) && selectedTags.length < 5) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const handleAddCustomTag = () => {
    if (customTag.trim() && !selectedTags.includes(customTag.trim()) && selectedTags.length < 5) {
      setSelectedTags([...selectedTags, customTag.trim()]);
      setCustomTag("");
    }
  };

  const [progressStage, setProgressStage] = useState<string>("初始化...");

  const handleValidate = async () => {
    if (!idea.trim()) return;

    if (!user) {
      toast({
        title: "请先登录",
        description: "需要登录才能进行验证",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    setIsValidating(true);
    setProgress(5);
    setProgressStage("正在解析创意...");

    try {
      // Simulation of Tikhub + AI stages
      // 1. Search Notes (0-30%)
      const stage1 = setTimeout(() => {
        setProgress(30);
        setProgressStage("正在全网搜索相关笔记 (Tikhub)...");
      }, 1500);

      // 2. Analyze Comments (30-60%)
      const stage2 = setTimeout(() => {
        setProgress(60);
        setProgressStage("正在分析用户评论情感...");
      }, 4500);

      // 3. AI Generation (60-90%)
      const stage3 = setTimeout(() => {
        setProgress(90);
        setProgressStage("正在生成商业分析报告...");
      }, 8000);

      // Actual API Call
      const result = await createMutation.mutateAsync({
        idea: idea.trim(),
        tags: selectedTags,
      });

      // Cleanup simulation timers if response is faster
      clearTimeout(stage1);
      clearTimeout(stage2);
      clearTimeout(stage3);

      setProgress(100);
      setProgressStage("完成！跳转中...");

      toast({
        title: "验证完成！",
        description: `综合评分：${result.overallScore}分`,
      });

      // 跳转到报告页面
      navigate(`/report/${result.validationId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "验证过程中出现错误";
      toast({
        title: "验证失败",
        description: errorMessage,
        variant: "destructive",
      });
      setIsValidating(false);
    }
  };

  // 未登录状态
  if (!authLoading && !user) {
    return (
      <PageBackground>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-lg mx-auto text-center">
            <GlassCard className="animate-fade-in">
              <LogIn className="w-16 h-16 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-4">
                登录后开始验证
              </h2>
              <p className="text-muted-foreground mb-6">
                登录或注册账号，即可使用创意验证功能
              </p>
              <Button asChild size="lg" className="rounded-xl">
                <Link to="/auth">
                  立即登录
                </Link>
              </Button>
            </GlassCard>
          </div>
        </main>
      </PageBackground>
    );
  }

  return (
    <PageBackground>
      <Navbar />

      <main className="pt-28 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">创意验证</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              输入你的商业创意
            </h1>
            <p className="text-muted-foreground">
              详细描述你的想法，我们将基于小红书数据进行分析
            </p>
            <div className="absolute top-4 right-4 md:top-8 md:right-8">
              <SettingsDialog />
            </div>
          </div>

          {/* Main Input Card */}
          <GlassCard className="mb-8 animate-slide-up">
            <div className="space-y-6">
              {/* Idea Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Lightbulb className="w-4 h-4 inline mr-2" />
                  商业创意描述
                </label>
                <Textarea
                  placeholder="例如：开一家专门做猫咪主题下午茶的咖啡店，提供猫咪陪伴服务..."
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  className="min-h-[150px] text-base resize-none rounded-xl border-border/50 bg-background/50 focus:bg-background transition-colors"
                  disabled={isValidating}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  描述越详细，分析结果越精准
                </p>
              </div>

              {/* Quick Examples */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">💡 快速尝试:</p>
                <div className="flex flex-wrap gap-2">
                  {exampleIdeas.map((example) => (
                    <button
                      key={example}
                      onClick={() => setIdea(example)}
                      disabled={isValidating}
                      className="text-xs px-3 py-1.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Target className="w-4 h-4 inline mr-2" />
                  相关标签（可选，最多5个）
                </label>

                {/* Selected Tags */}
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="px-3 py-1 text-sm bg-primary/10 text-primary hover:bg-primary/20"
                      >
                        {tag}
                        <button onClick={() => handleRemoveTag(tag)} className="ml-2" disabled={isValidating}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Suggested Tags */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {suggestedTags
                    .filter(tag => !selectedTags.includes(tag))
                    .map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(tag)}
                        disabled={selectedTags.length >= 5 || isValidating}
                        className="text-sm px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        + {tag}
                      </button>
                    ))}
                </div>

                {/* Custom Tag Input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="添加自定义标签..."
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddCustomTag()}
                    className="flex-1 rounded-xl border-border/50 bg-background/50"
                    disabled={selectedTags.length >= 5 || isValidating}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleAddCustomTag}
                    disabled={!customTag.trim() || selectedTags.length >= 5 || isValidating}
                    className="rounded-xl"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Submit Button */}
          <div className="text-center animate-slide-up" style={{ animationDelay: "150ms" }}>
            {isValidating ? (
              <div className="space-y-6 animate-slide-up">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-primary font-medium animate-pulse">
                      {progressStage}
                    </span>
                    <span className="text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-3 rounded-full" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: "数据抓取", done: progress >= 30, icon: Search },
                    { label: "AI 分析", done: progress >= 60, icon: Sparkles },
                    { label: "报告生成", done: progress >= 90, icon: FileText },
                  ].map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <div
                        key={i}
                        className={`p-4 rounded-xl border transition-all duration-500 ${step.done
                          ? "bg-primary/10 border-primary/20"
                          : "bg-muted/30 border-transparent opacity-50"
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${step.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {step.done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                          </div>
                          <span className={`font-medium ${step.done ? "text-primary" : "text-muted-foreground"}`}>
                            {step.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Button
                onClick={handleValidate}
                disabled={!idea.trim()}
                size="lg"
                className="text-lg px-12 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                <Search className="w-5 h-5 mr-2" />
                开始验证
              </Button>
            )}
          </div>

          {/* Tips */}
          <GlassCard className="mt-8 animate-slide-up" style={{ animationDelay: "200ms" }}>
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-foreground mb-1">提升验证效果的小技巧</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 详细描述你的目标用户群体</li>
                  <li>• 说明产品/服务的核心卖点</li>
                  <li>• 提及你了解的竞争对手</li>
                  <li>• 选择准确的行业标签</li>
                </ul>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    </PageBackground>
  );
};

export default Validate;
