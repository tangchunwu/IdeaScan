import { useState } from "react";
import { ExternalLink, Database, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
       Dialog,
       DialogContent,
       DialogHeader,
       DialogTitle,
       DialogClose,
} from "@/components/ui/dialog";
import { GlassCard } from "@/components/shared";

interface SourceItem {
       id: string;
       platform: "xiaohongshu" | "douyin" | "weibo" | "zhihu";
       title: string;
       url: string;
       excerpt?: string;
       author?: string;
       likes?: number;
       comments?: number;
       publishedAt?: string;
}

interface DataSourceCardProps {
       sources: SourceItem[];
       totalSamples: number;
       className?: string;
}

const platformConfig = {
       xiaohongshu: { name: "小红书", color: "bg-red-500", icon: "📕" },
       douyin: { name: "抖音", color: "bg-black", icon: "🎵" },
       weibo: { name: "微博", color: "bg-orange-500", icon: "📢" },
       zhihu: { name: "知乎", color: "bg-blue-500", icon: "💡" },
};

export const DataSourceCard = ({
       sources,
       totalSamples,
       className = "",
}: DataSourceCardProps) => {
       const [selectedSource, setSelectedSource] = useState<SourceItem | null>(null);
       const [showAll, setShowAll] = useState(false);

       // Group sources by platform
       const platformCounts = sources.reduce((acc, source) => {
              acc[source.platform] = (acc[source.platform] || 0) + 1;
              return acc;
       }, {} as Record<string, number>);

       const displaySources = showAll ? sources : sources.slice(0, 5);

       return (
              <>
                     <GlassCard className={`p-6 ${className}`}>
                            <div className="flex items-center justify-between mb-4">
                                   <div className="flex items-center gap-3">
                                          <div className="p-2 rounded-xl bg-secondary/10">
                                                 <Database className="w-5 h-5 text-secondary" />
                                          </div>
                                          <div>
                                                 <h3 className="font-semibold text-lg">数据来源</h3>
                                                 <p className="text-sm text-muted-foreground">
                                                        共采集 {totalSamples} 条样本
                                                 </p>
                                          </div>
                                   </div>
                            </div>

                            {/* Platform Distribution */}
                            <div className="flex flex-wrap gap-2 mb-4">
                                   {Object.entries(platformCounts).map(([platform, count]) => {
                                          const config = platformConfig[platform as keyof typeof platformConfig];
                                          return (
                                                 <Badge
                                                        key={platform}
                                                        variant="secondary"
                                                        className="flex items-center gap-1.5 px-3 py-1"
                                                 >
                                                        <span>{config?.icon || "📊"}</span>
                                                        <span>{config?.name || platform}</span>
                                                        <span className="font-bold">{count}</span>
                                                 </Badge>
                                          );
                                   })}
                            </div>

                            {/* Source List */}
                            <div className="space-y-2">
                                   {displaySources.map((source) => {
                                          const config = platformConfig[source.platform];
                                          return (
                                                 <div
                                                        key={source.id}
                                                        className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors group"
                                                 >
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                               <span className="text-lg">{config?.icon || "📊"}</span>
                                                               <div className="flex-1 min-w-0">
                                                                      <p className="text-sm font-medium truncate">{source.title}</p>
                                                                      {source.author && (
                                                                             <p className="text-xs text-muted-foreground">@{source.author}</p>
                                                                      )}
                                                               </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                               <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      onClick={() => setSelectedSource(source)}
                                                                      className="h-8 w-8 p-0"
                                                               >
                                                                      <Eye className="w-4 h-4" />
                                                               </Button>
                                                               <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      asChild
                                                                      className="h-8 w-8 p-0"
                                                               >
                                                                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                                                                             <ExternalLink className="w-4 h-4" />
                                                                      </a>
                                                               </Button>
                                                        </div>
                                                 </div>
                                          );
                                   })}
                            </div>

                            {sources.length > 5 && (
                                   <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setShowAll(!showAll)}
                                          className="w-full mt-3"
                                   >
                                          {showAll ? "收起" : `查看全部 ${sources.length} 条`}
                                   </Button>
                            )}
                     </GlassCard>

                     {/* Source Detail Dialog */}
                     <Dialog open={!!selectedSource} onOpenChange={() => setSelectedSource(null)}>
                            <DialogContent className="sm:max-w-lg">
                                   <DialogHeader>
                                          <DialogTitle className="flex items-center gap-2">
                                                 <span>{platformConfig[selectedSource?.platform || "xiaohongshu"]?.icon}</span>
                                                 原帖详情
                                          </DialogTitle>
                                   </DialogHeader>

                                   {selectedSource && (
                                          <div className="space-y-4">
                                                 <div>
                                                        <h4 className="font-medium mb-2">{selectedSource.title}</h4>
                                                        {selectedSource.excerpt && (
                                                               <p className="text-sm text-muted-foreground leading-relaxed">
                                                                      {selectedSource.excerpt}
                                                               </p>
                                                        )}
                                                 </div>

                                                 <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                                        {selectedSource.author && (
                                                               <span>作者: @{selectedSource.author}</span>
                                                        )}
                                                        {selectedSource.likes !== undefined && (
                                                               <span>❤️ {selectedSource.likes}</span>
                                                        )}
                                                        {selectedSource.comments !== undefined && (
                                                               <span>💬 {selectedSource.comments}</span>
                                                        )}
                                                        {selectedSource.publishedAt && (
                                                               <span>📅 {selectedSource.publishedAt}</span>
                                                        )}
                                                 </div>

                                                 <Button asChild className="w-full">
                                                        <a href={selectedSource.url} target="_blank" rel="noopener noreferrer">
                                                               <ExternalLink className="w-4 h-4 mr-2" />
                                                               查看原帖
                                                        </a>
                                                 </Button>
                                          </div>
                                   )}
                            </DialogContent>
                     </Dialog>
              </>
       );
};

export default DataSourceCard;
