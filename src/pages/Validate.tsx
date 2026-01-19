import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBackground, GlassCard, Navbar, LoadingSpinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Search, 
  X, 
  Plus,
  Lightbulb,
  Target,
  TrendingUp
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

const Validate = () => {
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

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

  const handleValidate = async () => {
    if (!idea.trim()) return;
    
    setIsValidating(true);
    
    // 模拟验证过程 - 实际对接后端API时替换
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 跳转到报告页面（带上模拟数据）
    navigate("/report/demo-123");
  };

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
                      className="text-xs px-3 py-1.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
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
                        <button onClick={() => handleRemoveTag(tag)} className="ml-2">
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
                        disabled={selectedTags.length >= 5}
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
                    disabled={selectedTags.length >= 5}
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handleAddCustomTag}
                    disabled={!customTag.trim() || selectedTags.length >= 5}
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
              <GlassCard className="py-12">
                <LoadingSpinner size="lg" text="正在分析小红书数据..." />
                <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                  <p>🔍 搜索相关笔记...</p>
                  <p>📊 统计互动数据...</p>
                  <p>🤖 AI 分析中...</p>
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
