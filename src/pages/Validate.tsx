import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageBackground, GlassCard, Navbar, LoadingSpinner, SettingsDialog, QuotaExhaustedDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserQuota } from "@/hooks/useUserQuota";
import { validationKeys } from "@/hooks/useValidation";
import { createValidationStream, getValidation } from "@/services/validationService";
import { useSettings } from "@/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { toUserFacingBackendError } from "@/lib/backendErrors";
import { captureEvent } from "@/lib/posthog";
import { invokeFunction } from "@/lib/invokeFunction";
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
  CheckCircle2,
  Loader2,
  Brain,
  Globe,
  FileBarChart,
  Zap,
  Microscope,
  AlertTriangle,
  Wand2
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
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const settings = useSettings();
  const { freeRemaining, freeTotal, canValidate, hasOwnTikhub, refetch: refetchQuota } = useUserQuota();
  const [idea, setIdea] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const sseControllerRef = useRef<{ abort: () => void } | null>(null);
  const [validationMode, setValidationMode] = useState<'quick' | 'deep'>('deep');
  const [showQuotaDialog, setShowQuotaDialog] = useState(false);
  const [showSettingsFromQuota, setShowSettingsFromQuota] = useState(false);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [resumeValidationId, setResumeValidationId] = useState<string>("");
  const [aiTagSuggestions, setAiTagSuggestions] = useState<Array<{
    tag: string;
    confidence: number;
    reason: string;
    source: 'core' | 'user_phrase' | 'trend' | 'competitor';
  }>>([]);

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

  const handleSuggestTags = async () => {
    if (!idea.trim()) {
      toast({ title: "请先填写想法描述", description: "输入你的需求后再让 AI 推荐关键词", variant: "destructive" });
      return;
    }
    setIsSuggestingTags(true);
    try {
      const { data, error } = await invokeFunction<{
        success: boolean;
        suggestions: Array<{ tag: string; confidence: number; reason: string; source: 'core' | 'user_phrase' | 'trend' | 'competitor' }>;
      }>("suggest-keywords", {
        body: {
          idea: idea.trim(),
          tags: selectedTags,
          config: {
            llmBaseUrl: settings.llmBaseUrl,
            llmApiKey: settings.llmApiKey,
            llmModel: settings.llmModel,
            llmFallbacks: settings.llmFallbacks,
          },
        },
      }, true);
      if (error) {
        throw new Error(error.message || "关键词推荐失败");
      }
      const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
      setAiTagSuggestions(suggestions);
      toast({
        title: "已生成关键词建议",
        description: `AI 推荐 ${suggestions.length} 个候选标签，请确认后使用`,
      });
    } catch (e) {
      toast({
        title: "关键词推荐失败",
        description: (e as Error).message || "请稍后再试",
        variant: "destructive",
      });
    } finally {
      setIsSuggestingTags(false);
    }
  };

  const handleApplyTopAiTags = () => {
    const merged = [...selectedTags];
    for (const item of aiTagSuggestions.slice(0, 3)) {
      if (merged.length >= 5) break;
      if (!merged.includes(item.tag)) {
        merged.push(item.tag);
      }
    }
    setSelectedTags(merged.slice(0, 5));
  };

  // Validation steps configuration - 优化版流程
  const validationSteps = [
    { id: 0, label: "解析想法", description: "正在理解你的商业想法...", icon: Brain, targetProgress: 12 },
    { id: 1, label: "提炼关键词", description: "正在智能提炼搜索关键词...", icon: Sparkles, targetProgress: 20 },
    { id: 2, label: "抓取真实数据", description: "小红书/抖音 + 全网竞品情报...", icon: Globe, targetProgress: 45 },
    { id: 3, label: "数据清洗提炼", description: "Jina清洗 + 竞品提取 + 深度搜索...", icon: Microscope, targetProgress: 65 },
    { id: 4, label: "智能摘要", description: "分层摘要 + 洞察聚合...", icon: Sparkles, targetProgress: 78 },
    { id: 5, label: "需求真伪分析", description: "AI 正在判断是否为伪需求...", icon: Brain, targetProgress: 88 },
    { id: 6, label: "生成验证报告", description: "正在生成需求验证报告...", icon: FileBarChart, targetProgress: 95 },
  ];

  // Handle URL params for trending topics and auto-start
  useEffect(() => {
    const ideaParam = searchParams.get('idea');
    const autoParam = searchParams.get('auto');
    const resumeIdParam = searchParams.get('resumeValidationId');

    if (resumeIdParam) {
      setResumeValidationId(resumeIdParam);
    }

    if (ideaParam && !idea) {
      setIdea(decodeURIComponent(ideaParam));

      // If auto-start is requested (and user is logged in)
      if (autoParam === 'true' && user && !isValidating) {
        toast({
          title: "正在启动验证...",
          description: resumeIdParam ? "正在续跑上次失败任务..." : "来自 Hunter 的自动分析请求",
        });
        // Small delay to allow state to settle
        setTimeout(() => {
          const startButton = document.getElementById('validate-start-btn');
          if (startButton) startButton.click();
        }, 500);
      } else {
        toast({
          title: "已填充热点关键词",
          description: `"${ideaParam}" - 来自热点雷达`,
        });
      }
    }
  }, [searchParams, user]); // Added user dependency to ensuring auto-start only when logged in

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      sseControllerRef.current?.abort();
    };
  }, []);

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

    // Check quota before starting
    if (!canValidate) {
      setShowQuotaDialog(true);
      return;
    }

    // Track validation start event
    captureEvent('validation_started', {
      idea_length: idea.trim().length,
      tags_count: selectedTags.length,
      mode: validationMode,
      has_own_tikhub: hasOwnTikhub,
    });

    setIsValidating(true);
    setProgress(0);
    setCurrentStep(0);
    setProgressMessage("");
    const resumeIdForRun = resumeValidationId || undefined;
    if (resumeValidationId) {
      setResumeValidationId("");
    }

    // 使用 SSE 流式验证
    sseControllerRef.current = createValidationStream(
      {
        idea: idea.trim(),
        tags: selectedTags,
        mode: validationMode,
        resumeValidationId: resumeIdForRun,
        config: {
          mode: validationMode,
          llmProvider: settings.llmProvider,
          llmBaseUrl: settings.llmBaseUrl,
          llmApiKey: settings.llmApiKey,
          llmModel: settings.llmModel,
          llmFallbacks: settings.llmFallbacks,
          // Only pass TikHub token if user has configured their own
          tikhubToken: hasOwnTikhub ? settings.tikhubToken : undefined,
          enableXiaohongshu: settings.enableXiaohongshu,
          enableDouyin: settings.enableDouyin,
          enableSelfCrawler: settings.enableSelfCrawler,
          // Allow "self-crawler first, then fallback" for both quick/deep.
          enableTikhubFallback: settings.enableTikhubFallback,
          searchKeys: {
            bocha: settings.bochaApiKey,
            you: settings.youApiKey,
            tavily: settings.tavilyApiKey,
          },
        },
      },
      // onProgress
      (event) => {
        if (event.progress !== undefined) setProgress(event.progress);
        if (event.message) setProgressMessage(event.message);

        // 根据 stage 映射到 currentStep - 优化后的进度阶段
        const stageMap: Record<string, number> = {
          init: 0,
          keywords: 1,
          cache_check: 1,
          crawl_start: 2, crawl_xhs: 2, crawl_dy: 2, crawl_done: 2, search: 2,
          jina_clean: 3, extract_competitors: 3, deep_search: 3,
          summarize_l1: 4, summarize_l2: 4,
          analyze: 5,
          save: 6,
          complete: 7
        };
        if (event.stage && stageMap[event.stage] !== undefined) {
          setCurrentStep(stageMap[event.stage]);
        }
      },
      // onComplete
      async (result) => {
        setProgress(100);
        setCurrentStep(validationSteps.length);

        // Track validation completed event
        captureEvent('validation_completed', {
          validation_id: result.validationId,
          score: result.overallScore,
          mode: validationMode,
        });

        toast({ title: "验证完成！", description: `评分：${result.overallScore}分` });

        // Refresh quota after successful validation
        refetchQuota();

        // 预加载报告数据
        await queryClient.prefetchQuery({
          queryKey: validationKeys.detail(result.validationId),
          queryFn: () => getValidation(result.validationId),
          staleTime: 1000 * 60 * 5,
        });

        setTimeout(() => navigate(`/report/${result.validationId}`), 500);
      },
      // onError
      (error) => {
        // Track validation error
        captureEvent('validation_failed', {
          error: error.substring(0, 100),
          mode: validationMode,
        });

        // Check if it's a quota exceeded error
        if (error.includes('FREE_QUOTA_EXCEEDED') || error.includes('免费验证次数已用完')) {
          setShowQuotaDialog(true);
        } else {
          toast({ title: "验证失败", description: error, variant: "destructive" });
        }
        setIsValidating(false);
        setProgress(0);
        setCurrentStep(0);
      }
    );
  };

  // 未登录状态 - 直接跳转到登录页
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [authLoading, user, navigate]);

  // 加载中或未登录时显示加载状态
  if (authLoading || !user) {
    return (
      <PageBackground>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="flex items-center justify-center min-h-[50vh]">
            <LoadingSpinner size="lg" />
          </div>
        </main>
      </PageBackground>
    );
  }

  return (
    <PageBackground>
      <Navbar />

      <main className="pt-28 pb-20 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="relative text-center mb-16 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-sm border border-white/20 text-primary shadow-sm mb-6">
              <Target className="w-4 h-4" />
              <span className="text-sm font-medium">需求验证实验室</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6 tracking-tight">
              你的想法是<span className="text-primary">真刚需</span>吗？
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              描述你的创业想法，我们会抓取小红书真实用户痛点和全网竞品数据，帮你验证需求是否真实存在。
            </p>

            {/* Settings Button */}
            <div className="absolute top-0 right-0 z-10 opacity-60 hover:opacity-100 transition-opacity">
              <SettingsDialog />
            </div>
          </div>

          {/* Main Input Card */}
          <GlassCard className="mb-12 animate-slide-up relative overflow-visible" elevated padding="lg">
            {/* Visual Decoration */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-10 relative z-10">
              {/* SECTION 1: Idea Input (Primary Focus) */}
              <div className="space-y-4">
                <label className="block text-lg font-semibold text-foreground flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  你想做什么？
                </label>
                <div className="relative group">
                  <Textarea
                    placeholder="例如：我想开一家猫咪主题咖啡店，目标用户是25-35岁的都市白领，核心卖点是边撸猫边喝精品咖啡..."
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    className="min-h-[200px] text-lg leading-relaxed resize-none rounded-2xl border-border/40 bg-white/40 focus:bg-white/80 focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all duration-300 placeholder:text-muted-foreground/50 p-6 shadow-inner"
                    disabled={isValidating}
                  />
                  {/* Character count or hint could go here */}
                </div>
                <div className="flex justify-between items-start pt-2">
                  <p className="text-sm text-muted-foreground/80 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> 描述越具体，验证结果越精准
                  </p>
                </div>
              </div>

              {/* Quick Examples (Tertiary) */}
              <div className="pl-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">灵感参考</p>
                <div className="flex flex-wrap gap-3">
                  {exampleIdeas.map((example) => (
                    <button
                      key={example}
                      onClick={() => setIdea(example)}
                      disabled={isValidating}
                      className="text-sm px-4 py-2 rounded-xl bg-secondary/5 border border-transparent hover:border-secondary/20 hover:bg-secondary/10 text-muted-foreground hover:text-secondary-foreground transition-all duration-300 text-left disabled:opacity-50"
                    >
                      "{example}"
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

              {/* SECTION 2: Tags Selection (Secondary Context) */}
              <div className="space-y-4">
                <label className="block text-base font-semibold text-foreground flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-secondary/10 text-secondary">
                    <Target className="w-4 h-4" />
                  </div>
                  目标赛道 <span className="text-sm font-normal text-muted-foreground ml-2">(可选)</span>
                </label>

                <div className="bg-muted/30 rounded-2xl p-6 border border-border/20">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-muted-foreground">可手动选择，也可先让 AI 推荐后再确认</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSuggestTags}
                        disabled={isValidating || isSuggestingTags || !idea.trim()}
                        className="h-8 rounded-lg"
                      >
                        {isSuggestingTags ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
                        AI 推荐关键词
                      </Button>
                      {aiTagSuggestions.length > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleApplyTopAiTags}
                          disabled={isValidating || selectedTags.length >= 5}
                          className="h-8 rounded-lg"
                        >
                          一键采用前3
                        </Button>
                      )}
                    </div>
                  </div>

                  {aiTagSuggestions.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-background/70 border border-border/40">
                      <p className="text-xs text-muted-foreground mb-2">AI 候选标签（点击加入）</p>
                      <div className="flex flex-wrap gap-2">
                        {aiTagSuggestions.slice(0, 6).map((item) => (
                          <button
                            key={`${item.tag}-${item.source}`}
                            onClick={() => handleAddTag(item.tag)}
                            disabled={selectedTags.length >= 5 || isValidating || selectedTags.includes(item.tag)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary disabled:opacity-50"
                            title={`${item.reason}（置信度 ${(item.confidence * 100).toFixed(0)}%）`}
                          >
                            + {item.tag} · {(item.confidence * 100).toFixed(0)}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Selected Tags Area */}
                  <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
                    {selectedTags.length === 0 && (
                      <span className="text-sm text-muted-foreground/50 italic py-1">暂未选择标签（系统将自动分析）</span>
                    )}
                    {selectedTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="pl-3 pr-1 py-1.5 text-sm bg-background border-border/50 shadow-sm text-foreground hover:bg-background"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-2 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          disabled={isValidating}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>

                  {/* Input & Suggestions */}
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 flex gap-2">
                      <Input
                        placeholder="输入标签..."
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddCustomTag()}
                        className="flex-1 rounded-xl border-border/50 bg-background/50 focus:bg-background h-10"
                        disabled={selectedTags.length >= 5 || isValidating}
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleAddCustomTag}
                        disabled={!customTag.trim() || selectedTags.length >= 5 || isValidating}
                        className="rounded-xl h-10 w-10 shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex-1 flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-muted-foreground mr-1">热门:</span>
                      {suggestedTags
                        .filter(tag => !selectedTags.includes(tag))
                        .slice(0, 5) // Show fewer
                        .map((tag) => (
                          <button
                            key={tag}
                            onClick={() => handleAddTag(tag)}
                            disabled={selectedTags.length >= 5 || isValidating}
                            className="text-xs px-2.5 py-1 rounded-lg border border-border/40 bg-background/30 hover:bg-white hover:border-primary/30 text-muted-foreground hover:text-primary transition-all disabled:opacity-50"
                          >
                            + {tag}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Validation Mode Selector */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
            <div className="grid grid-cols-2 gap-4">
              {/* Quick Validation */}
              <button
                onClick={() => setValidationMode('quick')}
                disabled={isValidating}
                className={`relative p-5 rounded-2xl border-2 transition-all duration-300 text-left ${validationMode === 'quick'
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-border/40 bg-white/40 hover:border-primary/30 hover:bg-white/60'
                  } disabled:opacity-50`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${validationMode === 'quick' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Zap className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold ${validationMode === 'quick' ? 'text-primary' : 'text-foreground'}`}>
                      快速验证
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      快速判断需求真伪，适合初步筛选
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      预计 10-20 秒
                    </p>
                  </div>
                </div>
                {validationMode === 'quick' && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                )}
              </button>

              {/* Deep Validation */}
              <button
                onClick={() => setValidationMode('deep')}
                disabled={isValidating}
                className={`relative p-5 rounded-2xl border-2 transition-all duration-300 text-left ${validationMode === 'deep'
                  ? 'border-secondary bg-secondary/5 shadow-lg shadow-secondary/10'
                  : 'border-border/40 bg-white/40 hover:border-secondary/30 hover:bg-white/60'
                  } disabled:opacity-50`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${validationMode === 'deep' ? 'bg-secondary/10 text-secondary' : 'bg-muted text-muted-foreground'}`}>
                    <Microscope className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold ${validationMode === 'deep' ? 'text-secondary' : 'text-foreground'}`}>
                      深度验证
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      小红书痛点 + 竞品分析 + AI辩论
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      预计 30-60 秒
                    </p>
                  </div>
                </div>
                {validationMode === 'deep' && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-secondary" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="text-center animate-slide-up" style={{ animationDelay: "150ms" }}>
            {isValidating ? (
              <GlassCard className="space-y-6 animate-scale-in">
                {/* Main Progress Header */}
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">正在验证你的想法...</h3>
                    <p className="text-sm text-muted-foreground mt-1">请稍候，这可能需要 15-30 秒</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">处理进度</span>
                    <span className="font-mono text-primary font-medium">{Math.round(progress)}%</span>
                  </div>
                  <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary to-secondary rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                    </div>
                  </div>
                </div>

                {/* Steps Timeline */}
                <div className="relative">
                  <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-border" />
                  <div className="space-y-4">
                    {validationSteps.map((step, i) => {
                      const Icon = step.icon;
                      const isCompleted = currentStep > i;
                      const isActive = currentStep === i;
                      const isPending = currentStep < i;

                      return (
                        <div
                          key={step.id}
                          className={`flex items-center gap-4 transition-all duration-500 ${isPending ? "opacity-40" : "opacity-100"
                            }`}
                        >
                          <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-500 ${isCompleted
                            ? "bg-primary border-primary text-primary-foreground scale-100"
                            : isActive
                              ? "bg-primary/10 border-primary text-primary scale-110 shadow-lg shadow-primary/20"
                              : "bg-background border-border text-muted-foreground"
                            }`}>
                            {isCompleted ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : isActive ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Icon className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={`font-medium transition-colors ${isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                              }`}>
                              {step.label}
                            </p>
                            {isActive && (
                              <p className="text-xs text-muted-foreground mt-0.5 animate-fade-in">
                                {progressMessage || step.description}
                              </p>
                            )}
                          </div>
                          {isCompleted && (
                            <span className="text-xs text-primary font-medium">完成</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </GlassCard>
            ) : (
              <div className="space-y-3">
                {/* Quota Indicator */}
                {!hasOwnTikhub && (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    {freeRemaining > 0 ? (
                      <span className="text-muted-foreground">
                        免费验证次数剩余: <span className="font-semibold text-primary">{freeRemaining}</span>/{freeTotal}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-warning">
                        <AlertTriangle className="w-4 h-4" />
                        免费次数已用完
                      </span>
                    )}
                  </div>
                )}
                
                <Button
                  id="validate-start-btn"
                  onClick={handleValidate}
                  disabled={!idea.trim()}
                  size="lg"
                  className="text-lg px-12 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                >
                  <Target className="w-5 h-5 mr-2" />
                  验证我的想法
                </Button>
              </div>
            )}
          </div>

          {/* Tips */}
          <GlassCard className="mt-8 animate-slide-up" style={{ animationDelay: "200ms" }}>
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-foreground mb-1">让验证结果更精准</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 明确说明你想解决什么问题</li>
                  <li>• 描述你的目标用户是谁</li>
                  <li>• 说明你认为的差异化优势</li>
                  <li>• 选择准确的行业赛道标签</li>
                </ul>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>

      {/* Quota Exhausted Dialog */}
      <QuotaExhaustedDialog
        open={showQuotaDialog}
        onOpenChange={setShowQuotaDialog}
        onOpenSettings={() => {
          setShowQuotaDialog(false);
          setShowSettingsFromQuota(true);
        }}
      />

      {/* Settings Dialog triggered from quota dialog */}
      {showSettingsFromQuota && (
        <SettingsDialog 
          open={showSettingsFromQuota} 
          onOpenChange={(open) => !open && setShowSettingsFromQuota(false)} 
        />
      )}
    </PageBackground>
  );
};

export default Validate;
