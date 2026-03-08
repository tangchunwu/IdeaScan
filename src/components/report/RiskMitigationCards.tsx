import { useState } from "react";
import { AlertTriangle, Shield, ChevronDown, Lightbulb } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";

interface RiskMitigationCardsProps {
  weaknesses: string[];
  risks: string[];
}

interface ParsedRisk {
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  mitigation: string;
}

const mitigationTemplates: Record<string, string[]> = {
  '技术': ['组建核心技术团队或寻找技术合伙人', '采用成熟的开源框架降低开发风险', '制定技术路线图，分阶段迭代'],
  '用户': ['通过小范围 MVP 测试验证用户习惯', '设计引导式 Onboarding 降低学习成本', '建立用户反馈闭环，持续优化体验'],
  '竞争': ['聚焦差异化功能打造护城河', '优先服务垂直细分市场', '建立品牌认知和用户粘性'],
  '成本': ['采用精益创业方法控制早期投入', '寻找战略合作伙伴分摊成本', '设计灵活的定价策略覆盖运营成本'],
  '政策': ['密切关注行业法规变化', '设计合规优先的产品架构', '准备替代方案应对政策调整'],
  '数据': ['建立严格的数据安全管理体系', '遵循最小数据收集原则', '获取必要的安全认证和合规资质'],
  '平台': ['减少对单一平台的依赖', '建立自有渠道和用户触达能力', '多平台布局分散风险'],
  '市场': ['深入调研目标市场需求', '小步快跑验证商业模式', '保持灵活性以快速调整方向'],
};

function inferMitigation(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, strategies] of Object.entries(mitigationTemplates)) {
    if (lower.includes(key)) {
      return strategies.join('；');
    }
  }
  // Fallback: generic mitigation
  if (lower.includes('研发') || lower.includes('开发') || lower.includes('ai') || lower.includes('识别'))
    return mitigationTemplates['技术'].join('；');
  if (lower.includes('习惯') || lower.includes('推广') || lower.includes('留存'))
    return mitigationTemplates['用户'].join('；');
  if (lower.includes('依赖') || lower.includes('第三方') || lower.includes('视频'))
    return mitigationTemplates['平台'].join('；');
  if (lower.includes('隐私') || lower.includes('安全'))
    return mitigationTemplates['数据'].join('；');
  return '制定应急预案，持续监控该风险指标，必要时及时调整策略方向。';
}

function parseRisks(weaknesses: string[], risks: string[]): ParsedRisk[] {
  const parsed: ParsedRisk[] = [];

  for (const w of weaknesses) {
    const text = String(w || "").trim();
    if (!text) continue;
    const colonIdx = text.indexOf('：');
    const dashIdx = text.indexOf(' - ');
    let title = text;
    let description = "";

    if (colonIdx > 0 && colonIdx < 30) {
      title = text.slice(0, colonIdx).trim();
      description = text.slice(colonIdx + 1).trim();
    } else if (dashIdx > 0 && dashIdx < 30) {
      title = text.slice(0, dashIdx).trim();
      description = text.slice(dashIdx + 3).trim();
    } else if (text.length > 40) {
      title = text.slice(0, 30) + '...';
      description = text;
    }

    parsed.push({
      title,
      description,
      severity: parsed.length === 0 ? 'critical' : 'high',
      mitigation: inferMitigation(text),
    });
  }

  for (const r of risks) {
    const text = String(r || "").trim();
    if (!text) continue;
    parsed.push({
      title: text.length > 40 ? text.slice(0, 30) + '...' : text,
      description: text,
      severity: 'medium',
      mitigation: inferMitigation(text),
    });
  }

  return parsed.slice(0, 6);
}

const severityConfig = {
  critical: {
    label: '严重',
    badgeClass: 'bg-red-500/10 text-red-400 border-red-500/30',
    borderClass: 'border-l-red-500',
    iconColor: 'text-red-500',
    bgHover: 'hover:bg-red-500/5',
  },
  high: {
    label: '较高',
    badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    borderClass: 'border-l-orange-500',
    iconColor: 'text-orange-500',
    bgHover: 'hover:bg-orange-500/5',
  },
  medium: {
    label: '中等',
    badgeClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    borderClass: 'border-l-yellow-500',
    iconColor: 'text-yellow-500',
    bgHover: 'hover:bg-yellow-500/5',
  },
};

const RiskCard = ({ risk, index }: { risk: ParsedRisk; index: number }) => {
  const [expanded, setExpanded] = useState(false);
  const config = severityConfig[risk.severity];

  return (
    <div
      className={`rounded-xl bg-card/50 border border-border/30 border-l-4 ${config.borderClass} transition-all duration-300 ${config.bgHover} cursor-pointer group`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              risk.severity === 'critical' ? 'bg-red-500/10' :
              risk.severity === 'high' ? 'bg-orange-500/10' : 'bg-yellow-500/10'
            }`}>
              <Shield className={`w-3.5 h-3.5 ${config.iconColor}`} />
            </div>
            <span className="text-sm font-medium text-foreground line-clamp-2">{risk.title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.badgeClass}`}>
              {config.label}
            </Badge>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {risk.description && risk.description !== risk.title && !expanded && (
          <p className="text-xs text-muted-foreground/70 pl-[38px] line-clamp-1">{risk.description}</p>
        )}
      </div>

      {/* Expanded: Description + Mitigation */}
      <div className={`overflow-hidden transition-all duration-300 ${expanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 pb-4 space-y-3">
          {risk.description && risk.description !== risk.title && (
            <div className="text-xs text-muted-foreground leading-relaxed pl-[38px] prose prose-invert max-w-none">
              <ReactMarkdown>{risk.description}</ReactMarkdown>
            </div>
          )}
          <div className="ml-[38px] p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 mb-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">缓解建议</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{risk.mitigation}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export function RiskMitigationCards({ weaknesses, risks }: RiskMitigationCardsProps) {
  const parsedRisks = parseRisks(weaknesses, risks);

  if (parsedRisks.length === 0) return null;

  const criticalCount = parsedRisks.filter(r => r.severity === 'critical').length;
  const otherCount = parsedRisks.length - criticalCount;

  return (
    <div className="animate-slide-up" style={{ animationDelay: "250ms" }}>
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold">风险与缓解建议</h3>
            <p className="text-xs text-muted-foreground">点击卡片查看具体缓解策略</p>
          </div>
          <Badge variant="outline" className="text-xs">
            {criticalCount} 严重 · {otherCount} 其他
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {parsedRisks.map((risk, i) => (
            <RiskCard key={i} risk={risk} index={i} />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
