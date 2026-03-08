import { useState } from "react";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useReferral } from "@/hooks/useReferral";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, Check, Users, Loader2 } from "lucide-react";

export function ReferralCard() {
  const { code, usesCount, loading, shareUrl, redeemCode } = useReferral();
  const { toast } = useToast();
  const [redeemInput, setRedeemInput] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "邀请链接已复制" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "复制失败", variant: "destructive" });
    }
  };

  const handleRedeem = async () => {
    if (!redeemInput.trim()) return;
    setRedeeming(true);
    try {
      const result = await redeemCode(redeemInput.trim());
      if (result?.success) {
        toast({ title: "🎉 兑换成功！", description: "你和邀请者各获得 +1 次免费验证额度" });
        setRedeemInput("");
      } else {
        const msgs: Record<string, string> = {
          already_redeemed: "你已兑换过邀请码",
          invalid_code: "邀请码无效",
          self_referral: "不能使用自己的邀请码",
        };
        toast({ title: "兑换失败", description: msgs[result?.error] || result?.error || "请重试", variant: "destructive" });
      }
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) return null;

  return (
    <GlassCard className="animate-slide-up">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-primary/10">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">邀请好友</h3>
          <p className="text-xs text-muted-foreground">每成功邀请一人，双方各得 +1 免费验证次数</p>
        </div>
      </div>

      {/* My code */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 px-3 py-2 rounded-xl bg-muted/30 border border-border/30 font-mono text-sm text-foreground">
          {code || "生成中..."}
        </div>
        <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={handleCopy} disabled={!code}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>

      {usesCount > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">已邀请</span>
          <Badge variant="secondary" className="text-xs">{usesCount} 人</Badge>
        </div>
      )}

      {/* Redeem */}
      <div className="pt-3 border-t border-border/30">
        <p className="text-xs text-muted-foreground mb-2">有邀请码？在此兑换：</p>
        <div className="flex gap-2">
          <Input
            placeholder="输入邀请码..."
            value={redeemInput}
            onChange={(e) => setRedeemInput(e.target.value)}
            className="rounded-xl text-sm"
          />
          <Button size="sm" className="rounded-xl shrink-0" onClick={handleRedeem} disabled={redeeming || !redeemInput.trim()}>
            {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : "兑换"}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
