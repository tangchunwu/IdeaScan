import { useState, useEffect, useRef } from "react";
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
  CheckCircle2,
  Loader2,
  Brain,
  Globe,
  FileBarChart
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
  const [currentStep, setCurrentStep] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  // Validation steps configuration
  const validationSteps = [
    { id: 0, label: "解析创意", description: "正在理解您的商业创意...", icon: Brain, targetProgress: 15 },
    { id: 1, label: "提炼关键词", description: "正在智能提炼核心搜索词...", icon: Sparkles, targetProgress: 30 },
    { id: 2, label: "数据搜索", description: "正在全网并行搜索数据...", icon: Globe, targetProgress: 55 },
    { id: 3, label: "深度分析", description: "AI 正在分析市场数据...", icon: Brain, targetProgress: 80 },
    { id: 4, label: "生成报告", description: "正在生成商业分析报告...", icon: FileBarChart, targetProgress: 95 },
  ];

  // Smooth progress animation
  useEffect(() => {
    if (isValidating && currentStep < validationSteps.length) {
      const targetProgress = validationSteps[currentStep].targetProgress;
      
      progressIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev < targetProgress) {
            // Smooth increment with slight randomization for natural feel
            const increment = Math.random() * 2 + 0.5;
            return Math.min(prev + increment, targetProgress);
          }
          return prev;
        });
      }, 100);

      return () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      };
    }
  }, [isValidating, currentStep]);

  // Step progression timer
  useEffect(() => {
    if (isValidating && currentStep < validationSteps.length - 1) {
      const stepDurations = [800, 1500, 3000, 4000, 2000]; // Different duration per step
      const timer = setTimeout(() => {
        setCurrentStep(prev => prev + 1);
        setProgressStage(validationSteps[currentStep + 1]?.description || "");
      }, stepDurations[currentStep]);

      return () => clearTimeout(timer);
    }
  }, [isValidating, currentStep]);

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
    setCurrentStep(0);
    setProgressStage(validationSteps[0].description);

    try {
      // Actual API Call
      const result = await createMutation.mutateAsync({
        idea: idea.trim(),
        tags: selectedTags,
      });

      // Cleanup
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      setProgress(100);
      setCurrentStep(validationSteps.length);
      setProgressStage("完成！正在跳转...");

      toast({
        title: "验证完成！",
        description: `综合评分：${result.overallScore}分`,
      });

      // Small delay before navigation for user to see completion
      setTimeout(() => {
        navigate(`/report/${result.validationId}`);
      }, 500);
    } catch (error: unknown) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      const errorMessage = error instanceof Error ? error.message : "验证过程中出现错误";
      toast({
        title: "验证失败",
        description: errorMessage,
        variant: "destructive",
      });
      setIsValidating(false);
      setProgress(0);
      setCurrentStep(0);
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
          <div className="relative text-center mb-12 animate-fade-in">
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
            <div className="absolute right-0 top-0 md:top-auto md:bottom-2">
              {/* 移动端右上角，桌面端可能更灵活，这里先简单修复为右上角可见 */}
            </div>
            {/* 重新定位：绝对定位相对于这个 Header 区域 */}
            <div className="absolute top-0 right-2 md:top-4 md:right-4 z-10">
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
              <GlassCard className="space-y-6 animate-scale-in">
                {/* Main Progress Header */}
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{progressStage}</h3>
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
                          className={`flex items-center gap-4 transition-all duration-500 ${
                            isPending ? "opacity-40" : "opacity-100"
                          }`}
                        >
                          <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-500 ${
                            isCompleted 
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
                            <p className={`font-medium transition-colors ${
                              isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                            }`}>
                              {step.label}
                            </p>
                            {isActive && (
                              <p className="text-xs text-muted-foreground mt-0.5 animate-fade-in">
                                {step.description}
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
