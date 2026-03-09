import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/shared/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { useContentDrafts, type DraftPlatform, type ContentDraft } from "@/hooks/useContentDrafts";
import { useOpenClawConnections } from "@/hooks/useOpenClawConnections";
import { DraftEditor } from "@/components/content/DraftEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { buildOpenClawPrompt } from "@/lib/buildOpenClawContext";
import {
  Bot, Sparkles, FileText, Loader2, LogIn, PenLine, Megaphone,
  BookOpen, Zap, ArrowRight, Plus, X,
} from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { motion, AnimatePresence } from "framer-motion";

const PLATFORMS: { value: DraftPlatform; label: string; icon: React.ElementType; color: string }[] = [
  { value: "xiaohongshu", label: "小红书", icon: BookOpen, color: "text-rose-500" },
  { value: "twitter", label: "Twitter/X", icon: Megaphone, color: "text-sky-500" },
  { value: "wechat", label: "公众号", icon: PenLine, color: "text-emerald-500" },
];

const TONE_PRESETS = ["专业友好", "轻松幽默", "权威严谨", "温暖治愈", "犀利观点"];
const PERSONA_PRESETS = ["行业专家", "资深用户", "新手小白", "创业者", "KOL博主"];

export default function ContentStudioPage() {
  useDocumentTitle("内容工作室 - IdeaScan");

  const { user } = useAuth();
  const navigate = useNavigate();
  const { drafts, isLoading, createDraft, updateDraft, deleteDraft } = useContentDrafts();
  const { connections } = useOpenClawConnections(user?.id);

  const [topic, setTopic] = useState("");
  const [voiceTone, setVoiceTone] = useState("");
  const [voicePersona, setVoicePersona] = useState("");
  const [voiceKeywords, setVoiceKeywords] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("create");

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) { toast.error("请输入内容主题"); return; }
    if (!user) { toast.error("请先登录"); return; }

    const defaultConn = connections.find(c => c.is_default) ?? connections[0];
    if (!defaultConn) {
      toast.error("请先在 AI Agent 设置中添加 OpenClaw 连接");
      return;
    }

    setGenerating(true);

    const brandVoice = {
      tone: voiceTone.trim() || "专业友好",
      persona: voicePersona.trim() || "行业专家",
      keywords: voiceKeywords.split(/[,，、\s]+/).filter(Boolean),
    };

    const prompt = buildOpenClawPrompt(
      `主题: ${topic}\n品牌 Voice: 语气=${brandVoice.tone}, 人设=${brandVoice.persona}, 关键词=${brandVoice.keywords.join("、") || "无"}`,
      "content_pipeline"
    );

    sessionStorage.setItem("openclaw_initial_message", prompt);
    sessionStorage.setItem("openclaw_content_studio", JSON.stringify({
      topic: topic.trim(),
      brand_voice: brandVoice,
    }));

    navigate("/openclaw?from_validation=content_studio");
    setGenerating(false);
  }, [topic, voiceTone, voicePersona, voiceKeywords, user, connections, navigate]);

  const handleSaveDraft = useCallback(async (platform: DraftPlatform, title: string, body: string) => {
    if (!user) return;
    const studioData = sessionStorage.getItem("openclaw_content_studio");
    const parsed = studioData ? JSON.parse(studioData) : { topic: "未命名", brand_voice: {} };

    await createDraft.mutateAsync({
      topic: parsed.topic,
      brand_voice: parsed.brand_voice,
      platform,
      title,
      body,
    });
  }, [user, createDraft]);

  const handleUpdateDraft = useCallback((id: string, fields: Partial<ContentDraft>) => {
    updateDraft.mutate({ id, ...fields });
  }, [updateDraft]);

  const handleDeleteDraft = useCallback((id: string) => {
    deleteDraft.mutate(id);
  }, [deleteDraft]);

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container max-w-lg mx-auto pt-32 text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-lg"
          >
            <FileText className="w-10 h-10 text-primary" />
          </motion.div>
          <h2 className="text-2xl font-bold text-foreground">请先登录</h2>
          <p className="text-muted-foreground">内容工作室需要登录后使用</p>
          <Button onClick={() => navigate("/auth")} size="lg" className="gap-2 rounded-xl">
            <LogIn className="w-4 h-4" /> 登录使用
          </Button>
        </div>
      </div>
    );
  }

  const draftsByPlatform = (platform: DraftPlatform) => drafts.filter(d => d.platform === platform);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-5xl mx-auto pt-28 pb-12 px-4">
        <ContentStudioInner draftsByPlatform={draftsByPlatform} {...{ topic, setTopic, voiceTone, setVoiceTone, voicePersona, setVoicePersona, voiceKeywords, setVoiceKeywords, generating, handleGenerate, activeTab, setActiveTab, isLoading, drafts, handleUpdateDraft, handleDeleteDraft, handleSaveDraft }} />
      </div>
    </div>
  );
}

