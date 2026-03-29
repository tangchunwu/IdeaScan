import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageBackground, GlassCard, Navbar } from "@/components/shared";
import { SkinEmptyState as EmptyState } from "@/components/skin";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Eye, Award, Search } from "lucide-react";

interface GalleryReport {
  id: string;
  idea: string;
  tags: string[];
  overall_score: number;
  share_token: string;
  created_at: string;
}

const fetchGalleryReports = async (): Promise<GalleryReport[]> => {
  const { data, error } = await supabase
    .from("validations")
    .select("id, idea, tags, overall_score, share_token, created_at")
    .not("share_token", "is", null)
    .not("overall_score", "is", null)
    .gte("overall_score", 60)
    .eq("status", "completed")
    .order("overall_score", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as GalleryReport[]) || [];
};

const Gallery = () => {
  useDocumentTitle("报告精选 Gallery — IdeaScan 高分验证报告展示");
  const { data: reports = [], isLoading: loading } = useQuery({
    queryKey: ['gallery-reports'],
    queryFn: fetchGalleryReports,
    staleTime: 5 * 60 * 1000,
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-secondary";
    if (score >= 60) return "text-primary";
    return "text-muted-foreground";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return "极具潜力";
    if (score >= 75) return "值得关注";
    if (score >= 65) return "有一定潜力";
    return "待深入分析";
  };

  return (
    <PageBackground showClouds={false}>
      <Navbar />
      <main className="pt-28 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Award className="w-4 h-4" />
              精选报告 Gallery
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
              探索高分验证报告
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              浏览社区精选的创业验证报告，发现有潜力的需求方向，获取灵感启发
            </p>
          </div>

          {/* Stats */}
          {!loading && reports.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-8 max-w-lg mx-auto animate-slide-up">
              <GlassCard className="text-center py-3">
                <p className="text-2xl font-bold text-primary">{reports.length}</p>
                <p className="text-xs text-muted-foreground">精选报告</p>
              </GlassCard>
              <GlassCard className="text-center py-3">
                <p className="text-2xl font-bold text-secondary">
                  {Math.round(reports.reduce((a, b) => a + b.overall_score, 0) / reports.length)}
                </p>
                <p className="text-xs text-muted-foreground">平均分</p>
              </GlassCard>
              <GlassCard className="text-center py-3">
                <p className="text-2xl font-bold text-foreground">{reports[0]?.overall_score || 0}</p>
                <p className="text-xs text-muted-foreground">最高分</p>
              </GlassCard>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <GlassCard key={i} className="h-full animate-pulse">
                  <div className="flex items-start justify-between mb-3">
                    <Skeleton className="h-5 w-16 rounded" />
                    <Skeleton className="h-8 w-12 rounded" />
                  </div>
                  <Skeleton className="h-5 w-full mb-1 rounded" />
                  <Skeleton className="h-5 w-3/4 mb-4 rounded" />
                  <div className="flex gap-1.5 mb-4">
                    <Skeleton className="h-4 w-12 rounded" />
                    <Skeleton className="h-4 w-14 rounded" />
                    <Skeleton className="h-4 w-10 rounded" />
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-border/30">
                    <Skeleton className="h-3 w-20 rounded" />
                    <Skeleton className="h-3 w-14 rounded" />
                  </div>
                </GlassCard>
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && reports.length === 0 && (
            <EmptyState
              icon={Search}
              title="暂无公开报告"
              description="还没有用户分享他们的验证报告。成为第一个分享者！"
              actionLabel="开始验证"
              actionLink="/validate"
            />
          )}

          {/* Report Grid */}
          {!loading && reports.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.map((report, index) => (
                <Link
                  key={report.id}
                  to={`/share/${report.share_token}`}
                  className="group"
                >
                  <GlassCard
                    hover
                    className="h-full animate-slide-up transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/10"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Badge variant="outline" className={`text-xs ${getScoreColor(report.overall_score)}`}>
                        {getScoreLabel(report.overall_score)}
                      </Badge>
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${getScoreColor(report.overall_score)}`}>
                          {report.overall_score}
                        </span>
                        <span className="text-xs text-muted-foreground">/100</span>
                      </div>
                    </div>

                    <h3 className="font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {report.idea}
                    </h3>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(report.tags || []).slice(0, 3).map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] px-2 py-0 bg-muted/40">
                          #{tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/30">
                      <span className="text-xs text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString("zh-CN")}
                      </span>
                      <span className="text-xs text-primary flex items-center gap-1 group-hover:underline">
                        <Eye className="w-3 h-3" />
                        查看报告
                      </span>
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="text-center mt-12 animate-fade-in">
            <GlassCard className="inline-block px-8 py-6">
              <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="text-lg font-bold mb-2">想让你的报告也出现在这里？</h3>
              <p className="text-sm text-muted-foreground mb-4">
                完成验证后，点击"分享"按钮即可将报告公开展示
              </p>
              <Button asChild className="rounded-full">
                <Link to="/validate">免费开始验证</Link>
              </Button>
            </GlassCard>
          </div>
        </div>
      </main>
    </PageBackground>
  );
};

export default Gallery;
