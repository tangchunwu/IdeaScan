import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageBackground, BrandLoader } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, TrendingUp, Users, Calendar } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface FeedbackItem {
  id: string;
  user_id: string | null;
  rating: number;
  feedback_text: string | null;
  page_url: string | null;
  created_at: string;
}

interface FeedbackStats {
  total: number;
  avgRating: number;
  withText: number;
  todayCount: number;
  ratingDistribution: Record<number, number>;
}

const FeedbackDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useAdminAuth();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats>({
    total: 0,
    avgRating: 0,
    withText: 0,
    todayCount: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, isLoading, navigate]);

  useEffect(() => {
    const fetchFeedback = async () => {
      if (!isAdmin) return;

      try {
        const { data, error } = await supabase
          .from('user_feedback')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        setFeedback(data || []);

        // Calculate stats
        if (data && data.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
          
          let totalRating = 0;
          let withTextCount = 0;
          let todayCount = 0;

          data.forEach((item) => {
            totalRating += item.rating;
            ratingDist[item.rating] = (ratingDist[item.rating] || 0) + 1;
            if (item.feedback_text) withTextCount++;
            if (item.created_at.startsWith(today)) todayCount++;
          });

          setStats({
            total: data.length,
            avgRating: totalRating / data.length,
            withText: withTextCount,
            todayCount,
            ratingDistribution: ratingDist,
          });
        }
      } catch (error) {
        console.error('Error fetching feedback:', error);
      } finally {
        setLoadingData(false);
      }
    };

    if (isAdmin) {
      fetchFeedback();
    }
  }, [isAdmin]);

  if (isLoading) {
    return <BrandLoader />;
  }

  if (!isAdmin) {
    return null;
  }

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    );
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (rating >= 3) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-red-500/10 text-red-500 border-red-500/20";
  };

  return (
    <PageBackground>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">用户反馈管理</h1>
          <p className="text-muted-foreground mt-2">查看和分析用户反馈数据</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">总反馈数</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.withText} 条包含文字反馈
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">平均评分</CardTitle>
              <Star className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgRating.toFixed(1)}</div>
              <div className="flex gap-1 mt-1">
                {renderStars(Math.round(stats.avgRating))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">今日反馈</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todayCount}</div>
              <p className="text-xs text-muted-foreground mt-1">今天收到的反馈</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">评分分布</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-1 items-end h-8">
                {[1, 2, 3, 4, 5].map((rating) => {
                  const count = stats.ratingDistribution[rating] || 0;
                  const maxCount = Math.max(...Object.values(stats.ratingDistribution), 1);
                  const height = (count / maxCount) * 100;
                  return (
                    <div
                      key={rating}
                      className="flex-1 bg-primary/20 rounded-t relative group"
                      style={{ height: `${Math.max(height, 10)}%` }}
                    >
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <span key={rating} className="flex-1 text-center text-xs text-muted-foreground">
                    {rating}★
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feedback Table */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              最近反馈
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : feedback.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无反馈数据
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">评分</TableHead>
                      <TableHead>反馈内容</TableHead>
                      <TableHead className="w-[120px]">页面</TableHead>
                      <TableHead className="w-[100px]">用户</TableHead>
                      <TableHead className="w-[150px]">时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedback.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Badge variant="outline" className={getRatingColor(item.rating)}>
                            {item.rating} ★
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[400px]">
                          {item.feedback_text ? (
                            <span className="line-clamp-2">{item.feedback_text}</span>
                          ) : (
                            <span className="text-muted-foreground italic">无文字反馈</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {item.page_url || '/'}
                          </code>
                        </TableCell>
                        <TableCell>
                          {item.user_id ? (
                            <span className="text-xs font-mono">{item.user_id.slice(0, 8)}...</span>
                          ) : (
                            <Badge variant="secondary">匿名</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(item.created_at), 'MM-dd HH:mm', { locale: zhCN })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageBackground>
  );
};

export default FeedbackDashboard;
