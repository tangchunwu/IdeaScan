import { Sparkles, Globe, ExternalLink } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";

interface BrandName {
  name: string;
  meaning: string;
  domain: string;
}

interface BrandNameSuggestionsProps {
  brandNames: BrandName[];
}

export function BrandNameSuggestions({ brandNames }: BrandNameSuggestionsProps) {
  if (!brandNames || brandNames.length === 0) return null;

  return (
    <div className="animate-slide-up" style={{ animationDelay: "350ms" }}>
      <GlassCard>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold">品牌名建议</h3>
            <p className="text-xs text-muted-foreground">AI 根据产品定位推荐的品牌名称</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {brandNames.slice(0, 3).map((brand, i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-card/50 border border-white/5 hover:bg-card/70 transition-all space-y-3"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[10px] px-1.5 py-0">
                  #{i + 1}
                </Badge>
                <h4 className="font-bold text-foreground">{brand.name}</h4>
              </div>

              {brand.meaning && (
                <p className="text-xs text-muted-foreground leading-relaxed">{brand.meaning}</p>
              )}

              {brand.domain && (
                <div className="flex items-center gap-2 pt-1">
                  <Globe className="w-3 h-3 text-muted-foreground" />
                  <a
                    href={`https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(brand.domain)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {brand.domain}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
