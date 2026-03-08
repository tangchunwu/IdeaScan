import { useMemo } from "react";
import { GlassCard } from "@/components/shared";
import { Cloud } from "lucide-react";

interface SentimentWordCloudProps {
  topPositive: string[];
  topNegative: string[];
}

interface WordItem {
  text: string;
  weight: number;
  type: "positive" | "negative";
}

export function SentimentWordCloud({ topPositive, topNegative }: SentimentWordCloudProps) {
  const words = useMemo(() => {
    const items: WordItem[] = [];
    topPositive.forEach((text, i) => {
      items.push({ text, weight: topPositive.length - i, type: "positive" });
    });
    topNegative.forEach((text, i) => {
      items.push({ text, weight: topNegative.length - i, type: "negative" });
    });
    // Shuffle for visual variety
    return items.sort(() => Math.random() - 0.5);
  }, [topPositive, topNegative]);

  if (words.length === 0) return null;

  const maxWeight = Math.max(...words.map(w => w.weight), 1);

  return (
    <GlassCard className="animate-slide-up" style={{ animationDelay: "250ms" }}>
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Cloud className="w-5 h-5 text-primary" />
        情感关键词云
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-3 py-6 min-h-[160px]">
        {words.map((word, i) => {
          const scale = 0.7 + (word.weight / maxWeight) * 0.8;
          const fontSize = Math.round(13 + scale * 14);
          const isPositive = word.type === "positive";
          return (
            <span
              key={`${word.text}-${i}`}
              className={`inline-block px-3 py-1.5 rounded-full font-medium transition-transform hover:scale-110 cursor-default ${
                isPositive
                  ? "bg-secondary/10 text-secondary border border-secondary/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
              style={{ fontSize: `${fontSize}px`, opacity: 0.6 + scale * 0.4 }}
              title={`${isPositive ? "正面" : "负面"}: ${word.text}`}
            >
              {word.text}
            </span>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground mt-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-secondary/30 border border-secondary/40" />
          正面关键词
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-destructive/30 border border-destructive/40" />
          负面关键词
        </span>
      </div>
    </GlassCard>
  );
}