/** Inline version for embedding in OpenClaw page (no Navbar/wrapper) */
export function ContentStudioInline() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { drafts, isLoading, createDraft, updateDraft, deleteDraft } = useContentDrafts();
  const { connections } = useOpenClawConnections(user?.id);

  const [topic, setTopic] = useState("");
  const [voiceTone, setVoiceTone] = useState("");
  const [voicePersona, setVoicePersona] = useState("");
  const [voiceKeywords, setVoiceKeywords] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("create");

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) { toast.error("请输入内容主题"); return; }
    if (!user) { toast.error("请先登录"); return; }
    const defaultConn = connections.find(c => c.is_default) ?? connections[0];
    if (!defaultConn) { toast.error("请先在设置中添加 OpenClaw 连接"); return; }
    setGenerating(true);
    const brandVoice = {
      tone: voiceTone.trim() || "专业友好",
      persona: voicePersona.trim() || "行业专家",
      keywords: voiceKeywords.split(/[,，、\s]+/).filter(Boolean),
    };
    const prompt = buildOpenClawPrompt(
      `主题: ${topic}\n品牌 Voice: 语气=${brandVoice.tone}, 人设=${brandVoice.persona}, 关键词=${brandVoice.keywords.join("、") || "无"}`,
      "content_pipeline"
    );
    sessionStorage.setItem("openclaw_initial_message", prompt);
    sessionStorage.setItem("openclaw_content_studio", JSON.stringify({ topic: topic.trim(), brand_voice: brandVoice }));
    navigate("/openclaw?from_validation=content_studio");
    setGenerating(false);
  }, [topic, voiceTone, voicePersona, voiceKeywords, user, connections, navigate]);

  const handleSaveDraft = useCallback(async (platform: DraftPlatform, title: string, body: string) => {
    if (!user) return;
    const studioData = sessionStorage.getItem("openclaw_content_studio");
    const parsed = studioData ? JSON.parse(studioData) : { topic: "未命名", brand_voice: {} };
    await createDraft.mutateAsync({ topic: parsed.topic, brand_voice: parsed.brand_voice, platform, title, body });
  }, [user, createDraft]);

  const handleUpdateDraft = useCallback((id: string, fields: Partial<ContentDraft>) => { updateDraft.mutate({ id, ...fields }); }, [updateDraft]);
  const handleDeleteDraft = useCallback((id: string) => { deleteDraft.mutate(id); }, [deleteDraft]);

  if (!user) return null;

  const draftsByPlatform = (platform: DraftPlatform) => drafts.filter(d => d.platform === platform);

  return <ContentStudioInner draftsByPlatform={draftsByPlatform} {...{ topic, setTopic, voiceTone, setVoiceTone, voicePersona, setVoicePersona, voiceKeywords, setVoiceKeywords, generating, handleGenerate, activeTab, setActiveTab, isLoading, drafts, handleUpdateDraft, handleDeleteDraft, handleSaveDraft }} />;
}

