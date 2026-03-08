import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageBackground, GlassCard, Navbar, LoadingSpinner, SettingsDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { useUserQuota } from "@/hooks/useUserQuota";
import { captureEvent } from "@/lib/posthog";
import { invokeFunction } from "@/lib/invokeFunction";
import { useValidationStream, type ValidationStep } from "@/hooks/useValidationStream";
import { ValidationProgress } from "@/components/validate/ValidationProgress";
import {
  Sparkles, X, Plus, Lightbulb, Target, TrendingUp,
  Brain, Globe, FileBarChart, Zap, Microscope,
  AlertTriangle, Wand2, Loader2, CheckCircle2, ChevronDown
} from "lucide-react";

const suggestedTags = [
  "美妆护肤", "穿搭时尚", "美食探店", "家居生活",
  "母婴育儿", "健身运动", "旅行攻略", "数码科技"
];

const exampleIdeas = [
  "开一家专门做猫咪主题下午茶的咖啡店",
  "设计一款帮助职场人管理时间的APP",
  "做手工皮具定制的网店",
];

const validationSteps: ValidationStep[] = [
  { id: 0, label: "解析想法", description: "正在理解你的商业想法...", icon: Brain, targetProgress: 12 },
  { id: 1, label: "提炼关键词", description: "正在智能提炼搜索关键词...", icon: Sparkles, targetProgress: 20 },
  { id: 2, label: "抓取真实数据", description: "小红书/抖音 + 全网竞品情报...", icon: Globe, targetProgress: 45 },
  { id: 3, label: "数据清洗提炼", description: "Jina清洗 + 竞品提取 + 深度搜索...", icon: Microscope, targetProgress: 65 },
  { id: 4, label: "智能摘要", description: "分层摘要 + 洞察聚合...", icon: Sparkles, targetProgress: 78 },
  { id: 5, label: "需求真伪分析", description: "AI 正在判断是否为伪需求...", icon: Brain, targetProgress: 88 },
  { id: 6, label: "生成验证报告", description: "正在生成需求验证报告...", icon: FileBarChart, targetProgress: 95 },
];

