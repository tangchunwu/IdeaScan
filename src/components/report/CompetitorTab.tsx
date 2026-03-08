import { ArrowLeft, ExternalLink, Search, Trophy, Shield, ChevronDown } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import type { ReportDataResult } from "./useReportData";
import { MarketResearchSection } from "./MarketResearchSection";
import { CompetitorMatrix } from "./CompetitorMatrix";

interface CompetitorTabProps {
  data: ReportDataResult;
}

interface StructuredCompetitor {
  name: string;
  sources: Array<{ title: string; url: string; snippet: string; source: string; searchType?: string }>;
}

function extractStructuredCompetitors(rows: any[]): { structured: StructuredCompetitor[]; general: any[] } {
  const competitorMap = new Map<string, StructuredCompetitor>();
  const general: any[] = [];

  for (const row of rows) {
    const title = String(row.title || "");
    // Deep search results have pattern: [CompetitorName] Title
    const match = title.match(/^\[(.+?)\]\s*(.*)$/);
    if (match) {
      const name = match[1].trim();
      const cleanTitle = match[2].trim() || title;
      if (!competitorMap.has(name)) {
        competitorMap.set(name, { name, sources: [] });
      }
      const searchType = row.source?.includes('Deep') 
        ? (row.snippet?.includes('定价') || row.snippet?.includes('价格') ? 'pricing' : 'review')
        : undefined;
      competitorMap.get(name)!.sources.push({
        title: cleanTitle,
        url: row.url || "",
        snippet: row.snippet || "",
        source: row.source || "",
        searchType,
      });
    } else {
      general.push(row);
    }
  }

  return { structured: Array.from(competitorMap.values()), general };
}

function CompetitorCard({ competitor, index }: { competitor: StructuredCompetitor; index: number }) {
  const hasPricing = competitor.sources.some(s => s.searchType === 'pricing');
  const hasReview = competitor.sources.some(s => s.searchType === 'review');

  return (
    <GlassCard className="animate-slide-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {competitor.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="font-semibold text-lg text-foreground">{competitor.name}</h4>
              <div className="flex gap-1.5 mt-1">
                {hasPricing && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/50 text-emerald-400">有定价信息</Badge>}
                {hasReview && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/50 text-blue-400">有用户评价</Badge>}
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">{competitor.sources.length} 条来源</Badge>
        </div>

        {/* Show best snippet as summary */}
        {competitor.sources[0]?.snippet && (
          <p className="text-sm text-muted-foreground line-clamp-2 pl-[52px]">
            {competitor.sources[0].snippet}
          </p>
        )}

        {/* Source links */}
        <div className="pl-[52px] flex flex-wrap gap-2">
          {competitor.sources.slice(0, 4).map((s, j) => (
            <a
              key={j}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary/70 hover:text-primary hover:underline flex items-center gap-1 bg-primary/5 rounded-full px-2.5 py-1 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {s.title.slice(0, 30)}{s.title.length > 30 ? '...' : ''}
            </a>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

export function CompetitorTab({ data }: CompetitorTabProps) {
  const { competitorRows, marketAnalysis } = data;
  const [showRaw, setShowRaw] = useState(false);

  if (!competitorRows || competitorRows.length === 0) {
    return (
      <GlassCard className="text-center py-10">
        <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">未找到竞品搜索记录</p>
        <p className="text-xs text-muted-foreground/60 mt-1">请确认已配置搜索 API 密钥（Tavily / Bocha）</p>
      </GlassCard>
    );
  }

  const { structured, general } = extractStructuredCompetitors(competitorRows);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Competition Overview */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <Trophy className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">竞争格局总览</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-xl bg-card/50">
            <div className="text-2xl font-bold text-primary">{competitorRows.length}</div>
            <div className="text-xs text-muted-foreground mt-1">搜索结果</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-card/50">
            <div className="text-2xl font-bold text-foreground">{structured.length}</div>
            <div className="text-xs text-muted-foreground mt-1">识别竞品</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-card/50">
            <div className="text-2xl font-bold text-foreground">
              {marketAnalysis.competitionLevel.includes('高') || marketAnalysis.competitionLevel.includes('激烈') ? '🔴' : 
               marketAnalysis.competitionLevel.includes('低') ? '🟢' : '🟡'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">竞争强度</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-card/50">
            <div className="text-sm font-medium text-foreground">{marketAnalysis.competitionLevel}</div>
            <div className="text-xs text-muted-foreground mt-1">市场判断</div>
          </div>
        </div>
      </GlassCard>

      {/* Structured Competitor Cards */}
      {structured.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground">已识别竞品</h3>
          </div>
          {structured.map((comp, i) => (
            <CompetitorCard key={comp.name} competitor={comp} index={i} />
          ))}
        </div>
      )}

      {/* Market Research Section */}
      <MarketResearchSection items={general} />

      {/* Raw Search Results (collapsible) */}
      {general.length > 0 && (
        <Collapsible open={showRaw} onOpenChange={setShowRaw}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full px-1">
            <ChevronDown className={`w-4 h-4 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
            <Search className="w-4 h-4" />
            <span>原始搜索结果（{general.length} 条）</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-3">
            {general.map((comp: any, i: number) => (
              <GlassCard key={i} padding="sm" className="animate-slide-up" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={comp.source?.toLowerCase().includes('you') ? 'default' : comp.source?.toLowerCase().includes('tavily') ? 'secondary' : 'outline'}
                      className={`${comp.source?.toLowerCase().includes('bocha') ? 'border-orange-500 text-orange-500' : ''} text-xs`}
                    >
                      {comp.source}
                    </Badge>
                    <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      访问 <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <h4 className="font-medium text-sm text-foreground">{comp.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">{comp.snippet}</p>
                </div>
              </GlassCard>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* If no structured competitors found, show all as general */}
      {structured.length === 0 && general.length === 0 && (
        <div className="grid grid-cols-1 gap-4">
          {competitorRows.map((comp: any, i: number) => (
            <GlassCard key={i} padding="sm" className="animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={comp.source?.toLowerCase().includes('you') ? 'default' : comp.source?.toLowerCase().includes('tavily') ? 'secondary' : 'outline'}
                    className={`${comp.source?.toLowerCase().includes('bocha') ? 'border-orange-500 text-orange-500' : ''} text-xs`}
                  >
                    {comp.source}
                  </Badge>
                  <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                    访问 <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <h4 className="font-medium text-sm text-foreground">{comp.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2">{comp.snippet}</p>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
