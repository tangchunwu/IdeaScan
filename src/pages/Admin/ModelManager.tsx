import { useEffect, useState } from "react";
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
import { Brain, Search, Image, Globe, Shield, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Save } from "lucide-react";

interface ConfigItem {
  config_key: string;
  config_group: string;
  display_value: string;
  has_value: boolean;
  source: string;
  updated_at: string | null;
}

interface ConfigGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  keys: { key: string; label: string; isSecret: boolean }[];
}

const CONFIG_GROUPS: ConfigGroup[] = [
  {
    id: "llm",
    label: "🧠 主 LLM",
    icon: Brain,
    description: "验证 / 分析 / 润色 / 信号处理",
    keys: [
      { key: "LLM_BASE_URL", label: "Base URL", isSecret: false },
      { key: "LLM_API_KEY", label: "API Key", isSecret: true },
      { key: "LLM_MODEL", label: "Model", isSecret: false },
    ],
  },
  {
    id: "search_llm",
    label: "🔍 搜索 LLM",
    icon: Search,
    description: "Perplexity / 狩猎雷达 / 趋势发现",
    keys: [
      { key: "PERPLEXITY_BASE_URL", label: "Base URL", isSecret: false },
      { key: "PERPLEXITY_API_KEY", label: "API Key", isSecret: true },
      { key: "PERPLEXITY_MODEL", label: "Model", isSecret: false },
    ],
  },
  {
    id: "image",
    label: "🎨 图片生成",
    icon: Image,
    description: "AI 绘图模型配置",
    keys: [
      { key: "IMAGE_GEN_BASE_URL", label: "Base URL", isSecret: false },
      { key: "IMAGE_GEN_API_KEY", label: "API Key", isSecret: true },
      { key: "IMAGE_GEN_MODEL", label: "Model", isSecret: false },
    ],
  },
  {
    id: "search_api",
    label: "🌐 搜索引擎",
    icon: Globe,
    description: "网页搜索 API Keys（Tavily / Bocha / You）",
    keys: [
      { key: "TAVILY_API_KEY", label: "Tavily API Key", isSecret: true },
      { key: "BOCHA_API_KEY", label: "Bocha API Key", isSecret: true },
      { key: "YOU_API_KEY", label: "You API Key", isSecret: true },
    ],
  },
];

const ModelManager = () => {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) fetchConfigs();
  }, [isAdmin]);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-api-config", {
        method: "GET",
      });
      if (error) throw error;
      setConfigs(data.configs || []);
      // Initialize edit values with display values for non-secret fields
      const initial: Record<string, string> = {};
      for (const c of data.configs || []) {
        if (c.config_group !== "fallback") {
          initial[c.config_key] = c.display_value || "";
        }
      }
      setEditValues(initial);
    } catch (e: any) {
      toast.error("加载配置失败: " + (e.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (groupId: string) => {
    const group = CONFIG_GROUPS.find((g) => g.id === groupId);
    if (!group) return;

    setSaving(groupId);
    try {
      const items = group.keys.map((k) => ({
        config_key: k.key,
        config_value: editValues[k.key] || "",
        config_group: groupId,
      }));

      const { error } = await supabase.functions.invoke("admin-api-config?action=save", {
        method: "POST",
        body: { configs: items },
      });
      if (error) throw error;
      toast.success("配置已保存");
      await fetchConfigs();
    } catch (e: any) {
      toast.error("保存失败: " + (e.message || "未知错误"));
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (groupId: string) => {
    setTesting(groupId);
    setTestResults((prev) => ({ ...prev, [groupId]: undefined as any }));
    try {
      const { data, error } = await supabase.functions.invoke("admin-api-config?action=test", {
        method: "POST",
        body: { group: groupId },
      });
      if (error) throw error;
      setTestResults((prev) => ({ ...prev, [groupId]: data }));
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [groupId]: { success: false, message: e.message || "测试失败" },
      }));
    } finally {
      setTesting(null);
    }
  };

  const getConfigItem = (key: string) => configs.find((c) => c.config_key === key);
  const fallbackConfig = configs.find((c) => c.config_key === "LOVABLE_API_KEY");

  if (authLoading || loading) {
    return <BrandLoader fullScreen text="加载管理面板..." />;
  }

  if (!isAdmin) return null;

  return (
    <PageBackground>
      <Navbar />
      <main className="pt-28 pb-16 px-4 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">API 配置中心</h1>
          <p className="text-muted-foreground mt-1">集中管理所有外部 API 的连接配置</p>
        </div>

        <div className="space-y-6">
          {CONFIG_GROUPS.map((group) => {
            const Icon = group.icon;
            const result = testResults[group.id];
            return (
              <GlassCard key={group.id} padding="lg" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-primary" />
                    <div>
                      <h2 className="font-semibold text-foreground">{group.label}</h2>
                      <p className="text-xs text-muted-foreground">{group.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.keys.some((k) => getConfigItem(k.key)?.has_value) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {getConfigItem(group.keys[0].key)?.source === "database" ? "数据库" : "环境变量"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {group.keys.map((k) => {
                    const item = getConfigItem(k.key);
                    const isVisible = showSecrets[k.key];
                    return (
                      <div key={k.key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{k.label}</Label>
                        <div className="flex gap-2">
                          <Input
                            type={k.isSecret && !isVisible ? "password" : "text"}
                            value={editValues[k.key] || ""}
                            onChange={(e) =>
                              setEditValues((prev) => ({ ...prev, [k.key]: e.target.value }))
                            }
                            placeholder={item?.has_value ? "已配置（留空保持不变）" : "未配置"}
                            className="font-mono text-sm"
                          />
                          {k.isSecret && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setShowSecrets((prev) => ({ ...prev, [k.key]: !prev[k.key] }))
                              }
                              className="shrink-0"
                            >
                              {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {result && (
                  <div
                    className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                      result.success
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    <span>{result.message}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest(group.id)}
                    disabled={testing === group.id}
                  >
                    {testing === group.id ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                    )}
                    测试连通性
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(group.id)}
                    disabled={saving === group.id}
                  >
                    {saving === group.id ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-1" />
                    )}
                    保存
                  </Button>
                </div>
              </GlassCard>
            );
          })}

          {/* Fallback section */}
          <GlassCard padding="lg" className="space-y-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              <div>
                <h2 className="font-semibold text-foreground">🛡️ 兜底（Lovable AI）</h2>
                <p className="text-xs text-muted-foreground">主 LLM 不可用时的自动回退</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {fallbackConfig?.has_value ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-green-600">已就绪（自动配置，只读）</span>
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
