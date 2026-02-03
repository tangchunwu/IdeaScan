import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "./GlassCard";
import { ScoreCircle } from "./ScoreCircle";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SampleReport {
  id: string;
  title: string | null;
  display_order: number;
  validation_id: string;
  validation: {
    id: string;
    idea: string;
    overall_score: number | null;
    tags: string[] | null;
    created_at: string;
  };
}

export function SampleReports() {
  const navigate = useNavigate();

  const { data: samples, isLoading } = useQuery({
    queryKey: ['sample-reports'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-sample-reports');
      
      if (error) {
        console.error('Failed to fetch sample reports:', error);
        return [];
      }
      
      return (data?.samples || []) as SampleReport[];
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="h-6 w-32 bg-muted rounded animate-pulse mb-4" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!samples || samples.length === 0) {
    return null;
  }

  return (
    <div className="mb-8 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">示例报告</h3>
        <Badge variant="secondary" className="text-xs">
          公开
        </Badge>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {samples.map((sample) => (
          <GlassCard
            key={sample.id}
            hover
            className="cursor-pointer"
            onClick={() => navigate(`/report/${sample.validation_id}`)}
          >
            <div className="flex items-center gap-4">
              {/* Score */}
              <div className="flex-shrink-0">
                {sample.validation?.overall_score ? (
                  <ScoreCircle score={sample.validation.overall_score} size="sm" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">N/A</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-foreground mb-1 truncate">
                  {sample.title || sample.validation?.idea?.slice(0, 30) + '...' || '示例报告'}
                </h4>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {sample.validation?.idea || '点击查看完整报告'}
                </p>
                {sample.validation?.tags && sample.validation.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sample.validation.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* View Button */}
              <Button variant="ghost" size="sm" className="flex-shrink-0">
                <Eye className="w-4 h-4" />
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
