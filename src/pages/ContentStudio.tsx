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
import { Bot, Sparkles, FileText, Loader2, LogIn } from "lucide-react";
import useDocumentTitle from "@/hooks/useDocumentTitle";

const PLATFORMS: { value: DraftPlatform; label: string }[] = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "twitter", label: "Twitter/X" },
  { value: "wechat", label: "公众号" },
];

export default function ContentStudioPage() {
  useDocumentTitle("内容工作室 - IdeaScan");

  const { user } = useAuth();
  const navigate = useNavigate();
  const { drafts, isLoading, createDraft, updateDraft, deleteDraft } = useContentDrafts();
  const { connections } = useOpenClawConnections();

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

    // Build a context-free content pipeline prompt
    const prompt = buildOpenClawPrompt(
      `主题: ${topic}\n品牌 Voice: 语气=${brandVoice.tone}, 人设=${brandVoice.persona}, 关键词=${brandVoice.keywords.join("、") || "无"}`,
      "content_pipeline"
    );

    // Save to sessionStorage and redirect to OpenClaw
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
        <div className="container max-w-2xl mx-auto pt-32 text-center space-y-4">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">请先登录</h2>
          <p className="text-muted-foreground text-sm">内容工作室需要登录后使用</p>
          <Button onClick={() => navigate("/auth")} className="gap-2">
            <LogIn className="w-4 h-4" /> 登录
          </Button>
        </div>
      </div>
    );
  }

  const draftsByPlatform = (platform: DraftPlatform) => drafts.filter(d => d.platform === platform);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-4xl mx-auto pt-28 pb-8 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-accent" />
            内容工作室
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            输入主题和品牌调性 → AI 生成多平台文案 → 审核修改 → 一键分发
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full max-w-md mb-4">
            <TabsTrigger value="create" className="flex-1 gap-1.5 text-sm">
              <Bot className="w-4 h-4" /> 创建内容
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex-1 gap-1.5 text-sm">
              <FileText className="w-4 h-4" /> 草稿管理
              {drafts.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{drafts.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Create Tab */}
          <TabsContent value="create" className="mt-0">
            <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm p-6 space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">内容主题 *</Label>
                <Input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="例如：AI 辅助写作工具的使用体验"
                  className="text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">语气风格</Label>
                  <Input
                    value={voiceTone}
                    onChange={e => setVoiceTone(e.target.value)}
                    placeholder="专业友好 / 轻松幽默 / 权威严谨"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">品牌人设</Label>
                  <Input
                    value={voicePersona}
                    onChange={e => setVoicePersona(e.target.value)}
                    placeholder="行业专家 / 资深用户 / 新手小白"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">关键词</Label>
                  <Input
                    value={voiceKeywords}
                    onChange={e => setVoiceKeywords(e.target.value)}
                    placeholder="效率、创新、实用（逗号分隔）"
                    className="text-sm"
                  />
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generating || !topic.trim()}
                className="w-full sm:w-auto gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                生成多平台文案
              </Button>

              <p className="text-xs text-muted-foreground">
                点击后将跳转至 AI Agent 页面，Agent 会自动生成小红书、Twitter、公众号三个版本的文案。
                生成完成后可在「草稿管理」中查看和编辑。
              </p>
            </div>
          </TabsContent>

          {/* Drafts Tab */}
          <TabsContent value="drafts" className="mt-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <FileText className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">还没有草稿</p>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("create")}>
                  创建第一份内容
                </Button>
              </div>
            ) : (
              <Tabs defaultValue="xiaohongshu" className="w-full">
                <TabsList className="mb-4">
                  {PLATFORMS.map(p => (
                    <TabsTrigger key={p.value} value={p.value} className="text-sm gap-1">
                      {p.label}
                      {draftsByPlatform(p.value).length > 0 && (
                        <Badge variant="outline" className="ml-1 text-xs">{draftsByPlatform(p.value).length}</Badge>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {PLATFORMS.map(p => (
                  <TabsContent key={p.value} value={p.value} className="space-y-3">
                    {draftsByPlatform(p.value).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        暂无 {p.label} 草稿
                      </p>
                    ) : (
                      draftsByPlatform(p.value).map(draft => (
                        <DraftEditor
                          key={draft.id}
                          draft={draft}
                          onUpdate={handleUpdateDraft}
                          onDelete={handleDeleteDraft}
                        />
                      ))
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            )}

            {/* Quick add draft */}
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
      <div className="mt-4 text-center">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          + 手动添加草稿
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border/40 bg-card/80 p-4 space-y-3">
      <div className="flex gap-2">
        {PLATFORMS.map(p => (
          <Button
            key={p.value}
            size="sm"
            variant={platform === p.value ? "default" : "outline"}
            onClick={() => setPlatform(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="标题" className="text-sm" />
      <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="正文内容" rows={4} className="text-sm" />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { onAdd(platform, title, body); setTitle(""); setBody(""); setOpen(false); }}>
          保存草稿
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>取消</Button>
      </div>
    </div>
  );
}