/** Shared inner content (no page chrome) */
function ContentStudioInner({ topic, setTopic, voiceTone, setVoiceTone, voicePersona, setVoicePersona, voiceKeywords, setVoiceKeywords, generating, handleGenerate, activeTab, setActiveTab, isLoading, drafts, draftsByPlatform, handleUpdateDraft, handleDeleteDraft, handleSaveDraft }: any) {
  return (
    <div>
      <div className="max-w-5xl mx-auto">
        {/* Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/30 to-primary/20 flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">内容工作室</h1>
              <p className="text-sm text-muted-foreground">
                主题 → AI 生成 → 审核 → 一键分发
              </p>
            </div>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full max-w-sm mb-6 h-11 rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="create" className="flex-1 gap-2 text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <Zap className="w-4 h-4" /> 创建内容
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex-1 gap-2 text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <FileText className="w-4 h-4" /> 草稿箱
              {drafts.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary/15 text-primary">
                  {drafts.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── Create Tab ─── */}
          <TabsContent value="create" className="mt-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-border/30 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden"
            >
              {/* Topic input - hero section */}
              <div className="p-6 pb-5 bg-gradient-to-b from-primary/5 to-transparent">
                <Label className="text-sm font-semibold text-foreground mb-2 block">内容主题</Label>
                <div className="relative">
                  <Input
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="例如：AI 辅助写作工具的使用体验、宠物智能喂食器测评..."
                    className="text-sm h-12 rounded-xl pr-4 pl-4 bg-background/80 border-border/40 focus:border-primary/50 shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Brand voice settings */}
              <div className="px-6 py-5 space-y-5 border-t border-border/20">
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">品牌调性</span>
                  <span className="text-xs text-muted-foreground/60">（可选）</span>
                </div>

                {/* Tone */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-medium">语气风格</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {TONE_PRESETS.map(t => (
                      <button
                        key={t}
                        onClick={() => setVoiceTone(voiceTone === t ? "" : t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
                          voiceTone === t
                            ? "bg-primary/15 text-primary border-primary/30 shadow-sm"
                            : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50 hover:border-border/50"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={voiceTone}
                    onChange={e => setVoiceTone(e.target.value)}
                    placeholder="或自定义语气..."
                    className="text-xs h-9 rounded-lg bg-muted/20 border-border/30"
                  />
                </div>

                {/* Persona */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-medium">品牌人设</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {PERSONA_PRESETS.map(p => (
                      <button
                        key={p}
                        onClick={() => setVoicePersona(voicePersona === p ? "" : p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
                          voicePersona === p
                            ? "bg-secondary/15 text-secondary border-secondary/30 shadow-sm"
                            : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50 hover:border-border/50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={voicePersona}
                    onChange={e => setVoicePersona(e.target.value)}
                    placeholder="或自定义人设..."
                    className="text-xs h-9 rounded-lg bg-muted/20 border-border/30"
                  />
                </div>

                {/* Keywords */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-medium">关键词</Label>
                  <Input
                    value={voiceKeywords}
                    onChange={e => setVoiceKeywords(e.target.value)}
                    placeholder="效率、创新、实用（逗号分隔）"
                    className="text-xs h-9 rounded-lg bg-muted/20 border-border/30"
                  />
                </div>
              </div>

              {/* CTA */}
              <div className="px-6 py-5 border-t border-border/20 bg-muted/10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <Button
                    onClick={handleGenerate}
                    disabled={generating || !topic.trim()}
                    size="lg"
                    className="gap-2.5 rounded-xl shadow-md hover:shadow-lg transition-all px-6 bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary disabled:opacity-50"
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    生成多平台文案
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <p className="text-xs text-muted-foreground/70 leading-relaxed">
                    将跳转至 AI Agent，自动生成小红书、Twitter、公众号三版文案
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Platform preview cards */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-3 gap-3 mt-6"
            >
              {PLATFORMS.map((p, i) => (
                <div
                  key={p.value}
                  className="rounded-xl border border-border/30 bg-card/40 backdrop-blur-sm p-4 text-center space-y-2 hover:bg-card/60 transition-colors"
                >
                  <p.icon className={`w-6 h-6 mx-auto ${p.color}`} />
                  <p className="text-xs font-medium text-foreground/80">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground/50">
                    {draftsByPlatform(p.value).length} 份草稿
                  </p>
                </div>
              ))}
            </motion.div>
          </TabsContent>

          {/* ─── Drafts Tab ─── */}
          <TabsContent value="drafts" className="mt-0">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-center py-16"
                >
                  <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
                </motion.div>
              ) : drafts.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-16 space-y-4"
                >
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-muted/30 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground/70">还没有草稿</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">使用 AI 生成或手动添加</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("create")} className="gap-2 rounded-lg">
                    <Zap className="w-3.5 h-3.5" /> 去创建
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="drafts"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Tabs defaultValue="xiaohongshu" className="w-full">
                    <TabsList className="mb-5 h-10 rounded-xl bg-muted/40 p-1">
                      {PLATFORMS.map(p => (
                        <TabsTrigger
                          key={p.value}
                          value={p.value}
                          className="text-xs gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                          <p.icon className={`w-3.5 h-3.5 ${p.color}`} />
                          {p.label}
                          {draftsByPlatform(p.value).length > 0 && (
                            <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary/10 text-primary">
                              {draftsByPlatform(p.value).length}
                            </span>
                          )}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {PLATFORMS.map(p => (
                      <TabsContent key={p.value} value={p.value} className="space-y-3">
                        {draftsByPlatform(p.value).length === 0 ? (
                          <div className="text-center py-10">
                            <p.icon className={`w-8 h-8 mx-auto mb-2 ${p.color} opacity-30`} />
                            <p className="text-sm text-muted-foreground/50">暂无 {p.label} 草稿</p>
                          </div>
                        ) : (
                          draftsByPlatform(p.value).map((draft, i) => (
                            <motion.div
                              key={draft.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.05 }}
                            >
                              <DraftEditor
                                draft={draft}
                                onUpdate={handleUpdateDraft}
                                onDelete={handleDeleteDraft}
                              />
                            </motion.div>
                          ))
                        )}
                      </TabsContent>
                    ))}
                  </Tabs>
                </motion.div>
              )}
            </AnimatePresence>

            <QuickAddDraft onAdd={handleSaveDraft} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QuickAddDraft({ onAdd }: { onAdd: (platform: DraftPlatform, title: string, body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<DraftPlatform>("xiaohongshu");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  if (!open) {
    return (
      <div className="mt-6 text-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2 rounded-xl border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> 手动添加草稿
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-6 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">新建草稿</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex gap-2">
        {PLATFORMS.map(p => (
          <button
            key={p.value}
            onClick={() => setPlatform(p.value)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
              platform === p.value
                ? "bg-primary/10 text-primary border-primary/30 shadow-sm"
                : "bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40"
            }`}
          >
            <p.icon className={`w-3.5 h-3.5 ${platform === p.value ? p.color : ""}`} />
            {p.label}
          </button>
        ))}
      </div>
      <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="标题" className="text-sm rounded-lg" />
      <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="正文内容..." rows={4} className="text-sm rounded-lg resize-none" />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="gap-1.5 rounded-lg"
          onClick={() => { onAdd(platform, title, body); setTitle(""); setBody(""); setOpen(false); toast.success("草稿已保存"); }}
          disabled={!body.trim()}
        >
          <Plus className="w-3.5 h-3.5" /> 保存草稿
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="rounded-lg">取消</Button>
      </div>
    </motion.div>
  );
}