const Validate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useDocumentTitle("验证我的想法");
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const settings = useSettings();
  const quota = useUserQuota();

  // Form state
  const [idea, setIdea] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [validationMode, setValidationMode] = useState<'quick' | 'deep'>('deep');
  const [showSettingsFromQuota, setShowSettingsFromQuota] = useState(false);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resumeValidationId, setResumeValidationId] = useState("");
  const [aiTagSuggestions, setAiTagSuggestions] = useState<Array<{
    tag: string; confidence: number; reason: string;
    source: 'core' | 'user_phrase' | 'trend' | 'competitor';
  }>>([]);

  // Validation stream
  const stream = useValidationStream(validationSteps);

  // Cleanup SSE on unmount
  useEffect(() => () => stream.cleanup(), []);

  // Tag handlers
  const handleAddTag = (tag: string) => {
    if (!selectedTags.includes(tag) && selectedTags.length < 5) {
      setSelectedTags([...selectedTags, tag]);
    }
  };
  const handleRemoveTag = (tag: string) => setSelectedTags(selectedTags.filter(t => t !== tag));
  const handleAddCustomTag = () => {
    if (customTag.trim() && !selectedTags.includes(customTag.trim()) && selectedTags.length < 5) {
      setSelectedTags([...selectedTags, customTag.trim()]);
      setCustomTag("");
    }
  };

  const handleSuggestTags = async () => {
    if (!idea.trim()) {
      toast({ title: "请先填写想法描述", description: "输入你的需求后再让 AI 推荐关键词", variant: "destructive" });
      return;
    }
    captureEvent('keyword_suggest_started', { idea_length: idea.trim().length });
    setIsSuggestingTags(true);
    try {
      const { data, error } = await invokeFunction<{
        success: boolean;
        suggestions: Array<{ tag: string; confidence: number; reason: string; source: 'core' | 'user_phrase' | 'trend' | 'competitor' }>;
      }>("suggest-keywords", {
        body: { idea: idea.trim(), tags: selectedTags, config: {
          llmBaseUrl: settings.llmBaseUrl, llmApiKey: settings.llmApiKey,
          llmModel: settings.llmModel, llmFallbacks: settings.llmFallbacks,
        }},
      }, true);
      if (error) throw new Error(error.message || "关键词推荐失败");
      const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
      setAiTagSuggestions(suggestions);
      toast({ title: "已生成关键词建议", description: `AI 推荐 ${suggestions.length} 个候选标签，请确认后使用` });
    } catch (e) {
      toast({ title: "关键词推荐失败", description: (e as Error).message || "请稍后再试", variant: "destructive" });
    } finally {
      setIsSuggestingTags(false);
    }
  };

  const handleApplyTopAiTags = () => {
    const merged = [...selectedTags];
    for (const item of aiTagSuggestions.slice(0, 3)) {
      if (merged.length >= 5) break;
      if (!merged.includes(item.tag)) merged.push(item.tag);
    }
    setSelectedTags(merged.slice(0, 5));
  };

  // Handle URL params
  useEffect(() => {
    const ideaParam = searchParams.get('idea');
    const autoParam = searchParams.get('auto');
    const resumeIdParam = searchParams.get('resumeValidationId');

    if (resumeIdParam) setResumeValidationId(resumeIdParam);

    if (ideaParam && !idea) {
      setIdea(decodeURIComponent(ideaParam));
      if (autoParam === 'true' && user && !stream.isValidating) {
        toast({
          title: "正在启动验证...",
          description: resumeIdParam ? "正在续跑上次失败任务..." : "来自 Hunter 的自动分析请求",
        });
        setTimeout(() => {
          const startButton = document.getElementById('validate-start-btn');
          if (startButton) startButton.click();
        }, 500);
      } else {
        toast({ title: "已填充热点关键词", description: `"${ideaParam}" - 来自热点雷达` });
      }
    }
  }, [searchParams, user]);

  const handleValidate = () => {
    if (!idea.trim()) return;
    if (!user) {
      toast({ title: "请先登录", description: "需要登录才能进行验证", variant: "destructive" });
      navigate("/auth?redirect=/validate");
      return;
    }
    // Allow validation if: user has own TikHub token OR has free quota remaining
    if (!stream.hasOwnTikhub && !quota.canValidate) {
      toast({
        title: "免费次数已用完",
        description: `本月 ${quota.freeTotal} 次免费验证已用完。请在设置中配置个人 TikHub Token 获取无限次验证。`,
        variant: "destructive",
        action: { label: "去配置", onClick: () => setShowSettingsFromQuota(true) },
      });
      return;
    }

    const resumeIdForRun = resumeValidationId || undefined;
    if (resumeValidationId) setResumeValidationId("");

    stream.startValidation({
      idea: idea.trim(),
      selectedTags,
      validationMode,
      resumeValidationId: resumeIdForRun,
    });
  };

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth?redirect=/validate", { replace: true });
    }
  }, [authLoading, user, navigate]);

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
            <div className="absolute top-0 right-0 z-10 opacity-60 hover:opacity-100 transition-opacity">
              <SettingsDialog />
            </div>
          </div>

          {/* Main Input Card */}
          <GlassCard className="mb-12 animate-slide-up relative overflow-visible" elevated padding="lg">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-10 relative z-10">
              {/* Idea Input */}
              <div className="space-y-4">
                <label className="block text-lg font-semibold text-foreground flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  你想做什么？
                </label>
                <Textarea
                  placeholder="例如：我想开一家猫咪主题咖啡店，目标用户是25-35岁的都市白领，核心卖点是边撸猫边喝精品咖啡..."
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  className="min-h-[140px] md:min-h-[200px] text-lg leading-relaxed resize-none rounded-2xl border-border/40 bg-white/40 focus:bg-white/80 focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all duration-300 placeholder:text-muted-foreground/50 p-6 shadow-inner"
                  disabled={stream.isValidating}
                />
                <div className="flex justify-between items-start pt-2">
                  <p className="text-sm text-muted-foreground/80 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> 描述越具体，验证结果越精准
                  </p>
                </div>
              </div>

              {/* Quick Examples */}
              <div className="pl-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">灵感参考</p>
                <div className="flex flex-wrap gap-3">
                  {exampleIdeas.map((example) => (
                    <button
                      key={example}
                      onClick={() => setIdea(example)}
                      disabled={stream.isValidating}
                      className="text-sm px-4 py-2 rounded-xl bg-secondary/5 border border-transparent hover:border-secondary/20 hover:bg-secondary/10 text-muted-foreground hover:text-secondary-foreground transition-all duration-300 text-left disabled:opacity-50"
                    >
                      "{example}"
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

              {/* Tags Section - Collapsible */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group w-full">
                    <div className="p-1.5 rounded-lg bg-secondary/10 text-secondary">
                      <Target className="w-4 h-4" />
                    </div>
                    <span>高级选项：目标赛道 & 关键词</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`} />
                    {selectedTags.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">{selectedTags.length} 个标签已选</Badge>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <div className="bg-muted/30 rounded-2xl p-6 border border-border/20">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-muted-foreground">可手动选择，也可先让 AI 推荐后再确认</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleSuggestTags}
                          disabled={stream.isValidating || isSuggestingTags || !idea.trim()} className="h-8 rounded-lg">
                          {isSuggestingTags ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
                          AI 推荐关键词
                        </Button>
                        {aiTagSuggestions.length > 0 && (
                          <Button variant="secondary" size="sm" onClick={handleApplyTopAiTags}
                            disabled={stream.isValidating || selectedTags.length >= 5} className="h-8 rounded-lg">
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
                            <button key={`${item.tag}-${item.source}`} onClick={() => handleAddTag(item.tag)}
                              disabled={selectedTags.length >= 5 || stream.isValidating || selectedTags.includes(item.tag)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary disabled:opacity-50"
                              title={`${item.reason}（置信度 ${(item.confidence * 100).toFixed(0)}%）`}>
                              + {item.tag} · {(item.confidence * 100).toFixed(0)}%
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected Tags */}
                    <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
                      {selectedTags.length === 0 && (
                        <span className="text-sm text-muted-foreground/50 italic py-1">暂未选择标签（系统将自动分析）</span>
                      )}
                      {selectedTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="pl-3 pr-1 py-1.5 text-sm bg-background border-border/50 shadow-sm text-foreground hover:bg-background">
                          {tag}
                          <button onClick={() => handleRemoveTag(tag)} className="ml-2 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" disabled={stream.isValidating}>
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>

                    {/* Input & Suggestions */}
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1 flex gap-2">
                        <Input placeholder="输入标签..." value={customTag} onChange={(e) => setCustomTag(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddCustomTag()}
                          className="flex-1 rounded-xl border-border/50 bg-background/50 focus:bg-background h-10"
                          disabled={selectedTags.length >= 5 || stream.isValidating} />
                        <Button variant="secondary" size="icon" onClick={handleAddCustomTag}
                          disabled={!customTag.trim() || selectedTags.length >= 5 || stream.isValidating} className="rounded-xl h-10 w-10 shrink-0">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex-1 flex flex-wrap gap-2 items-center">
                        <span className="text-xs text-muted-foreground mr-1">热门:</span>
                        {suggestedTags.filter(tag => !selectedTags.includes(tag)).slice(0, 5).map((tag) => (
                          <button key={tag} onClick={() => handleAddTag(tag)}
                            disabled={selectedTags.length >= 5 || stream.isValidating}
                            className="text-xs px-2.5 py-1 rounded-lg border border-border/40 bg-background/30 hover:bg-white hover:border-primary/30 text-muted-foreground hover:text-primary transition-all disabled:opacity-50">
                            + {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </GlassCard>

          {/* Validation mode is now defaulted to 'deep' - no UI selector */}

          {/* Submit / Progress */}
          <div className="text-center animate-slide-up" style={{ animationDelay: "150ms" }}>
            {stream.isValidating ? (
              <ValidationProgress
                progress={stream.progress}
                currentStep={stream.currentStep}
                progressMessage={stream.progressMessage}
                validationSteps={validationSteps}
                currentValidationId={stream.currentValidationId}
                isCancelling={stream.isCancelling}
                onCancelAndKeep={stream.handleCancelAndKeep}
              />
            ) : (
              <div className="space-y-3">
                {!stream.hasOwnTikhub && quota.canValidate && (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      免费验证剩余 <strong className="text-primary">{quota.freeRemaining}</strong> / {quota.freeTotal} 次
                    </span>
                  </div>
                )}
                {!stream.hasOwnTikhub && !quota.canValidate && (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="flex items-center gap-1 text-warning">
                      <AlertTriangle className="w-4 h-4" />
                      免费次数已用完，请配置 TikHub Token
                    </span>
                  </div>
                )}
                <Button id="validate-start-btn" onClick={handleValidate} disabled={!idea.trim()} size="lg"
                  className="text-lg px-12 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50">
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

      {showSettingsFromQuota && (
        <SettingsDialog open={showSettingsFromQuota} onOpenChange={(open) => !open && setShowSettingsFromQuota(false)} />
      )}
    </PageBackground>
  );
};

export default Validate;
