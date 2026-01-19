import { useState } from "react";
import { Link } from "react-router-dom";
import { PageBackground, GlassCard, Navbar, ScoreCircle } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Calendar,
  Trash2,
  Eye,
  RefreshCw,
  FileText,
  Filter,
  SortDesc,
} from "lucide-react";

// 模拟历史数据
const mockHistoryData = [
  {
    id: "1",
    idea: "开一家专门做猫咪主题下午茶的咖啡店",
    score: 78,
    createdAt: "2024-01-15",
    status: "completed",
    tags: ["餐饮", "宠物"],
  },
  {
    id: "2",
    idea: "设计一款帮助职场人管理时间的APP",
    score: 85,
    createdAt: "2024-01-14",
    status: "completed",
    tags: ["科技", "效率工具"],
  },
  {
    id: "3",
    idea: "做手工皮具定制的网店",
    score: 62,
    createdAt: "2024-01-12",
    status: "completed",
    tags: ["电商", "手工艺"],
  },
  {
    id: "4",
    idea: "开发一个本地美食探店小程序",
    score: 71,
    createdAt: "2024-01-10",
    status: "completed",
    tags: ["餐饮", "科技"],
  },
  {
    id: "5",
    idea: "创办线上瑜伽课程平台",
    score: 88,
    createdAt: "2024-01-08",
    status: "completed",
    tags: ["健身", "教育"],
  },
];

const History = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [historyItems, setHistoryItems] = useState(mockHistoryData);

  const filteredItems = historyItems.filter(item =>
    item.idea.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleDelete = (id: string) => {
    setHistoryItems(historyItems.filter(item => item.id !== id));
  };

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
              <Button asChild className="rounded-xl">
                <Link to="/validate">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  新建验证
                </Link>
              </Button>
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
                <Button variant="outline" size="icon" className="rounded-xl">
                  <Filter className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="rounded-xl">
                  <SortDesc className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </GlassCard>

          {/* History List */}
          <div className="space-y-4">
            {filteredItems.length === 0 ? (
              <GlassCard className="text-center py-12 animate-slide-up">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  暂无记录
                </h3>
                <p className="text-muted-foreground mb-6">
                  {searchQuery ? "没有找到匹配的记录" : "开始你的第一次创意验证吧"}
                </p>
                <Button asChild className="rounded-xl">
                  <Link to="/validate">开始验证</Link>
                </Button>
              </GlassCard>
            ) : (
              filteredItems.map((item, index) => (
                <GlassCard 
                  key={item.id} 
                  hover
                  className="animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Score */}
                    <div className="flex-shrink-0">
                      <ScoreCircle score={item.score} size="sm" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground mb-1 truncate">
                        {item.idea}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {item.createdAt}
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
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
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
                  <div className="text-2xl font-bold text-foreground">{historyItems.length}</div>
                  <div className="text-sm text-muted-foreground">总验证次数</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-secondary">
                    {Math.round(historyItems.reduce((acc, item) => acc + item.score, 0) / historyItems.length)}
                  </div>
                  <div className="text-sm text-muted-foreground">平均评分</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">
                    {historyItems.filter(item => item.score >= 80).length}
                  </div>
                  <div className="text-sm text-muted-foreground">高分创意</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-accent">
                    {new Set(historyItems.flatMap(item => item.tags)).size}
                  </div>
                  <div className="text-sm text-muted-foreground">涉及领域</div>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </main>
    </PageBackground>
  );
};

export default History;
