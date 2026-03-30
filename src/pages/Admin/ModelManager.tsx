import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Navbar } from "@/components/shared/Navbar";
import { PageBackground } from "@/components/shared/PageBackground";
import { GlassCard } from "@/components/shared/GlassCard";
import { BrandLoader } from "@/components/shared/BrandLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Brain, Search, Image, Globe, Shield, Loader2, CheckCircle2, XCircle,
  Eye, EyeOff, Save, Plus, Trash2, GripVertical, ArrowUp, ArrowDown,
  Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface ProviderRow {
  id: string;
  config_group: string;
  priority: number;
  label: string;
  base_url: string;
  api_key: string;
  api_key_display?: string;
  model: string;
  enabled: boolean;
  updated_at: string;
  _source?: string; // "env" for env-var entries
  // UI state
  _dirty?: boolean;
  _testResult?: { success: boolean; message: string; latencyMs?: number };
  _testing?: boolean;
  _saving?: boolean;
}

interface GroupDef {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  fields: { key: keyof ProviderRow; label: string; isSecret?: boolean; placeholder?: string }[];
}

const GROUPS: GroupDef[] = [
  {
    id: "llm",
    title: "🧠 主 LLM 池",
    icon: Brain,
    description: "验证 / 分析 / 润色 / 信号处理 — 按优先级顺序回退",
    fields: [
      { key: "label", label: "标签", placeholder: "如：MiniMax-主力" },
      { key: "base_url", label: "Base URL", placeholder: "https://api.example.com" },
      { key: "api_key", label: "API Key", isSecret: true, placeholder: "sk-..." },
      { key: "model", label: "Model", placeholder: "如：gemini-3-pro-preview" },
    ],
  },
  {
    id: "search_llm",
    title: "🔍 搜索 LLM 池",
    icon: Search,
    description: "狩猎雷达 / 趋势发现（Perplexity 等）",
    fields: [
      { key: "label", label: "标签", placeholder: "如：Perplexity-主力" },
      { key: "base_url", label: "Base URL", placeholder: "https://api.perplexity.ai" },
      { key: "api_key", label: "API Key", isSecret: true },
      { key: "model", label: "Model", placeholder: "如：sonar" },
    ],
  },
  {
    id: "image",
    title: "🎨 图片生成池",
    icon: Image,
    description: "AI 绘图模型配置",
    fields: [
      { key: "label", label: "标签", placeholder: "如：DALL-E" },
      { key: "base_url", label: "Base URL" },
      { key: "api_key", label: "API Key", isSecret: true },
      { key: "model", label: "Model", placeholder: "如：dall-e-3" },
    ],
  },
  {
    id: "search_api",
    title: "🌐 搜索引擎池",
    icon: Globe,
    description: "网页搜索 API Keys（Tavily / Bocha / You）",
    fields: [
      { key: "label", label: "标签", placeholder: "如：Tavily" },
      { key: "api_key", label: "API Key", isSecret: true },
      { key: "model", label: "引擎类型", placeholder: "tavily / bocha / you" },
    ],
  },
];

