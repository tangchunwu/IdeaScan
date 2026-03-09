
import React, { useState } from "react";
import { GlassCard, LoadingSpinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import {
       Radar, Plus, Search, Filter, RefreshCw,
       MessageSquare, TrendingUp, Rocket, BarChart3, ChevronDown, ChevronUp,
       Trash2, Clock, Crosshair
} from "lucide-react";
import { hunterService, ScanJob, NicheOpportunity } from "@/services/hunterService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminMonitorTab from "./AdminMonitorTab";

const STALE_TIME = 5 * 60 * 1000;

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
                                                        {opp.top_sources.map((src, i) => {
                                                               let label = src;
                                                               try { label = new URL(src).hostname.replace(/^www\./, ''); } catch {}
                                                               return (
                                                                      <a key={i} href={src} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-primary hover:underline truncate">
                                                                             🔗 {label}
                                                                      </a>
                                                               );
                                                        })}
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
                            {opp.avg_opportunity_score != null && (
                                   <div className="flex items-center gap-1">
                                          <TrendingUp className="w-3 h-3" />
                                          机会分 {opp.avg_opportunity_score?.toFixed(0)}
                                   </div>
                            )}
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

// === Main Section Component ===

export const HunterSection = () => {
       const [activeTab, setActiveTab] = useState("dashboard");
       const { toast } = useToast();
       const { isAdmin } = useAdminAuth();
       const queryClient = useQueryClient();

       const { data: opportunities = [], isLoading: oppsLoading } = useQuery({
              queryKey: ["hunter-opportunities"],
              queryFn: () => hunterService.getOpportunities(),
              staleTime: STALE_TIME,
       });

       const { data: jobs = [], isLoading: jobsLoading } = useQuery({
              queryKey: ["hunter-scan-jobs"],
              queryFn: () => hunterService.getScanJobs(),
              staleTime: STALE_TIME,
       });

       const isLoading = oppsLoading || jobsLoading;

       const invalidateAll = () => {
              queryClient.invalidateQueries({ queryKey: ["hunter-opportunities"] });
              queryClient.invalidateQueries({ queryKey: ["hunter-scan-jobs"] });
       };

       const toggleJobMutation = useMutation({
              mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) =>
                     hunterService.toggleScanJob(id, status),
              onSuccess: (_data, { status }) => {
                     toast({ title: status === "active" ? "已恢复运行" : "已暂停" });
                     invalidateAll();
              },
              onError: (e: any) => {
                     toast({ title: "操作失败", description: e.message, variant: "destructive" });
              },
       });

       const deleteJobMutation = useMutation({
              mutationFn: (id: string) => hunterService.deleteScanJob(id),
              onSuccess: () => {
                     toast({ title: "已删除" });
                     invalidateAll();
              },
              onError: (e: any) => {
                     toast({ title: "删除失败", description: e.message, variant: "destructive" });
              },
       });

       const [isScanning, setIsScanning] = useState(false);

       const handleManualTrigger = async () => {
              setIsScanning(true);
              try {
                     toast({ title: "🔍 正在深度探索全网趋势...", description: "AI 正在用深度推理模型分析全网热点和商机，预计 30-60 秒。" });
                     const result = await hunterService.triggerHunterScan(undefined, "discover");
                     const count = result?.signals_inserted || 0;
                     if (count === 0 && result?.quota_exhausted) {
                            toast({ title: "⚠️ 今日配额已用完", description: "每日最多采集 100 条信号，请明天再试。" });
                     } else if (count === 0) {
                            toast({ title: "暂无新发现", description: "AI 未发现新的趋势信号，可稍后重试。" });
                     } else {
                            toast({ title: "✅ 探索完成", description: `发现 ${count} 条新趋势信号` });
                     }
                     invalidateAll();
              } catch (e: any) {
                     toast({ title: "探索失败", description: e.message, variant: "destructive" });
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
                                           <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} /> {isScanning ? '探索中...' : '🌐 发现趋势'}
                                    </Button>
                                   <CreateJobDialog onCreated={invalidateAll} />
                            </div>
                     </div>

                     <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                            <TabsList className="bg-white/5 border border-white/10 p-1 flex-wrap h-auto">
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
                                   {jobs.length === 0 ? (
                                          <GlassCard className="py-16 text-center border-dashed">
                                                 <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                                                        <Crosshair className="w-10 h-10 text-primary" />
                                                 </div>
                                                 <h3 className="text-xl font-bold text-foreground mb-2">还没有监控任务</h3>
                                                 <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                                                        创建一个狩猎任务，AI 将持续从全网为你发现痛点和商机
                                                 </p>
                                                 <CreateJobDialog onCreated={invalidateAll} />
                                          </GlassCard>
                                   ) : (
                                          <div className="space-y-4">
                                                 {jobs.map(job => (
                                                        <GlassCard key={job.id} className="p-4">
                                                               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                                      <div className="flex-1 min-w-0">
                                                                             <div className="font-medium text-foreground truncate">{job.keywords.join(", ")}</div>
                                                                             <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                                                    <span>平台: {job.platforms?.join(", ")}</span>
                                                                                    <span>频率: {job.frequency}</span>
                                                                                    {job.last_run_at && (
                                                                                           <span className="inline-flex items-center gap-1">
                                                                                                  <Clock className="w-3 h-3" />
                                                                                                  {formatDistanceToNow(new Date(job.last_run_at), { addSuffix: true, locale: zhCN })}
                                                                                           </span>
                                                                                    )}
                                                                             </div>
                                                                      </div>
                                                                      <div className="flex items-center gap-4 shrink-0">
                                                                             <div className="text-right">
                                                                                    <div className="text-sm font-bold">{job.signals_found}</div>
                                                                                    <div className="text-xs text-muted-foreground">捕获信号</div>
                                                                             </div>
                                                                             <div className="flex items-center gap-2">
                                                                                    <Switch
                                                                                           checked={job.status === "active"}
                                                                                           onCheckedChange={(checked) => {
                                                                                                  toggleJobMutation.mutate({ id: job.id, status: checked ? "active" : "paused" });
                                                                                           }}
                                                                                    />
                                                                                    <Button
                                                                                           variant="ghost"
                                                                                           size="icon"
                                                                                           className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                                           onClick={() => deleteJobMutation.mutate(job.id)}
                                                                                    >
                                                                                           <Trash2 className="w-4 h-4" />
                                                                                    </Button>
                                                                             </div>
                                                                      </div>
                                                               </div>
                                                        </GlassCard>
                                                 ))}
                                          </div>
                                   )}
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
