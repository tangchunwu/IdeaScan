
import React, { useState, useEffect } from "react";
import { GlassCard, LoadingSpinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import {
       Radar, Plus, Search, Filter, RefreshCw,
       MessageSquare, TrendingUp, Rocket, BarChart3, ChevronDown, ChevronUp
} from "lucide-react";
import { hunterService, ScanJob, NicheOpportunity, RawMarketSignal } from "@/services/hunterService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/hooks/useAdminAuth";

// === Components ===

const OpportunityCard = ({ opp }: { opp: NicheOpportunity }) => {
       const navigate = useNavigate();
       const [expanded, setExpanded] = useState(false);

       const handleVerify = (e: React.MouseEvent) => {
              e.stopPropagation();
              const ideaContext = `【${opp.title}】\n${opp.description || ""}`;
              navigate(`/validate?idea=${encodeURIComponent(ideaContext)}&auto=true`);
       };

       return (
              <GlassCard
                     className="h-full hover:border-primary/50 transition-colors cursor-pointer group flex flex-col relative overflow-hidden"
                     onClick={() => setExpanded(!expanded)}
              >
                     <div className="flex justify-between items-start mb-4 relative z-10">
                            <Badge variant="outline" className={`${opp.urgency_score && opp.urgency_score >= 80 ? 'border-red-500 text-red-500' : 'text-muted-foreground'}`}>
                                   {opp.urgency_score ? `🔥 ${opp.urgency_score} 紧迫度` : 'New'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{new Date(opp.discovered_at).toLocaleDateString()}</span>
                     </div>

                     <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors relative z-10 flex items-center gap-2">
                            {opp.title}
                            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                     </h3>
                     <p className={`text-sm text-muted-foreground mb-4 flex-1 relative z-10 ${expanded ? '' : 'line-clamp-3'}`}>{opp.description}</p>

                     {expanded && (
                            <div className="space-y-3 mb-4 relative z-10 animate-fade-in">
                                   {opp.category && (
                                          <div className="flex items-center gap-2">
                                                 <span className="text-xs font-medium text-muted-foreground">分类:</span>
                                                 <Badge variant="secondary" className="text-xs">{opp.category}</Badge>
                                          </div>
                                   )}
                                   {opp.top_sources && opp.top_sources.length > 0 && (
                                          <div className="space-y-1">
                                                 <span className="text-xs font-medium text-muted-foreground">信号来源:</span>
                                                 <div className="flex flex-col gap-1">
                                                        {opp.top_sources.map((src, i) => (
                                                               <a key={i} href={src} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-primary hover:underline truncate">
                                                                      🔗 {src}
                                                               </a>
                                                        ))}
                                                 </div>
                                          </div>
                                   )}
                                   <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                          <span>平均机会分: <strong className="text-foreground">{opp.avg_opportunity_score?.toFixed(0) || 'N/A'}</strong></span>
                                          <span>·</span>
                                          <span>市场规模: <strong className="text-foreground">{opp.market_size_est || '未知'}</strong></span>
                                   </div>
                            </div>
                     )}

                     <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4 relative z-10">
                            <div className="flex items-center gap-1">
                                   <MessageSquare className="w-3 h-3" />
                                   {opp.signal_count} 信号
                            </div>
                            <div className="flex items-center gap-1">
                                   <TrendingUp className="w-3 h-3" />
                                   {opp.market_size_est || "未知规模"}
                            </div>
                     </div>

                     <div className="mt-auto pt-4 border-t border-white/5 flex justify-end relative z-10">
                            <Button size="sm" className="gap-2 bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-all" onClick={handleVerify}>
                                   <Rocket className="w-4 h-4" />
                                   立即验证
                            </Button>
                     </div>

                     <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors" />
              </GlassCard>
       );
};

const CreateJobDialog = React.forwardRef<HTMLDivElement, { onCreated: () => void }>(
       ({ onCreated }, ref) => {
       const [open, setOpen] = useState(false);
       const [keywords, setKeywords] = useState("");
       const [description, setDescription] = useState("");
       const [isSubmitting, setIsSubmitting] = useState(false);
       const { toast } = useToast();

       const handleSubmit = async () => {
              if (!keywords.trim() && !description.trim()) return;
              setIsSubmitting(true);
              try {
                     const keywordList = keywords.split(/[,，\n]/).map(k => k.trim()).filter(k => k);
                     await hunterService.createScanJob(keywordList.length > 0 ? keywordList : ["自定义监控"], undefined, description.trim());
                     toast({ title: "任务已创建", description: "AI 将在后台开始深度调研" });
                     setOpen(false);
                     setKeywords("");
                     setDescription("");
                     onCreated();
              } catch (e: any) {
                     toast({ title: "创建失败", description: e.message, variant: "destructive" });
              } finally {
                     setIsSubmitting(false);
              }
       };

       return (
              <Dialog open={open} onOpenChange={setOpen}>
                     <DialogTrigger asChild>
                            <Button className="gap-2">
                                   <Plus className="w-4 h-4" /> 新建监控
                            </Button>
                     </DialogTrigger>
                     <DialogContent>
                            <DialogHeader>
                                   <DialogTitle>新建狩猎任务</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                   <div className="space-y-2">
                                          <Label>🎯 语义描述（推荐）</Label>
                                          <Textarea
                                                 placeholder="用自然语言描述你想监控的方向，例如：&#10;• 帮我关注 Z 世代消费者对美妆工具的不满&#10;• 跟踪远程办公工具的用户流失原因&#10;• 寻找宠物护理行业中付费意愿强但供给不足的需求"
                                                 value={description}
                                                 onChange={e => setDescription(e.target.value)}
                                                 className="min-h-[100px]"
                                          />
                                          <p className="text-xs text-muted-foreground">
                                                 AI 会理解你的意图，从全网深度挖掘相关痛点和商业机会。
                                          </p>
                                   </div>
                                   <div className="space-y-2">
                                          <Label>🔑 关键词（可选，用逗号分隔）</Label>
                                          <Input
                                                 placeholder="例如: 宠物洗澡, 独立开发, Notion模版"
                                                 value={keywords}
                                                 onChange={e => setKeywords(e.target.value)}
                                          />
                                          <p className="text-xs text-muted-foreground">
                                                 补充关键词可以让 AI 搜索更精准，但不是必填的。
                                          </p>
                                   </div>
                            </div>
                            <DialogFooter>
                                   <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
                                   <Button onClick={handleSubmit} disabled={isSubmitting || (!keywords.trim() && !description.trim())}>
                                          {isSubmitting ? "创建中..." : "开始狩猎"}
                                   </Button>
                            </DialogFooter>
                     </DialogContent>
              </Dialog>
       );
});
CreateJobDialog.displayName = "CreateJobDialog";

// === Admin Monitor Tab ===

const AdminMonitorTab = () => {
       const [stats, setStats] = useState<{ total: number; insights: number; highScore: number; citations: number } | null>(null);
       const [signals, setSignals] = useState<RawMarketSignal[]>([]);
       const [loading, setLoading] = useState(true);
       const [expandedId, setExpandedId] = useState<string | null>(null);
       const [isProcessing, setIsProcessing] = useState(false);
       const { toast } = useToast();

       useEffect(() => {
              loadData();
       }, []);

       const loadData = async () => {
              setLoading(true);
              try {
                     const [s, sigs] = await Promise.all([
                            hunterService.getSignalStats(),
                            hunterService.getRecentSignalsForAdmin(15),
                     ]);
                     setStats(s);
                     setSignals(sigs);
              } catch (e) {
                     console.error(e);
              } finally {
                     setLoading(false);
              }
       };

       const handleProcess = async () => {
              setIsProcessing(true);
              try {
                     const result = await hunterService.triggerAIProcessor();
                     toast({
                            title: "✅ 处理完成",
                            description: `处理 ${result?.processed || 0} 条, 失败 ${result?.failed || 0}, 商机 ${result?.opportunities_upserted || 0}`,
                     });
                     loadData();
              } catch (e: any) {
                     toast({ title: "处理失败", description: e.message, variant: "destructive" });
              } finally {
                     setIsProcessing(false);
              }
       };

       if (loading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;

       const contentTypeBadge = (type: string) => {
              const map: Record<string, { label: string; cls: string }> = {
                     insight: { label: "💡 洞察", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
                     intelligence: { label: "🧠 情报", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
                     source_citation: { label: "📎 来源", cls: "bg-muted/20 text-muted-foreground border-muted/30" },
                     post: { label: "📝 帖子", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
              };
              const info = map[type] || { label: type, cls: "text-muted-foreground" };
              return <Badge variant="outline" className={`text-xs ${info.cls}`}>{info.label}</Badge>;
       };

       return (
              <div className="space-y-6">
                     {/* Stats Cards */}
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                   { label: "总信号数", value: stats?.total || 0, emoji: "📡" },
                                   { label: "洞察/情报", value: stats?.insights || 0, emoji: "💡" },
                                   { label: "高分信号 (≥70)", value: stats?.highScore || 0, emoji: "🔥" },
                                   { label: "来源引用", value: stats?.citations || 0, emoji: "📎" },
                            ].map(s => (
                                   <GlassCard key={s.label} className="text-center py-4">
                                          <div className="text-2xl mb-1">{s.emoji}</div>
                                          <div className="text-2xl font-bold text-foreground">{s.value}</div>
                                          <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                                   </GlassCard>
                            ))}
                     </div>

                     {/* Actions */}
                     <div className="flex gap-3">
                            <Button variant="outline" size="sm" onClick={handleProcess} disabled={isProcessing} className="gap-2">
                                   <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                                   {isProcessing ? "处理中..." : "触发 AI 处理"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
                                   <RefreshCw className="w-4 h-4" /> 刷新
                            </Button>
                     </div>

                     {/* Recent Signals */}
                     <GlassCard>
                            <h4 className="font-bold text-foreground mb-4">最近信号</h4>
                            <div className="space-y-2">
                                   {signals.map(sig => (
                                          <div
                                                 key={sig.id}
                                                 className="p-3 border border-white/5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                                                 onClick={() => setExpandedId(expandedId === sig.id ? null : sig.id)}
                                          >
                                                 <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                               {contentTypeBadge(sig.content_type)}
                                                               <Badge variant="outline" className={`text-xs ${hunterService.getPlatformInfo(sig.source).bg} ${hunterService.getPlatformInfo(sig.source).color}`}>
                                                                      {hunterService.getPlatformInfo(sig.source).label}
                                                               </Badge>
                                                               {sig.opportunity_score != null && (
                                                                      <span className={`text-xs font-mono ${sig.opportunity_score >= 70 ? 'text-green-400' : 'text-muted-foreground'}`}>
                                                                             {sig.opportunity_score}分
                                                                      </span>
                                                               )}
                                                               <span className="text-xs text-muted-foreground truncate">
                                                                      {sig.content.slice(0, 60)}...
                                                               </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                               <span className="text-xs text-muted-foreground">
                                                                      {new Date(sig.scanned_at).toLocaleString()}
                                                               </span>
                                                               {expandedId === sig.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                        </div>
                                                 </div>
                                                 {expandedId === sig.id && (
                                                        <div className="mt-3 p-3 bg-muted/10 rounded text-sm text-muted-foreground whitespace-pre-wrap">
                                                               {sig.content}
                                                               {sig.source_url && (
                                                                      <div className="mt-2">
                                                                             <a href={sig.source_url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs">
                                                                                    🔗 原文链接
                                                                             </a>
                                                                      </div>
                                                               )}
                                                               {sig.topic_tags && sig.topic_tags.length > 0 && (
                                                                      <div className="mt-2 flex gap-1 flex-wrap">
                                                                             {sig.topic_tags.map(t => (
                                                                                    <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                                                                             ))}
                                                                      </div>
                                                               )}
                                                        </div>
                                                 )}
                                          </div>
                                   ))}
                            </div>
                     </GlassCard>
              </div>
       );
};

// === Main Section Component ===

export const HunterSection = () => {
       const [activeTab, setActiveTab] = useState("dashboard");
       const [isLoading, setIsLoading] = useState(true);
       const [opportunities, setOpportunities] = useState<NicheOpportunity[]>([]);
       const [jobs, setJobs] = useState<ScanJob[]>([]);
       const { toast } = useToast();
       const { isAdmin } = useAdminAuth();

       const refreshData = async () => {
              setIsLoading(true);
              try {
                     const [oppsData, jobsData] = await Promise.all([
                            hunterService.getOpportunities(),
                            hunterService.getScanJobs()
                     ]);
                     setOpportunities(oppsData || []);
                     setJobs(jobsData || []);
              } catch (e) {
                     console.error(e);
                     toast({ title: "加载失败", variant: "destructive" });
              } finally {
                     setIsLoading(false);
              }
       };

       useEffect(() => {
              refreshData();
       }, []);

	const [isScanning, setIsScanning] = useState(false);

	const handleManualTrigger = async () => {
		setIsScanning(true);
		try {
			toast({ title: "🔍 正在扫描全网情报...", description: "AI 正在搜索公开网络中的痛点和机会，预计 15-30 秒。" });
			const result = await hunterService.triggerHunterScan();
			toast({
				title: "✅ 扫描完成",
				description: `发现 ${result?.signals_inserted || 0} 条新信号`,
			});
			refreshData();
		} catch (e: any) {
			toast({ title: "扫描失败", description: e.message, variant: "destructive" });
		} finally {
			setIsScanning(false);
		}
	};

       return (
              <div className="animate-fade-in">
                     <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                            <div>
                                   <div className="flex items-center gap-2 mb-2">
                                          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                                                 Beta
                                          </Badge>
                                   </div>
                                   <h2 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-3">
                                          <Radar className="w-6 h-6 text-primary" />
                                          狩猎雷达 <span className="text-muted-foreground font-light text-lg">Hunter</span>
                                   </h2>
                                   <p className="text-muted-foreground mt-2 max-w-xl text-sm">
                                          24小时不间断扫描全网痛点，为您发现下一个独角兽机会。
                                   </p>
                            </div>

                            <div className="flex gap-3">
                                   <Button variant="outline" onClick={handleManualTrigger} disabled={isScanning} className="gap-2">
                                          <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} /> {isScanning ? '扫描中...' : '立即扫描'}
                                   </Button>
                                   <CreateJobDialog onCreated={refreshData} />
                            </div>
                     </div>

                     <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                            <TabsList className="bg-white/5 border border-white/10 p-1">
                                   <TabsTrigger value="dashboard" className="gap-2"><Radar className="w-4 h-4" /> 商机发现</TabsTrigger>
                                   <TabsTrigger value="jobs" className="gap-2"><Filter className="w-4 h-4" /> 监控任务</TabsTrigger>
                                   {isAdmin && (
                                          <TabsTrigger value="monitor" className="gap-2"><BarChart3 className="w-4 h-4" /> 📊 数据监控</TabsTrigger>
                                   )}
                            </TabsList>

                            {/* Dashboard Tab - Only opportunities */}
                            <TabsContent value="dashboard" className="animate-slide-up space-y-8">
                                   <section>
                                          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                                 <TrendingUp className="w-5 h-5 text-green-500" />
                                                 潜力机会 (Top Picks)
                                          </h3>
                                          {isLoading ? (
                                                 <div className="py-20 flex justify-center"><LoadingSpinner /></div>
                                          ) : opportunities.length === 0 ? (
                                                 <GlassCard className="py-12 text-center text-muted-foreground border-dashed">
                                                        <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                                               <Search className="w-8 h-8 opacity-20" />
                                                        </div>
                                                        <h3 className="text-lg font-medium mb-2">暂无发现</h3>
                                                        <p>请先创建监控任务，Hunter 需要积累一些数据才能利用 AI 挖掘机会。</p>
                                                 </GlassCard>
                                          ) : (
                                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        {opportunities.map(opp => (
                                                               <OpportunityCard key={opp.id} opp={opp} />
                                                        ))}
                                                 </div>
                                          )}
                                   </section>
                            </TabsContent>

                            {/* Jobs Tab */}
                            <TabsContent value="jobs" className="animate-slide-up">
                                   <GlassCard>
                                          <div className="space-y-4">
                                                 {jobs.length === 0 ? (
                                                        <div className="text-center py-10 text-muted-foreground">未配置监控任务</div>
                                                 ) : (
                                                        jobs.map(job => (
                                                               <div key={job.id} className="flex items-center justify-between p-4 border-b border-white/5 last:border-0">
                                                                      <div>
                                                                             <div className="font-medium text-foreground">{job.keywords.join(", ")}</div>
                                                                             <div className="text-xs text-muted-foreground mt-1">
                                                                                    平台: {job.platforms?.join(", ")} • 频率: {job.frequency}
                                                                             </div>
                                                                      </div>
                                                                      <div className="flex items-center gap-4">
                                                                             <div className="text-right">
                                                                                    <div className="text-sm font-bold">{job.signals_found}</div>
                                                                                    <div className="text-xs text-muted-foreground">捕获信号</div>
                                                                             </div>
                                                                             <Badge variant={job.status === "active" ? "default" : "secondary"}>
                                                                                    {job.status === "active" ? "运行中" : "已暂停"}
                                                                             </Badge>
                                                                      </div>
                                                               </div>
                                                        ))
                                                 )}
                                          </div>
                                   </GlassCard>
                            </TabsContent>

                            {/* Admin Monitor Tab */}
                            {isAdmin && (
                                   <TabsContent value="monitor" className="animate-slide-up">
                                          <AdminMonitorTab />
                                   </TabsContent>
                            )}
                     </Tabs>
              </div>
       );
};
