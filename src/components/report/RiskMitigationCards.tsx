import { AlertTriangle, Shield, ChevronRight } from "lucide-react";
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
  mitigation?: string;
}

function parseRisks(weaknesses: string[], risks: string[]): ParsedRisk[] {
  const parsed: ParsedRisk[] = [];

  // Parse weaknesses as high-severity risks
  for (const w of weaknesses) {
    const text = String(w || "").trim();
    if (!text) continue;
    // Try to split on colon or dash for title/description
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
    });
  }

  // Parse risks as medium-severity
  for (const r of risks) {
    const text = String(r || "").trim();
    if (!text) continue;
    parsed.push({
      title: text.length > 40 ? text.slice(0, 30) + '...' : text,
      description: text,
      severity: 'medium',
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
  },
  high: {
    label: '较高',
    badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    borderClass: 'border-l-orange-500',
    iconColor: 'text-orange-500',
  },
  medium: {
    label: '中等',
    badgeClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    borderClass: 'border-l-yellow-500',
    iconColor: 'text-yellow-500',
  },
};

export function RiskMitigationCards({ weaknesses, risks }: RiskMitigationCardsProps) {
  const parsedRisks = parseRisks(weaknesses, risks);

  if (parsedRisks.length === 0) return null;

  return (
    <div className="animate-slide-up" style={{ animationDelay: "250ms" }}>
      <GlassCard>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold">风险与缓解建议</h3>
            <p className="text-xs text-muted-foreground">基于 AI 分析识别的关键风险因素</p>
          </div>
          <Badge variant="outline" className="ml-auto text-xs">
            {parsedRisks.filter(r => r.severity === 'critical').length} 严重 · {parsedRisks.filter(r => r.severity !== 'critical').length} 其他
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {parsedRisks.map((risk, i) => {
            const config = severityConfig[risk.severity];
            return (
              <div
                key={i}
                className={`p-4 rounded-lg bg-card/50 border border-white/5 border-l-4 ${config.borderClass} transition-all hover:bg-card/70`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className={`w-4 h-4 flex-shrink-0 ${config.iconColor}`} />
                    <span className="text-sm font-medium text-foreground truncate">{risk.title}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${config.badgeClass}`}>
                    {config.label}
                  </Badge>
                </div>
                {risk.description && risk.description !== risk.title && (
                  <div className="text-xs text-muted-foreground leading-relaxed pl-6 prose prose-invert max-w-none line-clamp-3">
                    <ReactMarkdown>{risk.description}</ReactMarkdown>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
