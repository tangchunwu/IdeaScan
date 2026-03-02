import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/useSettings";
import { Settings, Eye, Save, RotateCcw, ExternalLink, Cloud, CloudOff, Loader2, Download, Upload, Database, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { invokeFunction } from "@/lib/invokeFunction";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ExportDataButton } from "./ExportDataButton";
import { ImportDataButton } from "./ImportDataButton";
const PROVIDERS = {
       openai: {
              name: "OpenAI",
              baseUrl: "https://api.openai.com/v1",
              models: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]
       },
       deepseek: {
              name: "DeepSeek",
              baseUrl: "https://api.deepseek.com/v1", // Adjust if needed
              models: ["deepseek-chat", "deepseek-coder"]
       },
       custom: {
              name: "Custom (OpenAI Compatible)",
              baseUrl: "",
              models: []
       }
};

interface SettingsDialogProps {
       open?: boolean;
       onOpenChange?: (open: boolean) => void;
       trigger?: React.ReactNode;
}

type CrawlerSession = {
       session_id: string;
       platform: string;
       status: string;
       region?: string;
       source?: string;
       consecutive_failures?: number;
       updated_at?: string;
};

type CrawlerHealth = {
       enabled: boolean;
       healthy: boolean;
       reason?: string;
       message?: string;
       latency_ms?: number;
       route_base?: string;
};

type AuthMetrics = {
       cookie_count_total: number;
       required_all: string[];
       required_any: string[];
       required_all_present: number;
       required_any_present: number;
       required_all_ok: boolean;
       required_any_ok: boolean;
};

type FallbackLLM = {
       baseUrl: string;
       apiKey: string;
       model: string;
};

const isRecord = (value: unknown): value is Record<string, any> =>
       !!value && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const normalizeFallbacks = (value: unknown): FallbackLLM[] => {
       if (!Array.isArray(value)) return [];
       return value
              .filter(isRecord)
              .map((item) => ({
                     baseUrl: asString(item.baseUrl || item.base_url).trim(),
                     apiKey: asString(item.apiKey || item.api_key),
                     model: asString(item.model || item.modelName || item.model_name).trim(),
              }))
              .filter((item) => !!item.baseUrl || !!item.model || !!item.apiKey);
};

