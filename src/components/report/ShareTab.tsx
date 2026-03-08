import { useState } from "react";
import { Share2, Link, Check, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { ShareCard } from "@/components/social";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { ReportDataResult } from "./useReportData";

interface ShareTabProps {
  data: ReportDataResult;
}

export function ShareTab({ data }: ShareTabProps) {
  const { validation, aiAnalysis, dimensions } = data;
  const { toast } = useToast();
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    setCopying(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("get-shared-report", {
        method: "POST",
        body: { action: "create", validationId: validation.id },
      });
      if (error) throw error;
      const token = result?.shareToken;
      if (!token) throw new Error("No token returned");

      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "链接已复制", description: "分享链接已复制到剪贴板" });
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      console.error("Copy share link error:", e);
      toast({ title: "生成链接失败", variant: "destructive" });
    } finally {
      setCopying(false);
    }
  };

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-primary">
        <Share2 className="w-5 h-5" />
        生成分享卡片
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        生成一张精美的验证报告卡片，分享到朋友圈或小红书，展示你的创业想法！
      </p>

      {/* Copy share link */}
      <div className="flex justify-center mb-6">
        <Button variant="outline" className="gap-2 rounded-xl" onClick={handleCopyLink} disabled={copying}>
          {copying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Link className="w-4 h-4" />
          )}
          {copied ? "已复制" : "复制分享链接"}
        </Button>
      </div>

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