const ModelManager = () => {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Record<string, ProviderRow[]>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({});
  const [lovableReady, setLovableReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/");
  }, [isAdmin, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-api-config", { method: "GET" });
      if (error) throw error;
      setProviders(data.groups || {});
      setEnvStatus(data.envStatus || {});
      setLovableReady(data.lovableReady || false);
    } catch (e: any) {
      toast.error("加载配置失败: " + (e.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  const updateProvider = (groupId: string, idx: number, field: string, value: any) => {
    setProviders((prev) => {
      const list = [...(prev[groupId] || [])];
      list[idx] = { ...list[idx], [field]: value, _dirty: true };
      return { ...prev, [groupId]: list };
    });
  };

  const addProvider = (groupId: string) => {
    setProviders((prev) => {
      const list = [...(prev[groupId] || [])];
      const maxPriority = list.length > 0 ? Math.max(...list.map((p) => p.priority)) + 1 : 0;
      list.push({
        id: `new-${Date.now()}`,
        config_group: groupId,
        priority: maxPriority,
        label: "",
        base_url: "",
        api_key: "",
        model: "",
        enabled: true,
        updated_at: "",
        _dirty: true,
      });
      return { ...prev, [groupId]: list };
    });
  };

  const removeProvider = async (groupId: string, idx: number) => {
    const list = providers[groupId] || [];
    const p = list[idx];
    if (p.id && !p.id.startsWith("new-")) {
      try {
        await supabase.functions.invoke("admin-api-config?action=delete", {
          method: "POST",
          body: { id: p.id },
        });
        toast.success("已删除");
      } catch (e: any) {
        toast.error("删除失败: " + e.message);
        return;
      }
    }
    setProviders((prev) => ({
      ...prev,
      [groupId]: list.filter((_, i) => i !== idx),
    }));
  };

  const movePriority = (groupId: string, idx: number, dir: -1 | 1) => {
    setProviders((prev) => {
      const list = [...(prev[groupId] || [])];
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      // Swap priorities
      const tmpPriority = list[idx].priority;
      list[idx] = { ...list[idx], priority: list[targetIdx].priority, _dirty: true };
      list[targetIdx] = { ...list[targetIdx], priority: tmpPriority, _dirty: true };
      // Re-sort
      list.sort((a, b) => a.priority - b.priority);
      return { ...prev, [groupId]: list };
    });
  };

  const saveProvider = async (groupId: string, idx: number) => {
    const p = providers[groupId]?.[idx];
    if (!p) return;

    setProviders((prev) => {
      const list = [...(prev[groupId] || [])];
      list[idx] = { ...list[idx], _saving: true };
      return { ...prev, [groupId]: list };
    });

    try {
      const payload = {
        id: p.id,
        config_group: groupId,
        priority: p.priority,
        label: p.label,
        base_url: p.base_url,
        api_key: p.api_key,
        model: p.model,
        enabled: p.enabled,
      };
      const { error } = await supabase.functions.invoke("admin-api-config?action=save", {
        method: "POST",
        body: { provider: payload },
      });
      if (error) throw error;
      toast.success("已保存");
      await fetchData();
    } catch (e: any) {
      toast.error("保存失败: " + e.message);
    } finally {
      setProviders((prev) => {
        const list = [...(prev[groupId] || [])];
        if (list[idx]) list[idx] = { ...list[idx], _saving: false, _dirty: false };
        return { ...prev, [groupId]: list };
      });
    }
  };

  const testProvider = async (groupId: string, idx: number) => {
    const p = providers[groupId]?.[idx];
    if (!p) return;

    setProviders((prev) => {
      const list = [...(prev[groupId] || [])];
      list[idx] = { ...list[idx], _testing: true, _testResult: undefined };
      return { ...prev, [groupId]: list };
    });

    try {
      const { data, error } = await supabase.functions.invoke("admin-api-config?action=test", {
        method: "POST",
        body: {
          provider: {
            config_group: groupId,
            base_url: p.base_url,
            api_key: p.api_key.startsWith("****") ? "" : p.api_key,
            model: p.model,
          },
        },
      });
      if (error) throw error;
      setProviders((prev) => {
        const list = [...(prev[groupId] || [])];
        list[idx] = { ...list[idx], _testResult: data, _testing: false };
        return { ...prev, [groupId]: list };
      });
    } catch (e: any) {
      setProviders((prev) => {
        const list = [...(prev[groupId] || [])];
        list[idx] = { ...list[idx], _testResult: { success: false, message: e.message }, _testing: false };
        return { ...prev, [groupId]: list };
      });
    }
  };

  // Timeout protection: if auth takes too long, stop loading
  useEffect(() => {
    if (authLoading) {
      const timer = setTimeout(() => {
        if (authLoading) {
          setLoading(false);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [authLoading]);

  // Import all env entries to DB
  const importAllEnv = async () => {
    const envEntries: { groupId: string; provider: ProviderRow }[] = [];
    for (const [groupId, list] of Object.entries(providers)) {
      for (const p of list) {
        if (p._source === "env") {
          envEntries.push({ groupId, provider: p });
        }
      }
    }
    if (envEntries.length === 0) {
      toast.info("没有需要导入的环境变量配置");
      return;
    }
    let successCount = 0;
    for (const { provider } of envEntries) {
      try {
        const { error } = await supabase.functions.invoke("admin-api-config?action=save", {
          method: "POST",
          body: {
            provider: {
              id: provider.id,
              config_group: provider.config_group,
              priority: provider.priority,
              label: provider.label,
              base_url: provider.base_url,
              api_key: provider.api_key,
              model: provider.model,
              enabled: provider.enabled,
            },
          },
        });
        if (!error) successCount++;
      } catch {}
    }
    toast.success(`已导入 ${successCount}/${envEntries.length} 个配置到数据库`);
    await fetchData();
  };

  const hasEnvEntries = Object.values(providers).some((list) =>
    list.some((p) => p._source === "env")
  );

  if (authLoading || loading) return <BrandLoader fullScreen text="加载管理面板..." />;
  if (!isAdmin) return null;

  return (
    <PageBackground>
      <Navbar />
      <main className="pt-28 pb-16 px-4 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">API 配置中心</h1>
          <p className="text-muted-foreground mt-1">
            每组支持多个提供商，按优先级顺序回退 — 第一个失败自动切换下一个
          </p>
        </div>

        <div className="space-y-6">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            const list = providers[group.id] || [];

            return (
              <GlassCard key={group.id} padding="lg" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-primary" />
                    <div>
                      <h2 className="font-semibold text-foreground">{group.title}</h2>
                      <p className="text-xs text-muted-foreground">{group.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {list.length === 0 && envStatus[group.id] && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        环境变量回退
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {list.length} 个提供商
                    </span>
                  </div>
                </div>

                {/* Provider list */}
                <div className="space-y-4">
                  {list.map((p, idx) => (
                    <div
                      key={p.id}
                      className="border border-border/50 rounded-xl p-4 space-y-3 bg-background/50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                          <span className="text-sm font-medium text-foreground">
                            {p.label || `提供商 ${idx + 1}`}
                          </span>
                          {p._testResult && (
                            <span className={`text-xs ${p._testResult.success ? "text-primary" : "text-destructive"}`}>
                              {p._testResult.latencyMs ? `${p._testResult.latencyMs}ms` : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={p.enabled}
                            onCheckedChange={(v) => updateProvider(group.id, idx, "enabled", v)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === 0}
                            onClick={() => movePriority(group.id, idx, -1)}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === list.length - 1}
                            onClick={() => movePriority(group.id, idx, 1)}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeProvider(group.id, idx)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {group.fields.map((f) => {
                          const fieldKey = `${p.id}-${String(f.key)}`;
                          const isVisible = showSecrets[fieldKey];
                          const displayVal = f.isSecret && p.api_key_display && !p._dirty
                            ? p.api_key_display
                            : (p[f.key] as string) || "";

                          return (
                            <div key={String(f.key)} className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{f.label}</Label>
                              <div className="flex gap-1">
                                <Input
                                  type={f.isSecret && !isVisible ? "password" : "text"}
                                  value={displayVal}
                                  onChange={(e) => updateProvider(group.id, idx, String(f.key), e.target.value)}
                                  placeholder={f.placeholder}
                                  className="font-mono text-xs h-9"
                                />
                                {f.isSecret && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 h-9 w-9"
                                    onClick={() => setShowSecrets((s) => ({ ...s, [fieldKey]: !s[fieldKey] }))}
                                  >
                                    {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {p._testResult && (
                        <div
                          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
                            p._testResult.success
                              ? "bg-primary/10 text-primary"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {p._testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>{p._testResult.message}</span>
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={p._testing}
                          onClick={() => testProvider(group.id, idx)}
                        >
                          {p._testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                          测试
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={p._saving}
                          onClick={() => saveProvider(group.id, idx)}
                        >
                          {p._saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                          保存
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                  onClick={() => addProvider(group.id)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加提供商
                </Button>
              </GlassCard>
            );
          })}

          {/* Lovable AI fallback */}
          <GlassCard padding="lg" className="space-y-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              <div>
                <h2 className="font-semibold text-foreground">🛡️ 兜底（Lovable AI）</h2>
                <p className="text-xs text-muted-foreground">所有池为空或全部失败时的最终回退</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {lovableReady ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-primary">已就绪（自动配置，只读）</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-destructive" />
                  <span className="text-destructive">未配置</span>
                </>
              )}
            </div>
          </GlassCard>
        </div>
      </main>
    </PageBackground>
  );
};

export default ModelManager;
