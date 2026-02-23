import { GlassCard, ScoreCircle } from "@/components/shared";

interface ScoreHeroCardProps {
  score: number;
  totalNotes: number;
}

export const ScoreHeroCard = ({ score, totalNotes }: ScoreHeroCardProps) => (
  <GlassCard className="flex-1 flex flex-col justify-center items-center relative overflow-hidden bg-gradient-to-br from-card/80 to-card/40" padding="lg" elevated>
    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
    <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />
    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-6">需求真实度评分</span>
    <div className="relative group cursor-default transform hover:scale-105 transition-transform duration-500">
      <ScoreCircle score={score} customSize={160} strokeWidth={12} showText={false} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-foreground tracking-tighter">{score}</span>
        <span className="text-sm text-muted-foreground mt-1 font-medium">/ 100</span>
      </div>
    </div>
    <div className="mt-8 text-center space-y-2">
      <div className={`text-lg font-bold px-6 py-2 rounded-full inline-block ${score >= 80 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
        score >= 60 ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
        {score >= 80 ? "✅ 真实刚需" : score >= 60 ? "⚠️ 需求待验证" : "❌ 疑似伪需求"}
      </div>
      <p className="text-xs text-muted-foreground mt-2">基于 {totalNotes} 条真实用户数据分析</p>
    </div>
  </GlassCard>
);
