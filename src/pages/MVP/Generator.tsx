import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageBackground, Navbar, LoadingSpinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { generateMVP, updateMVP, publishMVP, MVPLandingPage } from "@/services/mvpService";
import { ArrowLeft, Save, Globe, Eye, Code, Rocket } from "lucide-react";

export default function MVPGenerator() {
        const { id: validationId } = useParams();
        const navigate = useNavigate();
        const { toast } = useToast();
        const queryClient = useQueryClient();
        const [activeTab, setActiveTab] = useState("preview");

        // Fetch or Generate MVP
        const { data: mvpPage, isLoading, refetch } = useQuery({
                queryKey: ['mvp', validationId],
                queryFn: () => generateMVP(validationId!),
                enabled: !!validationId,
                retry: false,
                staleTime: Infinity, // Once generated, don't auto-refetch
        });

        // Local state for editing to avoid constant re-renders/ API calls
        const [editedContent, setEditedContent] = useState<any>(null);

        useEffect(() => {
                if (mvpPage?.content) {
                        setEditedContent(mvpPage.content);
                }
        }, [mvpPage]);

        const updateMutation = useMutation({
                mutationFn: (updates: Partial<MVPLandingPage>) => updateMVP(mvpPage!.id, updates),
                onSuccess: (updatedPage) => {
                        queryClient.setQueryData(['mvp', validationId], updatedPage);
                        toast({ title: "保存成功" });
                },
                onError: () => toast({ title: "保存失败", variant: "destructive" }),
        });

        const publishMutation = useMutation({
                mutationFn: (isPublished: boolean) => publishMVP(mvpPage!.id, isPublished),
                onSuccess: (_, isPublished) => {
                        queryClient.invalidateQueries({ queryKey: ['mvp', validationId] });
                        toast({
                                title: isPublished ? "发布成功" : "已下架",
                                description: isPublished ? "您的落地页现在可以公开访问了" : "落地页已转为私有"
                        });
                },
        });

        const handleSave = () => {
                if (!mvpPage) return;
                updateMutation.mutate({ content: editedContent });
        };

        const handlePublish = () => {
                if (!mvpPage) return;
                publishMutation.mutate(!mvpPage.is_published);
        };

        const handlePreview = () => {
                if (mvpPage) {
                        window.open(`/p/${mvpPage.slug}`, '_blank');
                }
        };

        if (isLoading || !editedContent) {
                return (
                        <PageBackground>
                                <Navbar />
                                <div className="flex flex-col items-center justify-center min-h-screen pt-20">
                                        <LoadingSpinner size="lg" />
                                        <p className="mt-4 text-muted-foreground animate-pulse">
                                                AI 正在构建您的 MVP 落地页...
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-2">
                                                正在撰写高转化文案 • 设计排版 • 生成表单
                                        </p>
                                </div>
                        </PageBackground>
                );
        }

        return (
                <PageBackground short>
                        <Navbar />
                        <div className="container mx-auto px-4 pt-24 pb-12 h-[calc(100vh-80px)]">

                                {/* Header */}
                                <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-4">
                                                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                                                        <ArrowLeft className="w-5 h-5" />
                                                </Button>
                                                <div>
                                                        <h1 className="text-2xl font-bold flex items-center gap-2">
                                                                MVP 落地页生成器
                                                                {mvpPage?.is_published && (
                                                                        <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full border border-green-500/20">
                                                                                已发布
                                                                        </span>
                                                                )}
                                                        </h1>
                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                                <Globe className="w-3 h-3" />
                                                                <span className="font-mono bg-muted px-2 py-0.5 rounded">
                                                                        /p/{mvpPage?.slug}
                                                                </span>
                                                        </div>
                                                </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                                <Button variant="outline" onClick={handlePreview}>
                                                        <Eye className="w-4 h-4 mr-2" />
                                                        预览
                                                </Button>
                                                <Button variant="outline" onClick={handleSave} disabled={updateMutation.isPending}>
                                                        <Save className="w-4 h-4 mr-2" />
                                                        保存
                                                </Button>
                                                <Button
                                                        onClick={handlePublish}
                                                        disabled={publishMutation.isPending}
                                                        className={mvpPage?.is_published ? "bg-destructive/90 hover:bg-destructive" : ""}
                                                >
                                                        {mvpPage?.is_published ? "下架" : "发布"}
                                                        <Rocket className="w-4 h-4 ml-2" />
                                                </Button>
                                        </div>
                                </div>

                                {/* Main Workspace */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full pb-20">

                                        {/* Editor Panel */}
                                        <Card className="lg:col-span-1 border-white/10 bg-black/20 backdrop-blur-xl h-full overflow-hidden flex flex-col">
                                                <div className="p-4 border-b border-white/5 font-semibold flex items-center gap-2">
                                                        <Code className="w-4 h-4 text-primary" />
                                                        内容编辑器
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-4 space-y-6">

                                                        <div className="space-y-3">
                                                                <h3 className="text-sm font-medium text-muted-foreground">Hero 区域</h3>
                                                                <div className="space-y-2">
                                                                        <label className="text-xs">标题</label>
                                                                        <Input
                                                                                value={editedContent.hero.title}
                                                                                onChange={(e) => setEditedContent({ ...editedContent, hero: { ...editedContent.hero, title: e.target.value } })}
                                                                        />
                                                                </div>
                                                                <div className="space-y-2">
                                                                        <label className="text-xs">副标题</label>
                                                                        <Textarea
                                                                                value={editedContent.hero.subtitle}
                                                                                onChange={(e) => setEditedContent({ ...editedContent, hero: { ...editedContent.hero, subtitle: e.target.value } })}
                                                                        />
                                                                </div>
                                                                <div className="space-y-2">
                                                                        <label className="text-xs">主要按钮文案</label>
                                                                        <Input
                                                                                value={editedContent.hero.cta}
                                                                                onChange={(e) => setEditedContent({ ...editedContent, hero: { ...editedContent.hero, cta: e.target.value } })}
                                                                        />
                                                                </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                                <h3 className="text-sm font-medium text-muted-foreground">功能特性 (Features)</h3>
                                                                {editedContent.features.map((feature: any, idx: number) => (
                                                                        <div key={idx} className="p-3 bg-white/5 rounded-lg space-y-2">
                                                                                <Input
                                                                                        value={feature.title}
                                                                                        onChange={(e) => {
                                                                                                const newFeatures = [...editedContent.features];
                                                                                                newFeatures[idx].title = e.target.value;
                                                                                                setEditedContent({ ...editedContent, features: newFeatures });
                                                                                        }}
                                                                                        className="h-8 text-sm"
                                                                                />
                                                                                <Textarea
                                                                                        value={feature.description}
                                                                                        onChange={(e) => {
                                                                                                const newFeatures = [...editedContent.features];
                                                                                                newFeatures[idx].description = e.target.value;
                                                                                                setEditedContent({ ...editedContent, features: newFeatures });
                                                                                        }}
                                                                                        className="text-xs min-h-[60px]"
                                                                                />
                                                                        </div>
                                                                ))}
                                                        </div>

                                                </div>
                                        </Card>

                                        {/* Preview Panel */}
                                        <div className="lg:col-span-2 h-full flex flex-col bg-white rounded-xl overflow-hidden shadow-2xl border border-zinc-200">
                                                <div className="h-8 bg-zinc-100 border-b border-zinc-200 flex items-center px-4 gap-2">
                                                        <div className="flex gap-1.5">
                                                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                                                <div className="w-3 h-3 rounded-full bg-amber-400" />
                                                                <div className="w-3 h-3 rounded-full bg-green-400" />
                                                        </div>
                                                        <div className="flex-1 text-center text-xs text-zinc-500 font-mono bg-white mx-4 rounded px-2">
                                                                preview.frontend-creator.com/p/{mvpPage?.slug}
                                                        </div>
                                                </div>

                                                <div className="flex-1 overflow-y-auto bg-white text-zinc-900 font-sans">

                                                        {/* Fake Landing Page Render (Simplified) */}

                                                        {/* Hero */}
                                                        <section className="py-20 px-6 text-center max-w-4xl mx-auto">
                                                                <h1 className="text-5xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent pb-2">
                                                                        {editedContent.hero.title}
                                                                </h1>
                                                                <p className="text-xl text-zinc-600 mb-8 max-w-2xl mx-auto">
                                                                        {editedContent.hero.subtitle}
                                                                </p>
                                                                <div className="flex gap-4 justify-center">
                                                                        <button className="px-8 py-4 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700 transition shadow-lg hover:shadow-xl">
                                                                                {editedContent.hero.cta}
                                                                        </button>
                                                                </div>
                                                        </section>

                                                        {/* Features */}
                                                        <section className="py-16 bg-zinc-50">
                                                                <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-8">
                                                                        {editedContent.features.map((f: any, i: number) => (
                                                                                <div key={i} className="p-6 bg-white rounded-xl shadow-sm border border-zinc-100">
                                                                                        <h3 className="text-xl font-bold mb-3 text-zinc-800">{f.title}</h3>
                                                                                        <p className="text-zinc-600 leading-relaxed">{f.description}</p>
                                                                                </div>
                                                                        ))}
                                                                </div>
                                                        </section>

                                                        {/* Pain Points */}
                                                        <section className="py-16 px-6 max-w-4xl mx-auto">
                                                                <h2 className="text-3xl font-bold text-center mb-12">Why you need this</h2>
                                                                <div className="space-y-6">
                                                                        {editedContent.painPoints.map((p: any, i: number) => (
                                                                                <div key={i} className="flex gap-4 items-start">
                                                                                        <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-1">✕</div>
                                                                                        <div>
                                                                                                <h4 className="text-lg font-semibold text-zinc-800">{p.problem}</h4>
                                                                                                <p className="text-zinc-500">{p.solution}</p>
                                                                                        </div>
                                                                                </div>
                                                                        ))}
                                                                </div>
                                                        </section>

                                                </div>
                                        </div>
                                </div>
                        </div>
                </PageBackground>
        );
}
