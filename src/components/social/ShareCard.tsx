import { useState, useRef } from "react";
import html2canvas from "html2canvas";
import { Download, Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareCardProps {
       idea: string;
       score: number;
       verdict: string;
       dimensions: Array<{ dimension: string; score: number; reason?: string }>;
       tags: string[];
}

export function ShareCard({ idea, score, verdict, dimensions, tags }: ShareCardProps) {
       const cardRef = useRef<HTMLDivElement>(null);
       const [isGenerating, setIsGenerating] = useState(false);

       const getVerdictInfo = (score: number) => {
              if (score >= 90) return { emoji: "🦄", label: "UNICORN POTENTIAL", color: "from-yellow-500 to-amber-600" };
              if (score >= 70) return { emoji: "🚀", label: "INVESTABLE", color: "from-green-500 to-emerald-600" };
              if (score >= 40) return { emoji: "⚠️", label: "WATCHLIST", color: "from-orange-500 to-amber-600" };
              return { emoji: "⛔", label: "PASS", color: "from-red-500 to-rose-600" };
       };

       const handleGenerateImage = async () => {
              if (!cardRef.current) return;

              setIsGenerating(true);
              try {
                     const canvas = await html2canvas(cardRef.current, {
                            backgroundColor: "#0a0a0a",
                            scale: 2,
                            useCORS: true,
                     });

                     const link = document.createElement("a");
                     link.download = `idea-validation-${Date.now()}.png`;
                     link.href = canvas.toDataURL("image/png");
                     link.click();
              } catch (e) {
                     console.error("Failed to generate image:", e);
              } finally {
                     setIsGenerating(false);
              }
       };

       const verdictInfo = getVerdictInfo(score);
       const topDimensions = [...dimensions].sort((a, b) => b.score - a.score).slice(0, 3);

       return (
              <div className="space-y-4">
                     {/* Preview Card */}
                     <div
                            ref={cardRef}
                            className="w-full max-w-[400px] mx-auto p-6 rounded-2xl bg-gradient-to-br from-gray-900 to-black border border-white/10"
                            style={{ aspectRatio: "9/16" }}
                     >
                            {/* Header */}
                            <div className="text-center mb-6">
                                   <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                                          综合得分
                                   </div>
                                   <h2 className="text-lg font-bold text-foreground line-clamp-2 leading-tight">
                                          {idea}
                                   </h2>
                                   <div className="flex flex-wrap justify-center gap-1 mt-2">
                                          {tags.slice(0, 3).map((tag, i) => (
                                                 <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                                        #{tag}
                                                 </span>
                                          ))}
                                   </div>
                            </div>

                            {/* Score */}
                            <div className="flex flex-col items-center py-6">
                                   <div className={`text-6xl font-black bg-gradient-to-r ${verdictInfo.color} bg-clip-text text-transparent`}>
                                          {score}
                                   </div>
                                   <div className="text-xl text-muted-foreground">/100</div>
                                   <div className={`mt-3 text-xl font-bold bg-gradient-to-r ${verdictInfo.color} bg-clip-text text-transparent`}>
                                          {verdictInfo.emoji} {verdictInfo.label}
                                   </div>
                            </div>

                            {/* Verdict */}
                            {verdict && (
                                   <div className="text-center text-sm text-muted-foreground italic mb-6 px-4">
                                          "{verdict}"
                                   </div>
                            )}

                            {/* Top 3 Dimensions */}
                            <div className="space-y-2 mb-6">
                                   <div className="text-xs text-muted-foreground uppercase tracking-wider text-center">
                                          Top Scores
                                   </div>
                                   {topDimensions.map((d, i) => (
                                          <div key={i} className="flex justify-between items-center text-sm px-2 py-1 rounded bg-white/5">
                                                 <span className="text-muted-foreground text-xs">{d.dimension}</span>
                                                 <span className={`font-bold ${d.score >= 70 ? 'text-green-500' : 'text-foreground'}`}>
                                                        {d.score}
                                                 </span>
                                          </div>
                                   ))}
                            </div>

                            {/* Footer */}
                            <div className="text-center">
                                   <div className="text-[10px] text-muted-foreground/50">
                                          Powered by IdeaValidator.ai
                                   </div>
                            </div>
                     </div>

                     {/* Action Button */}
                     <div className="flex justify-center">
                            <Button onClick={handleGenerateImage} disabled={isGenerating} className="gap-2">
                                   {isGenerating ? (
                                          <>
                                                 <Loader2 className="w-4 h-4 animate-spin" />
                                                 生成中...
                                          </>
                                   ) : (
                                          <>
                                                 <Download className="w-4 h-4" />
                                                 下载分享图
                                          </>
                                   )}
                            </Button>
                     </div>
              </div>
       );
}
