import { ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import type { ReportDataResult } from "./useReportData";

interface CompetitorTabProps {
  data: ReportDataResult;
}

export function CompetitorTab({ data }: CompetitorTabProps) {
  const { competitorRows } = data;

  if (!competitorRows || competitorRows.length === 0) {
    return (
      <GlassCard className="text-center py-10">
        <p className="text-muted-foreground">未找到竞品搜索记录</p>
      </GlassCard>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {competitorRows.map((comp: any, i: number) => (
        <GlassCard key={i} className="animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Badge
                  variant={comp.source?.toLowerCase().includes('you') ? 'default' : comp.source?.toLowerCase().includes('tavily') ? 'secondary' : 'outline'}
                  className={`${comp.source?.toLowerCase().includes('bocha') ? 'border-orange-500 text-orange-500' : ''} text-xs`}
                >
                  {comp.source}
                </Badge>
              </div>
              <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                访问链接 <ArrowLeft className="w-3 h-3 rotate-180" />
              </a>
            </div>
            <h4 className="font-semibold text-lg text-foreground mt-1">{comp.title}</h4>
            <p className="text-sm text-muted-foreground line-clamp-3">{comp.snippet}</p>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