export const SettingsDialog = ({ open: controlledOpen, onOpenChange: controlledOnOpenChange, trigger }: SettingsDialogProps) => {
       const {
              llmFallbacks,
              llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
              enableXiaohongshu, enableDouyin, enableSelfCrawler, enableTikhubFallback,
              bochaApiKey, youApiKey, tavilyApiKey,
              imageGenBaseUrl, imageGenApiKey, imageGenModel,
              updateSettings, resetSettings,
              isLoading, isSynced, syncToCloud, syncFromCloud
       } = useSettings();
       
        const { user } = useAuth();
        const { isAdmin } = useAdminAuth();

       const [internalOpen, setInternalOpen] = useState(false);

       const isControlled = controlledOpen !== undefined;
       const open = isControlled ? controlledOpen : internalOpen;
       const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;

       const [showKey, setShowKey] = useState(false);
       const [showFallbackKeys, setShowFallbackKeys] = useState<Record<number, boolean>>({});
       const [verifyingFallbackIndex, setVerifyingFallbackIndex] = useState<number | null>(null);
       const [fallbackVerifyStatus, setFallbackVerifyStatus] = useState<Record<number, "idle" | "ok" | "fail">>({});
       const [isVerifyingAllFallbacks, setIsVerifyingAllFallbacks] = useState(false);
       const [showTikhubToken, setShowTikhubToken] = useState(false);
       const [showSearchKey, setShowSearchKey] = useState(false);
       const [isSaving, setIsSaving] = useState(false);
       const [authFlowId, setAuthFlowId] = useState('');
       const [authPlatform, setAuthPlatform] = useState<'xiaohongshu' | 'douyin' | ''>('');
       const [authQrImage, setAuthQrImage] = useState('');
       const [authStatus, setAuthStatus] = useState('');
       const [authMessage, setAuthMessage] = useState('');
       const [authRouteBase, setAuthRouteBase] = useState('');
       const [authMetrics, setAuthMetrics] = useState<AuthMetrics | null>(null);
       const [isAuthStarting, setIsAuthStarting] = useState(false);
       const [isAuthPolling, setIsAuthPolling] = useState(false);
       const [authExpiresAtMs, setAuthExpiresAtMs] = useState<number | null>(null);
       const [authExpiresInSec, setAuthExpiresInSec] = useState<number | null>(null);
       const [authTtlSec, setAuthTtlSec] = useState<number | null>(null);
       const [crawlerSessions, setCrawlerSessions] = useState<CrawlerSession[]>([]);
       const [isSessionsLoading, setIsSessionsLoading] = useState(false);
       const [crawlerHealth, setCrawlerHealth] = useState<CrawlerHealth | null>(null);
       const [isCrawlerHealthLoading, setIsCrawlerHealthLoading] = useState(false);
       const authPollTimerRef = useRef<number | null>(null);
       const activeFlowRef = useRef<string>('');
       const missingFlowStreakRef = useRef<{ flowId: string; count: number }>({ flowId: '', count: 0 });
       const manualConfirmArmedRef = useRef(false);
       const { toast } = useToast();

       // Local state for form to avoid rapid updates/re-renders on global store
       const [localSettings, setLocalSettings] = useState({
              llmFallbacks,
              llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
              enableXiaohongshu, enableDouyin: false, enableSelfCrawler, enableTikhubFallback,
              bochaApiKey, youApiKey, tavilyApiKey,
              imageGenBaseUrl, imageGenApiKey, imageGenModel
       });

       // Sync local state when dialog opens or store changes
       useEffect(() => {
              if (open) {
                    setLocalSettings({
                            llmFallbacks,
                            llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
                            enableXiaohongshu, enableDouyin: false, enableSelfCrawler, enableTikhubFallback,
                            bochaApiKey, youApiKey, tavilyApiKey,
                            imageGenBaseUrl, imageGenApiKey, imageGenModel
                     });
              }
       }, [open, llmFallbacks, llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken, enableXiaohongshu, enableDouyin, enableSelfCrawler, enableTikhubFallback, bochaApiKey, youApiKey, tavilyApiKey, imageGenBaseUrl, imageGenApiKey, imageGenModel]);

       const handleProviderChange = (value: 'openai' | 'deepseek' | 'custom') => {
              const providerConfig = PROVIDERS[value];
              setLocalSettings(prev => ({
                     ...prev,
                     llmProvider: value,
                     llmBaseUrl: providerConfig.baseUrl || prev.llmBaseUrl,
                     // Default to first model if available, else keep current or empty
                     llmModel: providerConfig.models[0] || prev.llmModel
              }));
       };

       const handleAddFallbackModel = () => {
              setLocalSettings(prev => ({
                     ...prev,
                     llmFallbacks: [
                            ...(Array.isArray(prev.llmFallbacks) ? prev.llmFallbacks : []),
                            { baseUrl: prev.llmBaseUrl || "https://api.openai.com/v1", apiKey: "", model: "" }
                     ]
              }));
              setFallbackVerifyStatus({});
       };

       const handleUpdateFallbackModel = (index: number, patch: Partial<FallbackLLM>) => {
              setLocalSettings(prev => ({
                     ...prev,
                     llmFallbacks: (Array.isArray(prev.llmFallbacks) ? prev.llmFallbacks : []).map((item, i) =>
                            i === index ? { ...item, ...patch } : item
                     )
              }));
              setFallbackVerifyStatus(prev => ({ ...prev, [index]: "idle" }));
       };

       const handleRemoveFallbackModel = (index: number) => {
              setLocalSettings(prev => ({
                     ...prev,
                     llmFallbacks: (Array.isArray(prev.llmFallbacks) ? prev.llmFallbacks : []).filter((_, i) => i !== index)
              }));
              setShowFallbackKeys(prev => {
                     const next = { ...prev };
                     delete next[index];
                     return next;
              });
              setFallbackVerifyStatus({});
       };

       const handleSave = async () => {
               setIsSaving(true);
               updateSettings(localSettings);
               toast({
                      title: "配置已保存",
                      description: "设置已保存到浏览器本地。",
                      className: "bg-green-50 border-green-200 text-green-800"
               });
               setIsSaving(false);
               setOpen?.(false);
        };

       const handleSaveToCloud = async () => {
               setIsSaving(true);
               updateSettings(localSettings);
               try {
                      await syncToCloud();
                      toast({
                             title: "配置已保存到云端",
                             description: "您的设置已加密保存，可跨设备使用。",
                             className: "bg-green-50 border-green-200 text-green-800"
                      });
               } catch (error) {
                      toast({
                             title: "云端同步失败",
                             description: "配置已保存到本地，云端同步失败。",
                             variant: "destructive"
                      });
               }
               setIsSaving(false);
        };

       const handleLoadFromCloud = async () => {
               try {
                      await syncFromCloud();
                      toast({
                             title: "已从云端恢复配置",
                             description: "云端配置已加载到本地。",
                             className: "bg-green-50 border-green-200 text-green-800"
                      });
               } catch (error) {
                      toast({
                             title: "从云端恢复失败",
                             variant: "destructive"
                      });
               }
        };

       const handleOpenChange = (newOpen: boolean) => {
               setOpen?.(newOpen);
        };

       const handleReset = () => {
              if (confirm("确定要恢复默认设置吗？")) {
                     resetSettings();
                    setLocalSettings({
                            llmFallbacks: [],
                            llmProvider: 'openai',
                            llmBaseUrl: 'https://api.openai.com/v1',
                            llmApiKey: '',
                            llmModel: 'gpt-4o',
                            tikhubToken: '',
                            enableXiaohongshu: true,
                            enableDouyin: false,
                            enableSelfCrawler: false,
                            enableTikhubFallback: true,
                            bochaApiKey: '',
                            youApiKey: '',
                            tavilyApiKey: '',
                            imageGenBaseUrl: 'https://api.openai.com/v1',
                            imageGenApiKey: '',
                            imageGenModel: 'dall-e-3',
                     });
                     toast({
                            title: "已重置",
                            description: "配置已恢复默认值。",
                     });
              }
       };

       // Export settings to JSON file
       const handleExport = () => {
              const normalizedFallbacks = normalizeFallbacks(localSettings.llmFallbacks);
              const exportData = {
                     version: 2,
                     exportedAt: new Date().toISOString(),
                     settings: {
                            ...localSettings,
                            llmFallbacks: normalizedFallbacks,
                     }
              };
              
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `vc-circle-config-${new Date().toISOString().split('T')[0]}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              
              toast({
                     title: "导出成功",
                     description: "配置文件已下载到本地",
                     className: "bg-green-50 border-green-200 text-green-800"
              });
       };

       // Import settings from JSON file
       const handleImport = () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = async (e) => {
                     const file = (e.target as HTMLInputElement).files?.[0];
                     if (!file) return;
                     
                     try {
                            const text = await file.text();
                            const importData = JSON.parse(text);
                             
                            const settings = isRecord(importData?.settings)
                                   ? importData.settings
                                   : (isRecord(importData) ? importData : null);

                            // Validate structure
                            if (!settings) {
                                   throw new Error('Invalid config file format');
                            }

                            const importedFallbacks = normalizeFallbacks(settings.llmFallbacks);

                            // Merge with current settings (only update fields that exist in imported data)
                            setLocalSettings(prev => {
                                   const next = { ...prev };

                                   if ("llmFallbacks" in settings) next.llmFallbacks = importedFallbacks;
                                   if ("llmProvider" in settings && typeof settings.llmProvider === "string") next.llmProvider = settings.llmProvider;
                                   if ("llmBaseUrl" in settings) next.llmBaseUrl = asString(settings.llmBaseUrl);
                                   if ("llmApiKey" in settings) next.llmApiKey = asString(settings.llmApiKey);
                                   if ("llmModel" in settings) next.llmModel = asString(settings.llmModel);
                                   if ("tikhubToken" in settings) next.tikhubToken = asString(settings.tikhubToken);
                                   if ("enableXiaohongshu" in settings && typeof settings.enableXiaohongshu === "boolean") next.enableXiaohongshu = settings.enableXiaohongshu;
                                   next.enableDouyin = false;
                                   next.enableSelfCrawler = false;
                                   next.enableTikhubFallback = true;
                                   if ("bochaApiKey" in settings) next.bochaApiKey = asString(settings.bochaApiKey);
                                   if ("youApiKey" in settings) next.youApiKey = asString(settings.youApiKey);
                                   if ("tavilyApiKey" in settings) next.tavilyApiKey = asString(settings.tavilyApiKey);
                                   if ("imageGenBaseUrl" in settings) next.imageGenBaseUrl = asString(settings.imageGenBaseUrl);
                                   if ("imageGenApiKey" in settings) next.imageGenApiKey = asString(settings.imageGenApiKey);
                                   if ("imageGenModel" in settings) next.imageGenModel = asString(settings.imageGenModel);

                                   return next;
                            });
                             
                            toast({
                                   title: "导入成功",
                                   description: `配置已加载（备用模型 ${importedFallbacks.length} 条），请点击保存以应用更改`,
                                   className: "bg-green-50 border-green-200 text-green-800"
                            });
                     } catch (error) {
                            toast({
                                   variant: "destructive",
                                   title: "导入失败",
                                   description: "配置文件格式无效"
                            });
                     }
              };
              input.click();
       };

       const verifyLlmConfig = async (cfg: { apiKey: string; baseUrl: string; model: string }) => {
              const { data, error } = await invokeFunction<{ valid: boolean; message?: string }>('verify-config', {
                     body: {
                            type: 'llm',
                            apiKey: cfg.apiKey,
                            baseUrl: cfg.baseUrl,
                            model: cfg.model
                     }
              });
              return { ok: !error && !!data?.valid, message: data?.message || error?.message || "连接失败，请检查配置" };
       };

       const handleVerifyLLM = async () => {
              if (!localSettings.llmApiKey || !localSettings.llmBaseUrl || !localSettings.llmModel) {
                     toast({ variant: "destructive", title: "请完整填写主模型配置" });
                     return;
              }
              const result = await verifyLlmConfig({
                     apiKey: localSettings.llmApiKey,
                     baseUrl: localSettings.llmBaseUrl,
                     model: localSettings.llmModel
              });

              if (!result.ok) {
                     toast({
                            variant: "destructive",
                            title: "主模型验证失败",
                            description: result.message
                     });
              } else {
                     // Auto-save on success
                     updateSettings({
                            llmApiKey: localSettings.llmApiKey,
                            llmBaseUrl: localSettings.llmBaseUrl,
                            llmProvider: localSettings.llmProvider,
                            llmModel: localSettings.llmModel,
                            llmFallbacks: localSettings.llmFallbacks
                     });
                     toast({
                            title: "主模型验证成功",
                            description: "配置已自动保存",
                            className: "bg-green-50 border-green-200 text-green-800"
                     });
              }
       };

       const handleVerifyFallback = async (index: number) => {
              const item = localSettings.llmFallbacks?.[index];
              if (!item || !item.apiKey || !item.baseUrl || !item.model) {
                     toast({ variant: "destructive", title: `备选 #${index + 1} 配置不完整` });
                     return;
              }
              setVerifyingFallbackIndex(index);
              const result = await verifyLlmConfig(item);
              setFallbackVerifyStatus(prev => ({ ...prev, [index]: result.ok ? "ok" : "fail" }));
              setVerifyingFallbackIndex(null);
              toast({
                     title: result.ok ? `备选 #${index + 1} 验证成功` : `备选 #${index + 1} 验证失败`,
                     description: result.ok ? "该模型可用" : result.message,
                     variant: result.ok ? "default" : "destructive"
              });
       };

       const handleVerifyAllFallbacks = async () => {
              const list = localSettings.llmFallbacks || [];
              if (list.length === 0) {
                     toast({ title: "暂无备选模型" });
                     return;
              }
              setIsVerifyingAllFallbacks(true);
              let okCount = 0;
              for (let i = 0; i < list.length; i++) {
                     const item = list[i];
                     if (!item?.apiKey || !item?.baseUrl || !item?.model) {
                            setFallbackVerifyStatus(prev => ({ ...prev, [i]: "fail" }));
                            continue;
                     }
                     const result = await verifyLlmConfig(item);
                     setFallbackVerifyStatus(prev => ({ ...prev, [i]: result.ok ? "ok" : "fail" }));
                     if (result.ok) okCount += 1;
              }
              setIsVerifyingAllFallbacks(false);
              toast({
                     title: "备选模型验证完成",
                     description: `可用 ${okCount}/${list.length}`,
                     variant: okCount > 0 ? "default" : "destructive"
              });
       };

       const [isVerifyingTikhub, setIsVerifyingTikhub] = useState(false);

       const handleVerifyTikhub = async () => {
              if (!localSettings.tikhubToken) {
                     toast({ variant: "destructive", title: "请先输入 TikHub Token" });
                     return;
              }
              setIsVerifyingTikhub(true);
              try {
                     const { data, error } = await invokeFunction<{ valid: boolean; message?: string }>('verify-config', {
                            body: { type: 'tikhub', apiKey: localSettings.tikhubToken }
                     });
                     if (error || !data?.valid) {
                            toast({
                                   variant: "destructive",
                                   title: "TikHub 验证失败",
                                   description: data?.message || error?.message || "连接失败，请检查 Token"
                            });
                     } else {
                            updateSettings({ tikhubToken: localSettings.tikhubToken });
                            toast({
                                   title: "TikHub 验证成功",
                                   description: data.message || "Token 有效，配置已自动保存",
                                   className: "bg-green-50 border-green-200 text-green-800"
                            });
                     }
              } catch (e) {
                     toast({ variant: "destructive", title: "验证请求失败" });
              }
              setIsVerifyingTikhub(false);
       };

       const handleVerifyImageGen = async () => {
       if (!localSettings.imageGenApiKey) {
              toast({ variant: "destructive", title: "请输入 API Key" });
              return;
       }
       const { data, error } = await invokeFunction<{ valid: boolean; message?: string }>('verify-config', {
              body: {
                     type: 'image_gen',
                     apiKey: localSettings.imageGenApiKey,
                     baseUrl: localSettings.imageGenBaseUrl,
                     model: localSettings.imageGenModel
              }
       });

       if (error || !data.valid) {
              toast({
                     variant: "destructive",
                     title: "验证失败",
                     description: data?.message || error?.message || "连接失败，请检查配置"
              });
       } else {
              // Auto-save on success
              updateSettings({
                     imageGenApiKey: localSettings.imageGenApiKey,
                     imageGenBaseUrl: localSettings.imageGenBaseUrl,
                     imageGenModel: localSettings.imageGenModel
              });
              toast({
                     title: "验证成功",
                     description: "AI 绘图配置已自动保存",
                     className: "bg-green-50 border-green-200 text-green-800"
              });
       }
  };

  const handleVerify = async (provider: string, apiKey: string) => {
       if (!apiKey) {
              toast({ variant: "destructive", title: "请输入 API Key" });
              return;
       }
       const { data, error } = await invokeFunction<{ valid: boolean; message?: string }>('verify-config', {
              body: { type: 'search', provider, apiKey }
       });

       if (error || !data.valid) {
              toast({
                     variant: "destructive",
                     title: "验证失败",
                     description: data?.message || error?.message || "请检查 Key 是否正确"
              });
       } else {
              // Auto-save on success
              const keyMap: Record<string, string> = {
                     bocha: 'bochaApiKey',
                     you: 'youApiKey',
                     tavily: 'tavilyApiKey'
              };
              const settingKey = keyMap[provider];
              if (settingKey) {
                     // @ts-ignore - dynamic key assignment
                     updateSettings({ [settingKey]: apiKey });
              }

              toast({
                     title: "验证成功",
                     description: `${provider} 配置已自动保存`,
                     className: "bg-green-50 border-green-200 text-green-800"
              });
       }
  };

  const fetchCrawlerSessions = async (silent = false) => {
       if (!user) {
              setCrawlerSessions([]);
              return;
       }
       setIsSessionsLoading(true);
       try {
              const { data, error } = await invokeFunction<{ sessions?: CrawlerSession[] }>('crawler-auth-sessions', {}, true);
              if (error) {
                     throw new Error(error.message || "拉取已授权会话失败");
              }
              const sessions = Array.isArray((data as any)?.sessions) ? (data as any).sessions : [];
              setCrawlerSessions(sessions as CrawlerSession[]);
       } catch (e) {
              if (!silent) {
                     toast({
                            variant: "destructive",
                            title: "会话列表加载失败",
                            description: (e as Error).message || "请稍后重试"
                     });
              }
       } finally {
              setIsSessionsLoading(false);
       }
  };

  const fetchCrawlerHealth = async (silent = false) => {
       setIsCrawlerHealthLoading(true);
       try {
              const { data, error } = await invokeFunction<CrawlerHealth>('crawler-health', { method: 'GET' }, true);
              if (error) {
                     throw new Error(error.message || "检测自爬服务状态失败");
              }
              setCrawlerHealth(data || null);
       } catch (e) {
              setCrawlerHealth({
                     enabled: false,
                     healthy: false,
                     reason: 'check_failed',
                     message: (e as Error).message || '检测失败',
              });
              if (!silent) {
                     toast({
                            variant: "destructive",
                            title: "自爬服务检测失败",
                            description: (e as Error).message || "请稍后重试"
                     });
              }
       } finally {
              setIsCrawlerHealthLoading(false);
       }
  };

  const handleStartCrawlerAuth = async (platform: 'xiaohongshu' | 'douyin') => {
       if (!user) {
              toast({ variant: "destructive", title: "请先登录后再扫码" });
              return;
       }
        if (!crawlerHealth?.healthy) {
              // Skip health check gate - let the backend handle availability
              console.log('[CrawlerAuth] Starting without health check gate');
        }
       setAuthPlatform(platform);
       setIsAuthStarting(true);
       try {
              if (authFlowId) {
                     await invokeFunction('crawler-auth-cancel', {
                            body: { flow_id: authFlowId }
                     }, true).catch(() => undefined);
              }
              setAuthFlowId('');
              setAuthQrImage('');
              setAuthStatus('');
              setAuthMessage('');
              setAuthRouteBase('');
              setAuthMetrics(null);
              setAuthExpiresAtMs(null);
              setAuthExpiresInSec(null);
              setAuthTtlSec(null);
              missingFlowStreakRef.current = { flowId: '', count: 0 };
              manualConfirmArmedRef.current = false;

              const { data, error } = await invokeFunction<any>('crawler-auth-start', {
                     body: { platform }
              }, true);
              if (error || !data) {
                     throw new Error(error?.message || "启动扫码失败");
              }
              const qrImage = data.qr_image_base64 || data.qr_image || data.qr_code_base64 || data.qrCode || data?.raw?.qr_image_base64 || '';
              if (data.status !== 'pending' || !qrImage) {
                     const detail = [
                            data.error,
                            data.message,
                            data.status ? `status=${data.status}` : "",
                            data.route_base ? `route=${data.route_base}` : "",
                     ].filter(Boolean).join(" | ");
                     throw new Error(detail || "未获取到二维码");
              }
              setAuthFlowId(data.flow_id || '');
              setAuthPlatform(platform);
              setAuthQrImage(qrImage);
              setAuthStatus('pending');
              setAuthRouteBase(typeof data.route_base === 'string' ? data.route_base : '');
              setAuthMessage(typeof data.message === 'string' ? data.message : "等待扫码并在手机端确认登录");
              setAuthMetrics(null);
              const ttlSec = Number(data.expires_in || 0);
              if (ttlSec > 0) {
                     setAuthTtlSec(ttlSec);
                     setAuthExpiresInSec(ttlSec);
                     setAuthExpiresAtMs(Date.now() + ttlSec * 1000);
              } else {
                     setAuthTtlSec(null);
                     setAuthExpiresInSec(null);
                     setAuthExpiresAtMs(null);
              }
              toast({
                     title: "二维码已生成",
                     description: `请用${platform === 'xiaohongshu' ? '小红书' : '抖音'}APP扫码登录`,
                     className: "bg-green-50 border-green-200 text-green-800"
              });
       } catch (e) {
              toast({
                     variant: "destructive",
                     title: "扫码会话启动失败",
                     description: (e as Error).message || "请稍后重试"
              });
              if (!authFlowId) {
                     setAuthPlatform('');
              }
       } finally {
              setIsAuthStarting(false);
       }
  };

  const handleCheckCrawlerAuthStatus = async (silent = false, manualConfirm = false) => {
       const checkingFlowId = authFlowId;
       if (!checkingFlowId) return;
       if (manualConfirm) {
              manualConfirmArmedRef.current = true;
       }
       const effectiveManualConfirm = manualConfirm || (authPlatform === 'xiaohongshu' && manualConfirmArmedRef.current);
       if (!silent) {
              setIsAuthPolling(true);
       }
       try {
              const { data, error } = await invokeFunction<any>('crawler-auth-status', {
                     body: {
                            flow_id: checkingFlowId,
                            manual_confirm: effectiveManualConfirm,
                     }
              }, true);
              if (error || !data) {
                     throw new Error(error?.message || "检查状态失败");
              }
              if (!activeFlowRef.current || activeFlowRef.current !== checkingFlowId) {
                     return;
              }
              if (typeof data.flow_id === 'string' && data.flow_id && data.flow_id !== checkingFlowId) {
                     return;
              }
              const status = data.status || 'pending';
              const prevStatus = authStatus;
              setAuthStatus(status);
              const metrics = (data.auth_metrics && typeof data.auth_metrics === 'object') ? (data.auth_metrics as AuthMetrics) : null;
              setAuthMetrics(metrics);
              if (typeof data.message === 'string' && data.message.trim()) {
                     setAuthMessage(data.message.trim());
              } else if (status === 'pending') {
                     setAuthMessage("等待扫码并在手机端确认登录");
              }
              if (typeof data.expires_in === 'number' && Number.isFinite(data.expires_in)) {
                     const left = Math.max(0, Math.floor(data.expires_in));
                     setAuthExpiresInSec(left);
                     if (left > 0) {
                            setAuthExpiresAtMs(Date.now() + left * 1000);
                     }
              } else if (authExpiresAtMs) {
                     const left = Math.max(0, Math.ceil((authExpiresAtMs - Date.now()) / 1000));
                     setAuthExpiresInSec(left);
              }
              if (status === 'authorized') {
                     const sessionSaved = data.session_saved === true;
                     const cookieCount = metrics?.cookie_count_total ?? 0;
                     if (!sessionSaved || cookieCount <= 0) {
                            setAuthStatus('pending');
                            if (!silent) {
                                   toast({
                                          variant: "destructive",
                                          title: "登录状态异常",
                                          description: "检测到异常授权结果，请重新扫码确认登录"
                                   });
                            }
                            return;
                     }
                     if (prevStatus !== 'authorized') {
                            const requiredTotal = (metrics?.required_all?.length || 0) + ((metrics?.required_any?.length || 0) > 0 ? 1 : 0);
                            const requiredReady = (metrics?.required_all_present || 0) + (((metrics?.required_any?.length || 0) > 0 && metrics?.required_any_ok) ? 1 : 0);
                            toast({
                                   title: "登录成功",
                                   description: `会话已保存（Cookie ${cookieCount} 个，关键 ${requiredReady}/${requiredTotal || 0}）`,
                                   className: "bg-green-50 border-green-200 text-green-800"
                            });
                     }
                     setAuthFlowId('');
                     setAuthQrImage('');
                     setAuthPlatform('');
                     setAuthRouteBase('');
                     setAuthExpiresAtMs(null);
                     setAuthExpiresInSec(null);
                     setAuthTtlSec(null);
                     manualConfirmArmedRef.current = false;
                     setAuthMessage(typeof data.message === 'string' ? data.message : "扫码登录成功，会话已保存");
                     await fetchCrawlerSessions(true);
              } else if (status === 'expired' || status === 'failed') {
                     const missingFlow = status === 'expired' && data.error === 'flow_not_found_or_expired';
                     if (missingFlow) {
                            const prev = missingFlowStreakRef.current;
                            const nextCount = prev.flowId === checkingFlowId ? prev.count + 1 : 1;
                            missingFlowStreakRef.current = { flowId: checkingFlowId, count: nextCount };
                            if (nextCount < 3) {
                                   setAuthStatus('pending');
                                   setAuthMessage('会话同步中，正在重试状态检测...');
                                   return;
                            }
                     } else {
                            missingFlowStreakRef.current = { flowId: '', count: 0 };
                     }
                     setAuthFlowId('');
                     setAuthQrImage('');
                     setAuthRouteBase('');
                     setAuthExpiresAtMs(null);
                     setAuthExpiresInSec(null);
                     setAuthTtlSec(null);
                     manualConfirmArmedRef.current = false;
                     setAuthMessage(typeof data.message === 'string' ? data.message : "扫码会话已失效，请重新生成二维码");
                     if (!silent) {
                            toast({
                                   variant: "destructive",
                                   title: "扫码会话已失效",
                                   description: data.error || "请重新生成二维码",
                            });
                     }
              } else if (!silent) {
                     toast({
                            title: "尚未完成扫码",
                            description: "请扫码并在手机端确认登录",
                     });
              }
       } catch (e) {
              if (!silent) {
                     toast({
                            variant: "destructive",
                            title: "状态检查失败",
                            description: (e as Error).message || "请稍后重试"
                     });
              }
       } finally {
              if (!silent) {
                     setIsAuthPolling(false);
              }
       }
  };

  const handleCancelCrawlerAuth = async () => {
       if (!authFlowId) return;
       try {
              await invokeFunction('crawler-auth-cancel', {
                     body: { flow_id: authFlowId }
              }, true);
       } catch {
              // best-effort cancel
       } finally {
              setAuthFlowId('');
              setAuthPlatform('');
              setAuthQrImage('');
              setAuthStatus('');
              setAuthMessage('');
              setAuthRouteBase('');
              setAuthMetrics(null);
              setAuthExpiresAtMs(null);
              setAuthExpiresInSec(null);
              setAuthTtlSec(null);
              manualConfirmArmedRef.current = false;
       }
  };

  const handleRevokeCrawlerSession = async (platform: 'xiaohongshu' | 'douyin') => {
       if (!user) return;
       setIsSessionsLoading(true);
       try {
              const { data, error } = await invokeFunction<any>('crawler-auth-revoke', {
                     body: { platform }
              }, true);
              if (error) {
                     throw new Error(error.message || "吊销会话失败");
              }
              if (!(data as any)?.success) {
                     throw new Error((data as any)?.error || "吊销会话失败");
              }
              toast({
                     title: "会话已吊销",
                     description: `${platform === 'xiaohongshu' ? '小红书' : '抖音'}会话已移除`,
                     className: "bg-green-50 border-green-200 text-green-800"
              });
              await fetchCrawlerSessions(true);
       } catch (e) {
              toast({
                     variant: "destructive",
                     title: "吊销失败",
                     description: (e as Error).message || "请稍后重试"
              });
       } finally {
              setIsSessionsLoading(false);
       }
  };

  const formatAuthStatus = (status: string) => {
       switch (status) {
              case 'pending': return '待确认';
              case 'authorized': return '已授权';
              case 'expired': return '已过期';
              case 'failed': return '失败';
              case 'cancelled': return '已取消';
              default: return status || '待扫码';
       }
  };

  useEffect(() => {
       if (!open) return;
       if (!user) {
              setCrawlerSessions([]);
              return;
       }
       void fetchCrawlerHealth(true);
       void fetchCrawlerSessions(true);
  }, [open, user?.id]);

  useEffect(() => {
       if (!open || !authFlowId || authStatus !== 'pending') {
              if (authPollTimerRef.current) {
                     window.clearInterval(authPollTimerRef.current);
                     authPollTimerRef.current = null;
              }
              return;
       }
       if (authPollTimerRef.current) {
              window.clearInterval(authPollTimerRef.current);
       }
       activeFlowRef.current = authFlowId;
       authPollTimerRef.current = window.setInterval(() => {
              void handleCheckCrawlerAuthStatus(true, false);
       }, 3000);
       return () => {
              if (authPollTimerRef.current) {
                     window.clearInterval(authPollTimerRef.current);
                     authPollTimerRef.current = null;
              }
       };
  }, [open, authFlowId, authStatus, authRouteBase, authPlatform]);

  useEffect(() => {
       activeFlowRef.current = authFlowId;
  }, [authFlowId]);

  useEffect(() => {
       if (!open || !authFlowId || authStatus !== 'pending' || !authExpiresAtMs) return;
       const tick = () => {
              const left = Math.max(0, Math.ceil((authExpiresAtMs - Date.now()) / 1000));
              setAuthExpiresInSec(left);
       };
       tick();
       const timer = window.setInterval(tick, 1000);
       return () => window.clearInterval(timer);
  }, [open, authFlowId, authStatus, authExpiresAtMs]);

  return (
       <Dialog open={open} onOpenChange={handleOpenChange}>
              {trigger ? (
                     <DialogTrigger asChild>
                            {trigger}
                     </DialogTrigger>
              ) : (
                     !isControlled && (
                            <DialogTrigger asChild>
                                   <Button variant="ghost" size="icon" className="rounded-full">
                                          <Settings className="w-5 h-5" />
                                   </Button>
                            </DialogTrigger>
                     )
              )}
              <DialogContent className="sm:max-w-[425px] overflow-y-auto max-h-[90vh]">
                     <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                   系统配置
                                   {user && (
                                          <span className="flex items-center gap-1 text-xs font-normal">
                                                 {isLoading ? (
                                                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                                                 ) : isSynced ? (
                                                        <Cloud className="w-3 h-3 text-green-500" />
                                                 ) : (
                                                        <CloudOff className="w-3 h-3 text-muted-foreground" />
                                                 )}
                                                 <span className="text-muted-foreground">
                                                        {isLoading ? "同步中..." : isSynced ? "已同步" : "未同步"}
                                                 </span>
                                          </span>
                                   )}
                            </DialogTitle>
                            <DialogDescription className="sr-only">
                                   配置大模型与数据源，用于创意验证与报告生成。
                            </DialogDescription>
                            {!user && (
                                   <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                                          💡 登录后配置将加密保存到云端，跨设备自动同步
                                   </p>
                            )}
                     </DialogHeader>
                     <div className="grid gap-6 py-4">

                            {/* Built-in config notice for non-admin users */}
                            {!isAdmin && (
                                   <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
                                          <p className="text-sm font-medium">✨ 内置配置已就绪</p>
                                          <p className="text-xs text-muted-foreground">
                                                 大模型（LLM）、竞品搜索、AI 绘图均已内置配置，无需额外设置即可使用。如需自定义 TikHub Token 以获取更多社交数据，可在下方填写。
                                          </p>
                                   </div>
                            )}

                            {/* LLM Settings - Admin only */}
                            {isAdmin && (
                            <div className="space-y-4">
                                   <h4 className="font-medium flex items-center justify-between">
                                          <span className="flex items-center gap-2">🤖 大模型配置 (LLM)</span>
                                          <a
                                                 href={localSettings.llmProvider === 'deepseek'
                                                        ? "https://platform.deepseek.com/api_keys"
                                                        : "https://platform.openai.com/api-keys"
                                                 }
                                                 target="_blank"
                                                 rel="noopener noreferrer"
                                                 className="text-xs text-primary hover:underline flex items-center gap-1"
                                          >
                                                 获取 API Key <ExternalLink className="w-3 h-3" />
                                          </a>
                                   </h4>
                                   <div className="grid gap-2">
                                          <Label>提供商 Provider</Label>
                                          <Select
                                                 value={localSettings.llmProvider}
                                                 onValueChange={(val: any) => handleProviderChange(val)}
                                          >
                                                 <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                                                 <SelectContent>
                                                        {Object.entries(PROVIDERS).map(([key, config]) => (
                                                               <SelectItem key={key} value={key}>{config.name}</SelectItem>
                                                        ))}
                                                 </SelectContent>
                                          </Select>
                                   </div>
                                   <div className="grid gap-2">
                                          <Label>API Base URL</Label>
                                          <Input value={localSettings.llmBaseUrl} onChange={(e) => setLocalSettings(s => ({ ...s, llmBaseUrl: e.target.value }))} />
                                   </div>
                                   <div className="grid gap-2">
                                          <Label>API Key</Label>
                                          <div className="flex gap-2">
                                                 <div className="relative flex-1">
                                                        <Input type={showKey ? "text" : "password"} value={localSettings.llmApiKey} onChange={(e) => setLocalSettings(s => ({ ...s, llmApiKey: e.target.value }))} className="pr-10" />
                                                        <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><Eye className="w-4 h-4" /></button>
                                                 </div>
                                                 <Button variant="outline" size="sm" onClick={handleVerifyLLM}>验证</Button>
                                          </div>
                                   </div>
                                   <div className="grid gap-2">
                                          <Label>模型名称 Model Name</Label>
                                          <Input value={localSettings.llmModel} onChange={(e) => setLocalSettings(s => ({ ...s, llmModel: e.target.value }))} list="model-suggestions" />
                                          <datalist id="model-suggestions">
                                                 {localSettings.llmProvider !== 'custom' && PROVIDERS[localSettings.llmProvider]?.models.map(m => <option key={m} value={m} />)}
                                          </datalist>
                                   </div>

                                   <div className="space-y-3 rounded-lg border p-3 bg-muted/10">
                                          <div className="flex items-center justify-between">
                                                 <Label>备选模型（主模型失败自动切换）</Label>
                                                 <div className="flex items-center gap-2">
                                                        <Button type="button" variant="outline" size="sm" onClick={handleVerifyAllFallbacks} disabled={isVerifyingAllFallbacks}>
                                                               {isVerifyingAllFallbacks ? "验证中..." : "验证全部"}
                                                        </Button>
                                                        <Button type="button" variant="outline" size="sm" onClick={handleAddFallbackModel}>
                                                               新增备选
                                                        </Button>
                                                 </div>
                                          </div>
                                          {(localSettings.llmFallbacks || []).length === 0 ? (
                                                 <p className="text-xs text-muted-foreground">未配置备选模型。建议至少配置 1 个。</p>
                                          ) : (
                                                 <div className="space-y-3">
                                                        {(localSettings.llmFallbacks || []).map((item, index) => (
                                                               <div key={index} className="rounded border bg-background p-3 space-y-2">
                                                                      <div className="flex items-center justify-between">
                                                                             <p className="text-xs font-medium text-muted-foreground">备选 #{index + 1}</p>
                                                                             <div className="flex items-center gap-2">
                                                                                    {fallbackVerifyStatus[index] === "ok" && (
                                                                                           <span className="text-[11px] text-green-600">可用</span>
                                                                                    )}
                                                                                    {fallbackVerifyStatus[index] === "fail" && (
                                                                                           <span className="text-[11px] text-destructive">不可用</span>
                                                                                    )}
                                                                                    <Button
                                                                                           type="button"
                                                                                           variant="outline"
                                                                                           size="sm"
                                                                                           onClick={() => handleVerifyFallback(index)}
                                                                                           disabled={verifyingFallbackIndex === index}
                                                                                    >
                                                                                           {verifyingFallbackIndex === index ? "验证中" : "验证"}
                                                                                    </Button>
                                                                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveFallbackModel(index)}>
                                                                                           <Trash2 className="w-4 h-4" />
                                                                                    </Button>
                                                                             </div>
                                                                      </div>
                                                                      <Input
                                                                             placeholder="API Base URL"
                                                                             value={item.baseUrl}
                                                                             onChange={(e) => handleUpdateFallbackModel(index, { baseUrl: e.target.value })}
                                                                      />
                                                                      <div className="relative">
                                                                             <Input
                                                                                    type={showFallbackKeys[index] ? "text" : "password"}
                                                                                    placeholder="API Key"
                                                                                    value={item.apiKey}
                                                                                    onChange={(e) => handleUpdateFallbackModel(index, { apiKey: e.target.value })}
                                                                                    className="pr-10"
                                                                             />
                                                                             <button
                                                                                    type="button"
                                                                                    onClick={() => setShowFallbackKeys(prev => ({ ...prev, [index]: !prev[index] }))}
                                                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                                                                             >
                                                                                    <Eye className="w-4 h-4" />
                                                                             </button>
                                                                      </div>
                                                                      <Input
                                                                             placeholder="Model Name"
                                                                             value={item.model}
                                                                             onChange={(e) => handleUpdateFallbackModel(index, { model: e.target.value })}
                                                                      />
                                                               </div>
                                                        ))}
                                                 </div>
                                          )}
                                   </div>
                            </div>
                            )}

                            <hr className="border-gray-100" />

                            {/* Tikhub Settings - visible to all users */}
                            <div className="space-y-4">
                                   <h4 className="font-medium flex items-center justify-between">
                                          <span className="flex items-center gap-2">📊 数据源配置 (Tikhub)</span>
                                          <a
                                                 href="https://tikhub.io/users/api_keys"
                                                 target="_blank"
                                                 rel="noopener noreferrer"
                                                 className="text-xs text-primary hover:underline flex items-center gap-1"
                                          >
                                                 获取 Token <ExternalLink className="w-3 h-3" />
                                          </a>
                                   </h4>
                                    <div className="grid gap-2">
                                           <Label>Tikhub API Token</Label>
                                           <div className="relative">
                                                  <Input type={showTikhubToken ? "text" : "password"} value={localSettings.tikhubToken} onChange={(e) => setLocalSettings(s => ({ ...s, tikhubToken: e.target.value }))} className="pr-10" />
                                                  <button type="button" onClick={() => setShowTikhubToken(!showTikhubToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><Eye className="w-4 h-4" /></button>
                                           </div>
                                           <Button variant="outline" size="sm" onClick={handleVerifyTikhub} disabled={isVerifyingTikhub || !localSettings.tikhubToken}>
                                                  {isVerifyingTikhub ? (
                                                         <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />验证中...</span>
                                                  ) : '测试连通性'}
                                           </Button>
                                    </div>
                            </div>

                            <div className="space-y-4">
                            {isAdmin && (
                                   <>
                                   <div className="space-y-3 pt-2">
                                          <Label className="text-sm text-muted-foreground">账号扫码登录（自爬优先）</Label>
                                          <div className="rounded-lg border bg-muted/10 p-2">
                                                 {isCrawlerHealthLoading ? (
                                                        <p className="text-xs text-muted-foreground">检测自爬服务状态中...</p>
                                                 ) : crawlerHealth?.healthy ? (
                                                        <p className="text-xs text-green-600">
                                                               自爬服务在线{typeof crawlerHealth?.latency_ms === 'number' ? ` · ${crawlerHealth.latency_ms}ms` : ''}
                                                        </p>
                                                 ) : (
                                                        <p className="text-xs text-destructive">
                                                               自爬服务未连接：{crawlerHealth?.message || 'Crawler service disabled'}
                                                        </p>
                                                 )}
                                          </div>
                                          <div className="flex gap-2">
                                                 <Button variant="outline" size="sm" className="flex-1" onClick={() => handleStartCrawlerAuth('xiaohongshu')} disabled={isAuthStarting}>
                                                        {isAuthStarting && authPlatform === 'xiaohongshu' ? (
                                                               <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />生成中</span>
                                                        ) : '小红书扫码'}
                                                 </Button>
                                                 <Button variant="outline" size="sm" className="flex-1" onClick={() => handleStartCrawlerAuth('douyin')} disabled={isAuthStarting}>
                                                        {isAuthStarting && authPlatform === 'douyin' ? (
                                                               <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />生成中</span>
                                                        ) : '抖音扫码'}
                                                 </Button>
                                          </div>
                                          {authQrImage && (
                                                 <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                                                        <p className="text-xs text-muted-foreground">
                                                               当前会话：{authPlatform === 'xiaohongshu' ? '小红书' : '抖音'} | 状态：{formatAuthStatus(authStatus)}{isAuthPolling ? '（检测中）' : ''}
                                                        </p>
                                                        {authMessage && (
                                                               <p className="text-[11px] text-muted-foreground">{authMessage}</p>
                                                        )}
                                                        {authMetrics && (
                                                               <div className="grid grid-cols-3 gap-2 text-[11px]">
                                                                      <div className="rounded border bg-background px-2 py-1">
                                                                             <p className="text-muted-foreground">Cookie</p>
                                                                             <p className="font-medium">{authMetrics.cookie_count_total}</p>
                                                                      </div>
                                                                      <div className="rounded border bg-background px-2 py-1">
                                                                             <p className="text-muted-foreground">关键(All)</p>
                                                                             <p className="font-medium">{authMetrics.required_all_present}/{authMetrics.required_all.length}</p>
                                                                      </div>
                                                                      <div className="rounded border bg-background px-2 py-1">
                                                                             <p className="text-muted-foreground">关键(Any)</p>
                                                                             <p className="font-medium">{authMetrics.required_any.length > 0 ? `${authMetrics.required_any_present}/${authMetrics.required_any.length}` : '-'}</p>
                                                                      </div>
                                                               </div>
                                                        )}
                                                        <p className="text-[11px] text-muted-foreground">
                                                               自动检测中（每 3 秒）{typeof authExpiresInSec === 'number' ? ` · ${authExpiresInSec}s 后过期` : ''}
                                                        </p>
                                                        {(typeof authTtlSec === 'number' && typeof authExpiresInSec === 'number' && authTtlSec > 0) && (
                                                               <div className="h-1.5 w-full rounded bg-muted">
                                                                      <div className="h-1.5 rounded bg-primary transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, (authExpiresInSec / authTtlSec) * 100))}%` }} />
                                                               </div>
                                                        )}
                                                        <img src={`data:image/png;base64,${authQrImage}`} alt="crawler login qr" className="w-44 h-44 object-contain bg-white rounded border" />
                                                        <div className="flex gap-2">
                                                               <Button variant="outline" size="sm" onClick={() => handleCheckCrawlerAuthStatus(false, true)} disabled={isAuthPolling}>
                                                                      {isAuthPolling ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />检测中</span> : '检查登录状态'}
                                                               </Button>
                                                               <Button variant="ghost" size="sm" onClick={handleCancelCrawlerAuth} disabled={isAuthPolling}>
                                                                      取消会话
                                                               </Button>
                                                        </div>
                                                 </div>
                                          )}
                                          <div className="rounded-lg border bg-muted/10 p-3 space-y-2">
                                                 <div className="flex items-center justify-between">
                                                        <p className="text-xs text-muted-foreground">已授权会话</p>
                                                        <Button variant="ghost" size="sm" onClick={() => fetchCrawlerSessions(false)} disabled={isSessionsLoading}>刷新</Button>
                                                 </div>
                                                 {isSessionsLoading ? (
                                                        <p className="text-xs text-muted-foreground">加载中...</p>
                                                 ) : crawlerSessions.length === 0 ? (
                                                        <p className="text-xs text-muted-foreground">暂无已授权会话，可先扫码登录。</p>
                                                 ) : (
                                                        <div className="space-y-2">
                                                               {crawlerSessions.map((session) => (
                                                                      <div key={session.session_id} className="flex items-center justify-between rounded border bg-background px-2 py-1.5">
                                                                             <div>
                                                                                    <p className="text-xs font-medium">
                                                                                           {session.platform === 'xiaohongshu' ? '小红书' : session.platform === 'douyin' ? '抖音' : session.platform}
                                                                                           {' · '}{session.status}
                                                                                    </p>
                                                                                    <p className="text-[11px] text-muted-foreground">
                                                                                           {session.updated_at ? new Date(session.updated_at).toLocaleString() : '未知时间'}
                                                                                    </p>
                                                                             </div>
                                                                             <Button variant="ghost" size="sm" onClick={() => handleRevokeCrawlerSession((session.platform === 'douyin' ? 'douyin' : 'xiaohongshu'))}>吊销</Button>
                                                                      </div>
                                                               ))}
                                                        </div>
                                                 )}
                                          </div>
                                   </div>

                                   <div className="space-y-3 pt-2">
                                          <Label className="text-sm text-muted-foreground">采集执行策略</Label>
                                          <div className="p-3 rounded-lg bg-muted/30 border">
                                                 <p className="font-medium text-sm">固定策略：仅使用 TikHub</p>
                                                 <p className="text-xs text-muted-foreground">
                                                        当前版本已全局关闭自爬链路，验证与补充社交数据将统一通过 TikHub 执行。
                                                 </p>
                                          </div>
                                   </div>
                                   </>
                            )}

                                     {/* Data Source Toggles */}
                                    <div className="space-y-3 pt-2">
                                          <Label className="text-sm text-muted-foreground">选择数据源平台</Label>
                                          
                                          {/* Xiaohongshu Toggle */}
                                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                                                 <div className="flex items-center gap-3">
                                                        <span className="text-xl">📕</span>
                                                        <div>
                                                               <p className="font-medium text-sm">小红书</p>
                                                               <p className="text-xs text-muted-foreground">时尚美妆、生活方式、种草内容</p>
                                                        </div>
                                                 </div>
                                                 <Switch
                                                        checked={localSettings.enableXiaohongshu}
                                                        onCheckedChange={(checked) => setLocalSettings(s => ({ ...s, enableXiaohongshu: checked }))}
                                                 />
                                          </div>

                                          {/* Douyin Toggle */}
                                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                                                 <div className="flex items-center gap-3">
                                                        <span className="text-xl">🎵</span>
                                                        <div>
                                                               <p className="font-medium text-sm">抖音</p>
                                                               <p className="text-xs text-muted-foreground">当前已关闭（暂不采集）</p>
                                                        </div>
                                                 </div>
                                                 <Switch
                                                        checked={false}
                                                        disabled
                                                 />
                                          </div>

                                          {!localSettings.enableXiaohongshu && !localSettings.enableDouyin && (
                                                 <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                                        ⚠️ 请至少启用一个数据源平台
                                                 </p>
                                          )}
                                   </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Search Settings Section - Admin only */}
                            {isAdmin && (
                            <div className="space-y-4">
                                   <h4 className="font-medium flex items-center gap-2">
                                          🔍 竞品搜索配置 (多源并行)
                                   </h4>
                                   <p className="text-xs text-muted-foreground">
                                          配置多个搜索引擎可提高竞品分析的全面性。系统将并行搜索所有已配置的服务。
                                   </p>

                                   {/* Bocha Settings */}
                                   <div className="grid gap-2 border-l-2 border-primary/20 pl-4">
                                          <Label className="flex justify-between items-center">
                                                 <span className="flex items-center gap-2">
                                                        博查 (Bocha) {localSettings.bochaApiKey && <span className="text-xs text-green-500">已填</span>}
                                                 </span>
                                                 <a
                                                        href="https://open.bochaai.com/"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                                                 >
                                                        获取 <ExternalLink className="w-3 h-3" />
                                                 </a>
                                          </Label>
                                          <div className="flex gap-2">
                                                 <div className="relative flex-1">
                                                        <Input
                                                               type={showSearchKey ? "text" : "password"}
                                                               value={localSettings.bochaApiKey}
                                                               onChange={(e) => setLocalSettings(s => ({ ...s, bochaApiKey: e.target.value }))}
                                                               placeholder="sk-..."
                                                               className="pr-10"
                                                        />
                                                        <button type="button" onClick={() => setShowSearchKey(!showSearchKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><Eye className="w-4 h-4" /></button>
                                                 </div>
                                                 <Button variant="outline" size="sm" onClick={() => handleVerify('bocha', localSettings.bochaApiKey)}>验证</Button>
                                          </div>
                                   </div>

                                   {/* You.com Settings */}
                                   <div className="grid gap-2 border-l-2 border-secondary/20 pl-4">
                                          <Label className="flex justify-between items-center">
                                                 <span className="flex items-center gap-2">
                                                        You.com {localSettings.youApiKey && <span className="text-xs text-green-500">已填</span>}
                                                 </span>
                                                 <a
                                                        href="https://you.com/api"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                                                 >
                                                        获取 <ExternalLink className="w-3 h-3" />
                                                 </a>
                                          </Label>
                                          <div className="flex gap-2">
                                                 <div className="relative flex-1">
                                                        <Input
                                                               type={showSearchKey ? "text" : "password"}
                                                               value={localSettings.youApiKey}
                                                               onChange={(e) => setLocalSettings(s => ({ ...s, youApiKey: e.target.value }))}
                                                               placeholder="You.com API Key"
                                                               className="pr-10"
                                                        />
                                                 </div>
                                                 <Button variant="outline" size="sm" onClick={() => handleVerify('you', localSettings.youApiKey)}>验证</Button>
                                          </div>
                                   </div>

                                   {/* Tavily Settings */}
                                   <div className="grid gap-2 border-l-2 border-accent/20 pl-4">
                                          <Label className="flex justify-between items-center">
                                                 <span className="flex items-center gap-2">
                                                        Tavily {localSettings.tavilyApiKey && <span className="text-xs text-green-500">已填</span>}
                                                 </span>
                                                 <a
                                                        href="https://app.tavily.com/home"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                                                 >
                                                        获取 <ExternalLink className="w-3 h-3" />
                                                 </a>
                                          </Label>
                                          <div className="flex gap-2">
                                                 <div className="relative flex-1">
                                                        <Input
                                                               type={showSearchKey ? "text" : "password"}
                                                               value={localSettings.tavilyApiKey}
                                                               onChange={(e) => setLocalSettings(s => ({ ...s, tavilyApiKey: e.target.value }))}
                                                               placeholder="tvly-..."
                                                               className="pr-10"
                                                        />
                                                 </div>
                                                 <Button variant="outline" size="sm" onClick={() => handleVerify('tavily', localSettings.tavilyApiKey)}>验证</Button>
                                          </div>
                                   </div>
                            </div>
                            )}

                            {/* Image Generation Settings - Admin only */}
                            {isAdmin && (
                            <>
                            <hr className="border-gray-100" />
                            <div className="space-y-4">
                                   <h4 className="font-medium flex items-center justify-between">
                                          <span className="flex items-center gap-2">🎨 AI 绘图配置 (OpenAI Compatible)</span>
                                   </h4>
                                   <div className="grid gap-2">
                                          <Label>API Base URL</Label>
                                          <Input
                                                 value={localSettings.imageGenBaseUrl}
                                                 onChange={(e) => setLocalSettings(s => ({ ...s, imageGenBaseUrl: e.target.value }))}
                                                 placeholder="https://api.openai.com/v1"
                                          />
                                   </div>
                                   <div className="grid gap-2">
                                          <Label>API Key</Label>
                                          <div className="flex gap-2">
                                                 <div className="relative flex-1">
                                                        <Input
                                                               type={showKey ? "text" : "password"}
                                                               value={localSettings.imageGenApiKey}
                                                               onChange={(e) => setLocalSettings(s => ({ ...s, imageGenApiKey: e.target.value }))}
                                                               className="pr-10"
                                                        />
                                                        <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><Eye className="w-4 h-4" /></button>
                                                 </div>
                                                 <Button variant="outline" size="sm" onClick={handleVerifyImageGen}>验证</Button>
                                          </div>
                                   </div>
                                   <div className="grid gap-2">
                                          <Label>模型名称 Model Name</Label>
                                          <Input
                                                 value={localSettings.imageGenModel}
                                                 onChange={(e) => setLocalSettings(s => ({ ...s, imageGenModel: e.target.value }))}
                                                 placeholder="dall-e-3"
                                          />
                                   </div>
                            </div>
                            </>
                            )}
                     </div>

                     <div className="flex flex-col gap-3 mt-4">
                            {/* Import/Export buttons - Admin only */}
                            {isAdmin && (
                            <div className="flex gap-2">
                                   <Button variant="outline" size="sm" onClick={handleImport} className="flex-1">
                                          <Upload className="w-4 h-4 mr-2" />
                                          导入配置
                                   </Button>
                                   <Button variant="outline" size="sm" onClick={handleExport} className="flex-1">
                                          <Download className="w-4 h-4 mr-2" />
                                          导出配置
                                   </Button>
                            </div>
                            )}
                            
                            {/* Data export/import for migration */}
                            {user && (
                                   <div className="pt-2 border-t border-border/50 space-y-2">
                                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                 <Database className="w-4 h-4" />
                                                 <span>数据迁移</span>
                                          </div>
                                          <div className="flex gap-2">
                                                 <ExportDataButton />
                                                 <ImportDataButton />
                                          </div>
                                   </div>
                            )}
                            
                             {/* Cloud sync buttons */}
                             {user && (
                                    <div className="flex gap-2 pt-2 border-t border-border/50">
                                           <Button variant="outline" size="sm" onClick={handleLoadFromCloud} disabled={isLoading} className="flex-1">
                                                  <Cloud className="w-4 h-4 mr-1" />
                                                  从云端恢复
                                           </Button>
                                           <Button variant="outline" size="sm" onClick={handleSaveToCloud} disabled={isSaving || isLoading} className="flex-1">
                                                  <Upload className="w-4 h-4 mr-1" />
                                                  同步到云端
                                           </Button>
                                    </div>
                             )}

                             {/* Main action buttons */}
                             <div className="flex justify-between">
                                    <Button variant="outline" onClick={handleReset} className="text-muted-foreground">
                                           <RotateCcw className="w-4 h-4 mr-2" />
                                           重置默认
                                    </Button>
                                    <Button onClick={handleSave} disabled={isSaving}>
                                           {isSaving ? (
                                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                           ) : (
                                                  <Save className="w-4 h-4 mr-2" />
                                           )}
                                           保存配置
                                    </Button>
                             </div>
                     </div>
              </DialogContent>
       </Dialog>
);
};
