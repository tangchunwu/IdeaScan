import { useState, useEffect } from "react";
import { GlassCard } from "@/components/shared";
import { Persona } from "@/services/validationService";
import { User, Briefcase, Target, Heart, Zap, Loader2, ImageOff, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";

interface PersonaCardProps {
       persona: Persona;
}

export const PersonaCard = ({ persona }: PersonaCardProps) => {
       const [imageUrl, setImageUrl] = useState<string | null>(null);
       const [isGenerating, setIsGenerating] = useState(false);
       const [hasError, setHasError] = useState(false);
       const settings = useSettings();

       if (!persona) return null;

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
                                   // 如果用户配置了自定义 API，使用用户配置
                                   imageGenBaseUrl: settings.imageGenApiKey ? settings.imageGenBaseUrl : undefined,
                                   imageGenApiKey: settings.imageGenApiKey || undefined,
                                   imageGenModel: settings.imageGenApiKey ? settings.imageGenModel : undefined
                            }
                     });

                     if (error) {
                            throw error;
                     }

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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                     {/* Left: Visual & Core Profile (4 cols) */}
                     <GlassCard
                            className="lg:col-span-5 relative overflow-hidden flex flex-col justify-between group"
                            padding="none"
                            elevated
                     >
                            {/* Placeholder for AI Image - Premium Gradient Placeholder */}
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-secondary/20 z-0 transition-transform duration-700 group-hover:scale-105" />

                            {/* Decorative Circles */}
                            <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl z-0" />
                            <div className="absolute bottom-10 left-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl z-0" />

                            <div className="relative z-10 p-8 flex flex-col h-full">
                                   <div className="flex-1 text-center mt-8">
                                          <div 
                                                 className="w-32 h-32 mx-auto rounded-full bg-white/30 backdrop-blur-md border border-white/40 shadow-xl flex items-center justify-center mb-6 relative overflow-hidden cursor-pointer transition-all hover:shadow-2xl hover:scale-105"
                                                 onClick={!isGenerating && !imageUrl ? generateImage : undefined}
                                          >
                                                 {imageUrl ? (
                                                        <img 
                                                               src={imageUrl} 
                                                               alt={persona.name}
                                                               className="w-full h-full object-cover rounded-full"
                                                        />
                                                 ) : isGenerating ? (
                                                        <div className="flex flex-col items-center justify-center">
                                                               <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                                               <span className="text-[10px] text-muted-foreground mt-2">生成中...</span>
                                                        </div>
                                                 ) : hasError ? (
                                                        <div className="flex flex-col items-center justify-center">
                                                               <ImageOff className="w-8 h-8 text-muted-foreground/50" />
                                                               <span className="text-[10px] text-muted-foreground mt-2">生成失败</span>
                                                        </div>
                                                 ) : (
                                                        <>
                                                               <User className="w-12 h-12 text-primary/60" />
                                                               {/* Hover overlay for generation */}
                                                               <div className="absolute inset-0 bg-primary/20 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity backdrop-blur-sm">
                                                                      <Sparkles className="w-6 h-6 text-primary mb-1" />
                                                                      <span className="text-[10px] text-foreground font-medium">点击生成 AI 头像</span>
                                                               </div>
                                                        </>
                                                 )}
                                          </div>

                                          <h3 className="text-2xl font-bold text-foreground mb-1 tracking-tight">{persona.name}</h3>
                                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/40 border border-white/20 text-sm font-medium text-muted-foreground/80">
                                                 <Briefcase className="w-3.5 h-3.5" />
                                                 {persona.role}
                                          </div>

                                          {/* Generate button - always show when no image */}
                                          {!imageUrl && !isGenerating && (
                                                 <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="mt-4 text-xs"
                                                        onClick={generateImage}
                                                 >
                                                        <Sparkles className="w-3 h-3 mr-1" />
                                                        生成 AI 头像
                                                 </Button>
                                          )}
                                   </div>

                                   <div className="mt-8 grid grid-cols-2 gap-4">
                                          <div className="bg-white/40 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
                                                 <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Age Range</span>
                                                 <span className="font-semibold text-foreground">{persona.age}</span>
                                          </div>
                                          <div className="bg-white/40 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
                                                 <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Income</span>
                                                 <span className="font-semibold text-foreground">{persona.income}</span>
                                          </div>
                                   </div>
                            </div>
                     </GlassCard>

                     {/* Right: Story & Attributes (8 cols) */}
                     <div className="lg:col-span-7 flex flex-col gap-6">
                            {/* Story Card */}
                            <GlassCard className="flex-1" padding="lg">
                                   <h4 className="flex items-center gap-2 font-semibold text-foreground mb-4">
                                          <div className="p-1.5 rounded-lg bg-accent/10 text-accent">
                                                 <Heart className="w-4 h-4" />
                                          </div>
                                          用户故事
                                   </h4>
                                   <p className="text-lg text-muted-foreground leading-relaxed italic">
                                          "{persona.description}"
                                   </p>
                            </GlassCard>

                            {/* Attributes Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                   <GlassCard padding="md">
                                          <div className="flex items-baseline justify-between mb-4">
                                                 <h5 className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                                               <Target className="w-4 h-4" />
                                                        </div>
                                                        核心痛点
                                                 </h5>
                                          </div>
                                          <div className="space-y-2">
                                                 {persona.painPoints?.map((pain, i) => (
                                                        <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                                                               <span className="text-red-400 mt-1">•</span>
                                                               {pain}
                                                        </div>
                                                 ))}
                                          </div>
                                   </GlassCard>

                                   <GlassCard padding="md">
                                          <div className="flex items-baseline justify-between mb-4">
                                                 <h5 className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                        <div className="p-1.5 rounded-lg bg-secondary/10 text-secondary">
                                                               <Zap className="w-4 h-4" />
                                                        </div>
                                                        核心诉求
                                                 </h5>
                                          </div>
                                          <div className="space-y-2">
                                                 {persona.goals?.map((goal, i) => (
                                                        <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                                                               <span className="text-green-400 mt-1">✓</span>
                                                               {goal}
                                                        </div>
                                                 ))}
                                          </div>
                                   </GlassCard>
                            </div>

                            {/* Charts Row */}
                            <div className="grid grid-cols-2 gap-6">
                                   <GlassCard padding="md" className="flex flex-col justify-center">
                                          <div className="flex items-center justify-between mb-2">
                                                 <span className="text-sm font-medium text-muted-foreground">技术敏感度</span>
                                                 <span className="text-sm font-bold text-primary">{persona.techSavviness}%</span>
                                          </div>
                                          <Progress value={persona.techSavviness} className="h-2 bg-muted" />
                                   </GlassCard>

                                   <GlassCard padding="md" className="flex flex-col justify-center">
                                          <div className="flex items-center justify-between mb-2">
                                                 <span className="text-sm font-medium text-muted-foreground">消费能力</span>
                                                 <span className="text-sm font-bold text-accent">{persona.spendingCapacity}%</span>
                                          </div>
                                          <Progress value={persona.spendingCapacity} className="h-2 bg-muted" />
                                   </GlassCard>
                            </div>
                     </div>
              </div>
       );
};
