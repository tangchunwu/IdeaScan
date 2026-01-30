import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Flame,
  TrendingUp,
  Clock,
  Filter,
  X,
  Star,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscoverFiltersProps {
  categories: string[];
  selectedCategory: string | null;
  minHeatScore: number;
  sortBy: 'heat_score' | 'growth_rate' | 'discovered_at' | 'quality_score' | 'validation_count';
  onCategoryChange: (category: string | null) => void;
  onHeatScoreChange: (score: number) => void;
  onSortChange: (sort: 'heat_score' | 'growth_rate' | 'discovered_at' | 'quality_score' | 'validation_count') => void;
  onReset: () => void;
}

export function DiscoverFilters({
  categories,
  selectedCategory,
  minHeatScore,
  sortBy,
  onCategoryChange,
  onHeatScoreChange,
  onSortChange,
  onReset,
}: DiscoverFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasActiveFilters = selectedCategory || minHeatScore > 0 || sortBy !== 'quality_score';

  const sortOptions = [
    { value: 'quality_score', label: '质量优先', icon: Star },
    { value: 'heat_score', label: '热度优先', icon: Flame },
    { value: 'validation_count', label: '已验证', icon: CheckCircle },
    { value: 'discovered_at', label: '最新发现', icon: Clock },
    { value: 'growth_rate', label: '增长优先', icon: TrendingUp },
  ];

  return (
    <div className="space-y-4">
      {/* Quick Filters Row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Sort Selector */}
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as any)}>
          <SelectTrigger className="w-[140px] bg-background/50 backdrop-blur-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  <opt.icon className="w-4 h-4" />
                  {opt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category Pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <Badge
            variant={selectedCategory === null ? "default" : "outline"}
            className="cursor-pointer hover:bg-primary/80 transition-colors"
            onClick={() => onCategoryChange(null)}
          >
            全部
          </Badge>
          {categories.slice(0, 6).map(cat => (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary/80 transition-colors"
              onClick={() => onCategoryChange(cat)}
            >
              {cat}
            </Badge>
          ))}
          {categories.length > 6 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Filter className="w-3 h-3 mr-1" />
              更多筛选
            </Button>
          )}
        </div>

        {/* Reset Button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            重置
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="p-4 rounded-lg bg-muted/30 backdrop-blur-sm border border-border/50 space-y-4">
          {/* More Categories */}
          {categories.length > 6 && (
            <div>
              <div className="text-sm text-muted-foreground mb-2">更多分类</div>
              <div className="flex flex-wrap gap-1">
                {categories.slice(6).map(cat => (
                  <Badge
                    key={cat}
                    variant={selectedCategory === cat ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary/80 transition-colors"
                    onClick={() => onCategoryChange(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Heat Score Filter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">最低热度</span>
              <span className="text-sm font-medium flex items-center gap-1">
                <Flame className={cn(
                  "w-4 h-4",
                  minHeatScore >= 60 ? "text-orange-500" : "text-muted-foreground"
                )} />
                {minHeatScore}°
              </span>
            </div>
            <Slider
              value={[minHeatScore]}
              onValueChange={([value]) => onHeatScoreChange(value)}
              max={100}
              step={10}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>新兴</span>
              <span>升温</span>
              <span>火热</span>
              <span>爆款</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
