import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageBackground, GlassCard, Navbar, ScoreCircle, LoadingSpinner, EmptyState, SampleReports } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { Validation } from "@/services/validationService";
import { useValidations, useDeleteValidation } from "@/hooks/useValidation";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Calendar,
  Trash2,
  Eye,
  RefreshCw,
  FileText,
  Filter,
  SortDesc,
  LogIn,
  AlertCircle,
  CheckCircle2,
  Scale,
} from "lucide-react";
import { IdeaComparison } from "@/components/dashboard/IdeaComparison";

const History = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [scoreFilter, setScoreFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const { data: validations = [], isLoading, error: queryError } = useValidations(user?.id);
  const deleteMutation = useDeleteValidation();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Extract error message
  const error = queryError instanceof Error ? queryError.message : queryError ? "Failed to load history" : null;

  // Filter by search and score
  const filteredItems = validations
    .filter(item =>
      item.idea.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .filter(item => {
      if (scoreFilter === "all") return true;
      const score = item.overall_score || 0;
      if (scoreFilter === "high") return score >= 80;
      if (scoreFilter === "medium") return score >= 60 && score < 80;
      if (scoreFilter === "low") return score < 60;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      } else {
        const scoreA = a.overall_score || 0;
        const scoreB = b.overall_score || 0;
        return sortOrder === "desc" ? scoreB - scoreA : scoreA - scoreB;
      }
    });

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent card click
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      toast({
        title: "删除成功",
        description: "验证记录已删除",
      });
      if (selectedIds.has(id)) {
        const next = new Set(selectedIds);
        next.delete(id);
        setSelectedIds(next);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "删除失败";
      toast({
        title: "删除失败",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsBatchDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteMutation.mutateAsync(id)));
      toast({
        title: "批量删除成功",
        description: `已删除 ${selectedIds.size} 条记录`,
      });
      setSelectedIds(new Set());
    } catch (error) {
      toast({
        title: "部分删除失败",
        description: "请刷新重试",
        variant: "destructive",
      });
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Loading state with skeleton
  if (isLoading) {
    return (
      <PageBackground>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8 pl-1">
              <div className="h-8 w-32 bg-muted rounded mb-2 animate-pulse" />
              <div className="h-5 w-48 bg-muted rounded animate-pulse" />
            </div>

            <div className="grid gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 w-full bg-muted/40 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </main>
      </PageBackground>
    );
  }

  // Error State
  if (error) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-4xl mx-auto">
            <EmptyState
              icon={AlertCircle}
              title="加载失败"
              description={error}
              actionLabel="重试"
              onAction={() => window.location.reload()}
            />
          </div>
        </main>
      </PageBackground>
    );
  }

  // Not Logged In State
  if (!authLoading && !user) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          {/* ... existing login prompt, maybe we can reuse EmptyState here too but let's keep it custom for now as it's a specific auth wall */}
          <div className="max-w-lg mx-auto text-center">
            <GlassCard className="animate-fade-in">
              <LogIn className="w-16 h-16 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-4">
                登录查看历史记录
              </h2>
              <p className="text-muted-foreground mb-6">
                登录后可查看你的所有验证记录
              </p>
              <Button asChild size="lg" className="rounded-xl">
                <Link to="/auth">立即登录</Link>
              </Button>
            </GlassCard>
          </div>
        </main>
      </PageBackground>
    );
  }

  return (
    <PageBackground showClouds={false}>
      <Navbar />

      <main className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                  历史记录
                </h1>
                <p className="text-muted-foreground">
                  查看和管理你的验证记录
                </p>
              </div>
              <div className="flex gap-2">
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    className="rounded-xl animate-fade-in"
                    onClick={handleBatchDelete}
                    disabled={isBatchDeleting}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    删除已选 ({selectedIds.size})
                  </Button>
                )}
                <Button asChild className="rounded-xl">
                  <Link to="/validate">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    新建验证
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Search & Filter */}
          <GlassCard className="mb-6 animate-slide-up">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索创意或标签..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl border-border/50 bg-background/50"
                />
              </div>
              <div className="flex gap-2">
                {/* Score Filter Dropdown */}
                <select
                  value={scoreFilter}
                  onChange={(e) => setScoreFilter(e.target.value as "all" | "high" | "medium" | "low")}
                  className="h-10 px-3 rounded-xl border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">全部评分</option>
                  <option value="high">高分 (≥80)</option>
                  <option value="medium">中等 (60-79)</option>
                  <option value="low">低分 (&lt;60)</option>
                </select>

                {/* Sort Dropdown */}
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [by, order] = e.target.value.split("-") as ["date" | "score", "asc" | "desc"];
                    setSortBy(by);
                    setSortOrder(order);
                  }}
                  className="h-10 px-3 rounded-xl border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="date-desc">最新优先</option>
                  <option value="date-asc">最早优先</option>
                  <option value="score-desc">高分优先</option>
                </select>

                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl md:hidden" onClick={toggleAll}>
                  {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <div className="w-4 h-4 border-2 border-muted rounded" />}
                </Button>

                <Button variant="outline" size="sm" className="hidden md:flex rounded-xl" onClick={toggleAll}>
                  {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                      取消全选
                    </>
                  ) : (
                    <>
                      <div className="w-4 h-4 border-2 border-muted rounded mr-2" />
                      全选
                    </>
                  )}
                </Button>
              </div>
            </div>
          </GlassCard>

          {/* Loading State */}
          {isLoading ? (
            <GlassCard className="py-12 animate-slide-up">
              <LoadingSpinner size="lg" text="加载中..." />
            </GlassCard>
          ) : (
            <>
              {/* Sample Reports Section */}
              <SampleReports />

              {/* My Reports Header */}
              {filteredItems.length > 0 && (
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  我的验证记录
                </h3>
              )}

              {/* History List */}
              <div className="space-y-4">
                {filteredItems.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="暂无记录"
                    description={searchQuery ? "没有找到匹配的记录" : "开始你的第一次创意验证吧"}
                    actionLabel="开始验证"
                    actionLink="/validate"
                  />
                ) : (
                  filteredItems.map((item, index) => (
                    <GlassCard
                      key={item.id}
                      hover
                      className="animate-slide-up"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        {/* Checkbox */}
                        <div className="flex items-center justify-center pl-2">
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelection(item.id)}
                            className="w-5 h-5 rounded-md border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                        </div>

                        {/* Score */}
                        <div className="flex-shrink-0" onClick={() => navigate(`/report/${item.id}`)}>
                          {item.overall_score ? (
                            <ScoreCircle score={item.overall_score} size="sm" />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center cursor-pointer">
                              <span className="text-xs text-muted-foreground">
                                {item.status === 'processing' ? '分析中' : '待处理'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/report/${item.id}`)}>
                          <h3 className="font-semibold text-foreground mb-1 truncate">
                            {item.idea}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(item.created_at)}
                            </span>
                            {item.tags.map(tag => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-xs bg-muted/50"
                              >
                                {tag}
                              </Badge>
                            ))}
                            <Badge
                              variant={item.status === 'completed' ? 'default' : 'secondary'}
                              className={item.status === 'completed' ? 'bg-secondary/10 text-secondary' : ''}
                            >
                              {item.status === 'completed' ? '已完成' :
                                item.status === 'processing' ? '分析中' :
                                  item.status === 'failed' ? '失败' : '待处理'}
                            </Badge>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {item.status === 'completed' && (
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="rounded-lg"
                            >
                              <Link to={`/report/${item.id}`}>
                                <Eye className="w-4 h-4 mr-1" />
                                查看
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDelete(item.id, e)}
                            disabled={deletingId === item.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>

              {/* Stats Summary */}
              {filteredItems.length > 0 && (
                <GlassCard className="mt-8 animate-slide-up" style={{ animationDelay: "300ms" }}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-foreground">{validations.length}</div>
                      <div className="text-sm text-muted-foreground">总验证次数</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-secondary">
                        {validations.filter(v => v.overall_score).length > 0
                          ? Math.round(
                            validations
                              .filter(v => v.overall_score)
                              .reduce((acc, item) => acc + (item.overall_score || 0), 0) /
                            validations.filter(v => v.overall_score).length
                          )
                          : '-'
                        }
                      </div>
                      <div className="text-sm text-muted-foreground">平均评分</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-primary">
                        {validations.filter(item => (item.overall_score || 0) >= 80).length}
                      </div>
                      <div className="text-sm text-muted-foreground">高分创意</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-accent">
                        {new Set(validations.flatMap(item => item.tags)).size}
                      </div>
                      <div className="text-sm text-muted-foreground">涉及领域</div>
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* Idea Comparison - 想法对比功能 */}
              {validations.filter(v => v.overall_score && v.status === 'completed').length >= 2 && (
                <div className="mt-8 animate-slide-up" style={{ animationDelay: "400ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Scale className="w-5 h-5 text-primary" />
                    想法对比
                    <span className="text-xs text-muted-foreground font-normal">
                      选择 2-3 个想法进行并排对比
                    </span>
                  </h3>
                  <IdeaComparison />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </PageBackground>
  );
};

export default History;
