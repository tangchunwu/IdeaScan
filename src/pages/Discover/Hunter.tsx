
import { useState, useEffect } from "react";
import { PageBackground, Navbar, GlassCard, LoadingSpinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import {
        Radar, Plus, Search, Filter, RefreshCw, Radio,
        MessageSquare, ExternalLink, TrendingUp, AlertTriangle, Rocket
} from "lucide-react";
import { hunterService, RawMarketSignal, ScanJob, NicheOpportunity } from "@/services/hunterService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// === Components ===

const OpportunityCard = ({ opp }: { opp: NicheOpportunity }) => {
        const navigate = useNavigate();

        const handleVerify = (e: React.MouseEvent) => {
                e.stopPropagation();
                // Combine title and description for a rich context
                const ideaContext = `【${opp.title}】\n${opp.description || ""}`;
                navigate(`/validate?idea=${encodeURIComponent(ideaContext)}&auto=true`);
        };

        return (
                <GlassCard className="h-full hover:border-primary/50 transition-colors cursor-pointer group flex flex-col relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4 relative z-10">
                                <Badge variant="outline" className={`${opp.urgency_score && opp.urgency_score >= 80 ? 'border-red-500 text-red-500' : 'text-muted-foreground'
                                        }`}>
                                        {opp.urgency_score ? `🔥 ${opp.urgency_score} 紧迫度` : 'New'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{new Date(opp.discovered_at).toLocaleDateString()}</span>
                        </div>

                        <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors relative z-10">{opp.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1 relative z-10">{opp.description}</p>

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

                        {/* Decorative gradient */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors" />
                </GlassCard>
        );
};

const SignalCard = ({ signal }: { signal: RawMarketSignal }) => {
        const platform = hunterService.getPlatformInfo(signal.source);

        return (
                <div className="p-4 rounded-lg bg-card/50 border border-white/5 hover:bg-card/80 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className={`text-xs ${platform.color} ${platform.bg} border-0`}>
                                                {platform.label}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">{new Date(signal.scanned_at).toLocaleDateString()}</span>
                                </div>
                                {signal.opportunity_score && (
                                        <span className={`text-xs font-bold ${signal.opportunity_score >= 80 ? 'text-green-500' :
                                                signal.opportunity_score >= 50 ? 'text-yellow-500' : 'text-muted-foreground'
                                                }`}>
                                                {signal.opportunity_score}分
                                        </span>
                                )}
                        </div>
                        <p className="text-sm text-foreground/90 line-clamp-3 mb-3">{signal.content}</p>
                        <div className="flex items-center gap-3">
                                {signal.source_url && (
                                        <a href={signal.source_url} target="_blank" rel="noopener noreferrer"
                                                className="text-xs text-primary hover:underline flex items-center gap-1">
                                                <ExternalLink className="w-3 h-3" /> 原文
                                        </a>
                                )}
                                <div className="flex gap-1">
                                        {(signal.topic_tags as string[])?.slice(0, 3).map((tag, i) => (
                                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/20 text-secondary-foreground">
                                                        #{tag}
                                                </span>
                                        ))}
                                </div>
                        </div>
                </div>
        );
};

const CreateJobDialog = ({ onCreated }: { onCreated: () => void }) => {
        const [open, setOpen] = useState(false);
        const [keywords, setKeywords] = useState("");
        const [isSubmitting, setIsSubmitting] = useState(false);
        const { toast } = useToast();

        const handleSubmit = async () => {
                if (!keywords.trim()) return;
                setIsSubmitting(true);
                try {
                        const keywordList = keywords.split(/[,，\n]/).map(k => k.trim()).filter(k => k);
                        await hunterService.createScanJob(keywordList);
                        toast({ title: "任务已创建", description: "爬虫将在后台开始运行" });
                        setOpen(false);
                        setKeywords("");
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
                                                <Label>监控关键词 (用逗号分隔)</Label>
                                                <Input
                                                        placeholder="例如: 宠物洗澡, 独立开发, Notion模版"
                                                        value={keywords}
                                                        onChange={e => setKeywords(e.target.value)}
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                        我们将自动扫描 Reddit 和 小红书 上关于这些关键词的抱怨和求助。
                                                </p>
                                        </div>
                                </div>
                                <DialogFooter>
                                        <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
                                        <Button onClick={handleSubmit} disabled={isSubmitting}>
                                                {isSubmitting ? "创建中..." : "开始狩猎"}
                                        </Button>
                                </DialogFooter>
                        </DialogContent>
                </Dialog>
        );
};

// === Main Page ===

const Hunter = () => {
        const [activeTab, setActiveTab] = useState("dashboard");
        const [isLoading, setIsLoading] = useState(true);
        const [signals, setSignals] = useState<RawMarketSignal[]>([]);
        const [opportunities, setOpportunities] = useState<NicheOpportunity[]>([]);
        const [jobs, setJobs] = useState<ScanJob[]>([]);
        const { toast } = useToast();

        const refreshData = async () => {
                setIsLoading(true);
                try {
                        const [signalsData, oppsData, jobsData] = await Promise.all([
                                hunterService.getRecentSignals(20),
                                hunterService.getOpportunities(),
                                hunterService.getScanJobs()
                        ]);
                        setSignals(signalsData || []);
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

        const handleManualTrigger = async () => {
                try {
                        toast({ title: "正在唤醒爬虫...", description: "这可能需要几分钟，请稍后刷新。" });
                        await hunterService.triggerCrawler();
                        toast({ title: "爬虫已启动", description: "数据将陆续入库" });
                } catch (e: any) {
                        toast({ title: "启动失败", description: e.message, variant: "destructive" });
                }
        };

        return (
                <PageBackground className="min-h-screen pb-20">
                        <Navbar />

                        <main className="container mx-auto px-4 pt-24 max-w-7xl animate-fade-in">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                                        <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                        <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                                                                Beta
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground uppercase tracking-widest">Phase 8</span>
                                                </div>
                                                <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
                                                        <Radar className="w-8 h-8 text-primary" />
                                                        狩猎雷达 <span className="text-muted-foreground font-light">Hunter</span>
                                                </h1>
                                                <p className="text-muted-foreground mt-2 max-w-xl">
                                                        24小时不间断扫描全网痛点，为您发现下一个独角兽机会。
                                                </p>
                                        </div>

                                        <div className="flex gap-3">
                                                <Button variant="outline" onClick={handleManualTrigger} className="gap-2">
                                                        <RefreshCw className="w-4 h-4" /> 立即扫描
                                                </Button>
                                                <CreateJobDialog onCreated={refreshData} />
                                        </div>
                                </div>

                                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                                        <TabsList className="bg-white/5 border border-white/10 p-1">
                                                <TabsTrigger value="dashboard" className="gap-2"><Radar className="w-4 h-4" /> 透视仪表盘</TabsTrigger>
                                                <TabsTrigger value="signals" className="gap-2"><Radio className="w-4 h-4" /> 实时信号流</TabsTrigger>
                                                <TabsTrigger value="jobs" className="gap-2"><Filter className="w-4 h-4" /> 监控任务</TabsTrigger>
                                        </TabsList>

                                        {/* Dashboard Tab */}
                                        <TabsContent value="dashboard" className="animate-slide-up space-y-8">
                                                {/* Top Opportunities Grid */}
                                                <section>
                                                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                                                <TrendingUp className="w-5 h-5 text-green-500" />
                                                                潜力机会 (Top Picks)
                                                        </h2>
                                                        {/* Empty State or Grid */}
                                                        {opportunities.length === 0 ? (
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

                                                {/* High Score Signals */}
                                                <section>
                                                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                                                强烈痛点 (High Pain Signals)
                                                        </h2>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                {signals.filter(s => (s.opportunity_score || 0) > 70).slice(0, 6).map(signal => (
                                                                        <SignalCard key={signal.id} signal={signal} />
                                                                ))}
                                                                {signals.filter(s => (s.opportunity_score || 0) > 70).length === 0 && (
                                                                        <div className="col-span-2 text-center py-8 text-muted-foreground">
                                                                                暂无高分痛点信号
                                                                        </div>
                                                                )}
                                                        </div>
                                                </section>
                                        </TabsContent>

                                        {/* Signals Tab */}
                                        <TabsContent value="signals" className="animate-slide-up">
                                                <div className="grid grid-cols-1 gap-4">
                                                        {isLoading ? (
                                                                <div className="py-20 flex justify-center"><LoadingSpinner /></div>
                                                        ) : signals.length === 0 ? (
                                                                <div className="text-center py-20 text-muted-foreground">数据库是空的，快去创建任务吧！</div>
                                                        ) : (
                                                                signals.map(signal => (
                                                                        <SignalCard key={signal.id} signal={signal} />
                                                                ))
                                                        )}
                                                </div>
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
                                </Tabs>
                        </main>
                </PageBackground>
        );
};

export default Hunter;
