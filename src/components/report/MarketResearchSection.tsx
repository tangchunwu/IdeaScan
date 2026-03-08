import { Newspaper, Rocket, ExternalLink, ChevronDown } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface MarketResearchSectionProps {
  items: any[];
}

// Domain-based classification for search results
const NEWS_DOMAINS = [
  "36kr.com", "huxiu.com", "pingwest.com", "geekpark.net", "tmtpost.com",
  "ifanr.com", "leiphone.com", "jiqizhixin.com", "techcrunch.com",
  "thenextweb.com", "venturebeat.com", "wired.com", "theverge.com",
  "arstechnica.com", "zdnet.com", "reuters.com", "bloomberg.com",
  "cnbc.com", "forbes.com", "163.com", "sina.com", "qq.com", "sohu.com",
];

const PRODUCT_DOMAINS = [
  "producthunt.com", "ycombinator.com", "indiehackers.com",
  "github.com", "v2ex.com", "juejin.cn", "sspai.com",
  "appinn.com", "alternativeto.com", "g2.com", "capterra.com",
];

type CategoryType = "news" | "product" | "other";

function categorizeByDomain(url: string): CategoryType {
  if (!url) return "other";
  const lower = url.toLowerCase();
  if (NEWS_DOMAINS.some(d => lower.includes(d))) return "news";
  if (PRODUCT_DOMAINS.some(d => lower.includes(d))) return "product";
  return "other";
}

function CategoryIcon({ type }: { type: CategoryType }) {
  if (type === "news") return <Newspaper className="w-4 h-4 text-amber-400" />;
  if (type === "product") return <Rocket className="w-4 h-4 text-emerald-400" />;
  return null;
}

const categoryConfig: Record<CategoryType, { label: string; badgeClass: string }> = {
  news: { label: "行业资讯", badgeClass: "border-amber-500/50 text-amber-400" },
  product: { label: "产品案例", badgeClass: "border-emerald-500/50 text-emerald-400" },
  other: { label: "其他", badgeClass: "" },
};

function ResultCard({ item }: { item: any }) {
  const category = categorizeByDomain(item.url);
  const config = categoryConfig[category];

  return (
    <div className="p-3 rounded-xl bg-card/50 border border-white/5 hover:bg-card/70 transition-all">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <CategoryIcon type={category} />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.badgeClass}`}>
              {config.label}
            </Badge>
            {item.source && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                {item.source}
              </Badge>
            )}
          </div>
          <h4 className="font-medium text-sm text-foreground line-clamp-1">{item.title}</h4>
          {item.snippet && (
            <p className="text-xs text-muted-foreground line-clamp-2">{item.snippet}</p>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary/70 hover:text-primary hover:underline flex items-center gap-1 w-fit"
            >
              <ExternalLink className="w-3 h-3" />
              查看来源
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function MarketResearchSection({ items }: MarketResearchSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!items || items.length === 0) return null;

  const newsItems = items.filter(i => categorizeByDomain(i.url) === "news");
  const productItems = items.filter(i => categorizeByDomain(i.url) === "product");
  const hasResearch = newsItems.length > 0 || productItems.length > 0;

  if (!hasResearch) return null;

  const displayItems = [...newsItems, ...productItems];
  const previewCount = 4;
  const hasMore = displayItems.length > previewCount;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Newspaper className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-muted-foreground">市场研究资讯</h3>
        <Badge variant="secondary" className="text-[10px]">
          {newsItems.length} 资讯 · {productItems.length} 案例
        </Badge>
      </div>

      <GlassCard>
        <div className="space-y-3">
          {displayItems.slice(0, previewCount).map((item, i) => (
            <ResultCard key={i} item={item} />
          ))}

          {hasMore && (
            <Collapsible open={expanded} onOpenChange={setExpanded}>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-2">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                <span>{expanded ? '收起' : `展开更多（${displayItems.length - previewCount} 条）`}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-3">
                {displayItems.slice(previewCount).map((item, i) => (
                  <ResultCard key={i + previewCount} item={item} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
