import { useState } from "react";
import { GlassCard } from "@/components/shared";
import { Persona } from "@/services/validationService";
import { User, Briefcase, Target, Zap, Loader2, ImageOff, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";

interface PersonaCardProps {
  persona: Persona;
  validationId?: string;
}

const normalizePersona = (persona: Persona): Persona => ({
  name: persona.name || "目标用户",
  role: persona.role || "潜在用户",
  age: persona.age || "25-45岁",
  income: persona.income || "中等收入",
  painPoints: Array.isArray(persona.painPoints) && persona.painPoints.length > 0
    ? persona.painPoints
    : ["需要更高效的解决方案"],
  goals: Array.isArray(persona.goals) && persona.goals.length > 0
    ? persona.goals
    : ["找到更好的产品体验"],
  techSavviness: typeof persona.techSavviness === 'number' ? persona.techSavviness : 65,
  spendingCapacity: typeof persona.spendingCapacity === 'number' ? persona.spendingCapacity : 60,
  description: persona.description || "AI正在分析用户画像...",
  avatarUrl: persona.avatarUrl,
});

export const PersonaCard = ({ persona: rawPersona, validationId }: PersonaCardProps) => {
  const persona = normalizePersona(rawPersona);
  const [imageUrl, setImageUrl] = useState<string | null>(persona.avatarUrl || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const settings = useSettings();

  if (!rawPersona) return null;

  const generateImage = async () => {
    setIsGenerating(true);
    setHasError(false);
    try {
      const { data, error } = await supabase.functions.invoke('generate-persona-image', {
        body: {
          personaDescription: persona.description,
          personaName: persona.name,
          personaRole: persona.role,
          age: persona.age,
          validationId,
          imageGenBaseUrl: settings.imageGenApiKey ? settings.imageGenBaseUrl : undefined,
          imageGenApiKey: settings.imageGenApiKey || undefined,
          imageGenModel: settings.imageGenApiKey ? settings.imageGenModel : undefined
        }
      });
      if (error) throw error;
      if (data?.imageUrl) {
        setImageUrl(data.imageUrl);
        toast.success(`${persona.name} 头像生成成功`);
      } else if (data?.needsConfig) {
        toast.error("图片生成服务暂不可用");
      } else {
        throw new Error(data?.error || "生成失败");
      }
    } catch (error) {
      console.error("Failed to generate persona image:", error);
      setHasError(true);
      toast.error("头像生成失败，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <GlassCard className="relative overflow-hidden" padding="md" elevated>
      {/* Decorative */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-5">
        {/* Header: Avatar + Identity */}
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-16 shrink-0 rounded-full bg-muted/40 backdrop-blur-md border border-border/40 shadow-lg flex items-center justify-center relative overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:scale-105"
            onClick={!isGenerating && !imageUrl ? generateImage : undefined}
          >
            {imageUrl ? (
              <img src={imageUrl} alt={persona.name} className="w-full h-full object-cover rounded-full" />
            ) : isGenerating ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : hasError ? (
              <ImageOff className="w-5 h-5 text-muted-foreground/50" />
            ) : (
              <>
                <User className="w-7 h-7 text-primary/60" />
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity backdrop-blur-sm">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
              </>
            )}
          </div>

          {/* Name + Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-foreground tracking-tight">{persona.name}</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 border border-border/20 text-xs font-medium text-muted-foreground">
                <Briefcase className="w-3 h-3" />
                {persona.role}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {persona.age} · {persona.income}
            </p>
            {!imageUrl && !isGenerating && (
              <button onClick={generateImage} className="text-[10px] text-primary/70 hover:text-primary mt-1 inline-flex items-center gap-1 transition-colors">
                <Sparkles className="w-3 h-3" />生成 AI 头像
              </button>
            )}
          </div>
        </div>

        {/* User Story */}
        <blockquote className="text-sm text-muted-foreground leading-relaxed italic border-l-2 border-primary/30 pl-4 line-clamp-3">
          "{persona.description}"
        </blockquote>

        {/* Bottom Grid: Pain Points + Goals + Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Pain Points */}
          <div className="space-y-2">
            <h5 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <div className="p-1 rounded bg-primary/10 text-primary"><Target className="w-3 h-3" /></div>
              核心痛点
            </h5>
            <div className="space-y-1">
              {persona.painPoints?.map((pain, i) => (
                <p key={i} className="text-xs text-foreground/70 flex items-start gap-1.5">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span>
                  <span className="line-clamp-2">{pain}</span>
                </p>
              ))}
            </div>
          </div>

          {/* Goals */}
          <div className="space-y-2">
            <h5 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <div className="p-1 rounded bg-secondary/10 text-secondary"><Zap className="w-3 h-3" /></div>
              核心诉求
            </h5>
            <div className="space-y-1">
              {persona.goals?.map((goal, i) => (
                <p key={i} className="text-xs text-foreground/70 flex items-start gap-1.5">
                  <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                  <span className="line-clamp-2">{goal}</span>
                </p>
              ))}
            </div>
          </div>

          {/* Tech Savviness */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">技术敏感度</span>
              <span className="text-xs font-bold text-primary">{persona.techSavviness}%</span>
            </div>
            <Progress value={persona.techSavviness} className="h-1.5 bg-muted" />
          </div>

          {/* Spending */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">消费能力</span>
              <span className="text-xs font-bold text-accent">{persona.spendingCapacity}%</span>
            </div>
            <Progress value={persona.spendingCapacity} className="h-1.5 bg-muted" />
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
