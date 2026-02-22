import { Share2 } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { ShareCard } from "@/components/social";
import type { ReportDataResult } from "./useReportData";

interface ShareTabProps {
  data: ReportDataResult;
}

export function ShareTab({ data }: ShareTabProps) {
  const { validation, aiAnalysis, dimensions } = data;

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-primary">
        <Share2 className="w-5 h-5" />
        生成分享卡片
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        生成一张精美的验证报告卡片，分享到朋友圈或小红书，展示你的创业想法！
      </p>
      <ShareCard
        idea={validation.idea}
        score={validation.overall_score || 0}
        verdict={aiAnalysis.overallVerdict || ""}
        dimensions={dimensions}
        tags={validation.tags || []}
      />
    </GlassCard>
  );
}
