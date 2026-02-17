import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/useSettings";
import { Settings, Eye, Save, RotateCcw, ExternalLink, Cloud, CloudOff, Loader2, Download, Upload, Database } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { invokeFunction } from "@/lib/invokeFunction";
import { useAuth } from "@/hooks/useAuth";
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

export const SettingsDialog = ({ open: controlledOpen, onOpenChange: controlledOnOpenChange, trigger }: SettingsDialogProps) => {
       const {
              llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
              enableXiaohongshu, enableDouyin, enableSelfCrawler, enableTikhubFallback,
              bochaApiKey, youApiKey, tavilyApiKey,
              imageGenBaseUrl, imageGenApiKey, imageGenModel,
              updateSettings, resetSettings,
              isLoading, isSynced, syncToCloud, syncFromCloud
       } = useSettings();
       
       const { user } = useAuth();

       const [internalOpen, setInternalOpen] = useState(false);

       const isControlled = controlledOpen !== undefined;
       const open = isControlled ? controlledOpen : internalOpen;
       const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;

       const [showKey, setShowKey] = useState(false);
       const [showTikhubToken, setShowTikhubToken] = useState(false);
       const [showSearchKey, setShowSearchKey] = useState(false);
       const [isSaving, setIsSaving] = useState(false);
       const [authFlowId, setAuthFlowId] = useState('');
       const [authPlatform, setAuthPlatform] = useState<'xiaohongshu' | 'douyin' | ''>('');
       const [authQrImage, setAuthQrImage] = useState('');
       const [authStatus, setAuthStatus] = useState('');
       const [isAuthLoading, setIsAuthLoading] = useState(false);
       const [crawlerSessions, setCrawlerSessions] = useState<CrawlerSession[]>([]);
       const [isSessionsLoading, setIsSessionsLoading] = useState(false);
       const { toast } = useToast();

       // Local state for form to avoid rapid updates/re-renders on global store
       const [localSettings, setLocalSettings] = useState({
              llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
              enableXiaohongshu, enableDouyin, enableSelfCrawler, enableTikhubFallback,
              bochaApiKey, youApiKey, tavilyApiKey,
              imageGenBaseUrl, imageGenApiKey, imageGenModel
       });

       // Sync local state when dialog opens or store changes
       useEffect(() => {
              if (open) {
                     setLocalSettings({
                            llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
                            enableXiaohongshu, enableDouyin, enableSelfCrawler, enableTikhubFallback,
                            bochaApiKey, youApiKey, tavilyApiKey,
                            imageGenBaseUrl, imageGenApiKey, imageGenModel
                     });
              }
       }, [open, llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken, enableXiaohongshu, enableDouyin, enableSelfCrawler, enableTikhubFallback, bochaApiKey, youApiKey, tavilyApiKey, imageGenBaseUrl, imageGenApiKey, imageGenModel]);

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

       const handleSave = async () => {
              setIsSaving(true);
              updateSettings(localSettings);
              
              // Sync to cloud if user is logged in
              if (user) {
                     try {
                            await syncToCloud();
                            toast({
                                   title: "配置已保存到云端",
                                   description: "您的设置已加密保存，下次登录自动恢复。",
                                   className: "bg-green-50 border-green-200 text-green-800"
                            });
                     } catch (error) {
                            toast({
                                   title: "配置已保存到本地",
                                   description: "云端同步失败，配置仅保存在本地。",
                                   variant: "destructive"
                            });
                     }
              } else {
                     toast({
                            title: "配置已保存到本地",
                            description: "登录后可同步到云端，跨设备使用。",
                     });
              }
              
              setIsSaving(false);
              setOpen?.(false);
       };

       // Auto-save when dialog closes with unsaved changes
       const handleOpenChange = (newOpen: boolean) => {
              if (!newOpen && open) {
                     // Check if there are unsaved changes
                     const hasChanges =
                            localSettings.llmApiKey !== llmApiKey ||
                            localSettings.llmBaseUrl !== llmBaseUrl ||
                            localSettings.llmProvider !== llmProvider ||
                            localSettings.llmModel !== llmModel ||
                            localSettings.tikhubToken !== tikhubToken ||
                            localSettings.enableXiaohongshu !== enableXiaohongshu ||
                            localSettings.enableDouyin !== enableDouyin ||
                            localSettings.enableSelfCrawler !== enableSelfCrawler ||
                            localSettings.enableTikhubFallback !== enableTikhubFallback ||
                            localSettings.bochaApiKey !== bochaApiKey ||
                            localSettings.youApiKey !== youApiKey ||
                            localSettings.tavilyApiKey !== tavilyApiKey ||
                            localSettings.imageGenBaseUrl !== imageGenBaseUrl ||
                            localSettings.imageGenApiKey !== imageGenApiKey ||
                            localSettings.imageGenModel !== imageGenModel;

                     if (hasChanges) {
                            // Auto-save on close
                            updateSettings(localSettings);
                            
                            // Sync to cloud if user is logged in
                            if (user) {
                                   syncToCloud().then(() => {
                                          toast({
                                                 title: "配置已自动保存到云端",
                                                 description: "您的设置已加密保存。",
                                          });
                                   }).catch(() => {
                                          toast({
                                                 title: "配置已保存到本地",
                                                 description: "云端同步失败。",
                                          });
                                   });
                            } else {
                                   toast({
                                          title: "配置已自动保存",
                                          description: "登录后可同步到云端。",
                                   });
                            }
                     }
              }
              setOpen?.(newOpen);
       };

       const handleReset = () => {
              if (confirm("确定要恢复默认设置吗？")) {
                     resetSettings();
                     setLocalSettings({
                            llmProvider: 'openai',
                            llmBaseUrl: 'https://api.openai.com/v1',
                            llmApiKey: '',
                            llmModel: 'gpt-4o',
                            tikhubToken: '',
                            enableXiaohongshu: true,
                            enableDouyin: false,
                            enableSelfCrawler: true,
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
              const exportData = {
                     version: 1,
                     exportedAt: new Date().toISOString(),
                     settings: localSettings
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
                            
                            // Validate structure
                            if (!importData.settings || typeof importData.settings !== 'object') {
                                   throw new Error('Invalid config file format');
                            }
                            
                            const { settings } = importData;
                            
                            // Merge with current settings (only update fields that exist in imported data)
                            setLocalSettings(prev => ({
                                   ...prev,
                                   ...(settings.llmProvider && { llmProvider: settings.llmProvider }),
                                   ...(settings.llmBaseUrl && { llmBaseUrl: settings.llmBaseUrl }),
                                   ...(settings.llmApiKey && { llmApiKey: settings.llmApiKey }),
                                   ...(settings.llmModel && { llmModel: settings.llmModel }),
                                   ...(settings.tikhubToken && { tikhubToken: settings.tikhubToken }),
                                   ...(typeof settings.enableXiaohongshu === 'boolean' && { enableXiaohongshu: settings.enableXiaohongshu }),
                                   ...(typeof settings.enableDouyin === 'boolean' && { enableDouyin: settings.enableDouyin }),
                                   ...(typeof settings.enableSelfCrawler === 'boolean' && { enableSelfCrawler: settings.enableSelfCrawler }),
                                   ...(typeof settings.enableTikhubFallback === 'boolean' && { enableTikhubFallback: settings.enableTikhubFallback }),
                                   ...(settings.bochaApiKey && { bochaApiKey: settings.bochaApiKey }),
                                   ...(settings.youApiKey && { youApiKey: settings.youApiKey }),
                                   ...(settings.tavilyApiKey && { tavilyApiKey: settings.tavilyApiKey }),
                                   ...(settings.imageGenBaseUrl && { imageGenBaseUrl: settings.imageGenBaseUrl }),
                                   ...(settings.imageGenApiKey && { imageGenApiKey: settings.imageGenApiKey }),
                                   ...(settings.imageGenModel && { imageGenModel: settings.imageGenModel }),
                            }));
                            
                            toast({
                                   title: "导入成功",
                                   description: "配置已加载，请点击保存以应用更改",
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

       const handleVerifyLLM = async () => {
              if (!localSettings.llmApiKey) {
                     toast({ variant: "destructive", title: "请输入 API Key" });
                     return;
              }
              const { data, error } = await invokeFunction<{ valid: boolean; message?: string }>('verify-config', {
                     body: {
                            type: 'llm',
                            apiKey: localSettings.llmApiKey,
                            baseUrl: localSettings.llmBaseUrl,
                            model: localSettings.llmModel
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
                            llmApiKey: localSettings.llmApiKey,
                            llmBaseUrl: localSettings.llmBaseUrl,
                            llmProvider: localSettings.llmProvider,
                            llmModel: localSettings.llmModel
                     });
                     toast({
                            title: "验证成功",
                            description: "配置已自动保存",
                            className: "bg-green-50 border-green-200 text-green-800"
                     });
              }
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

  const handleStartCrawlerAuth = async (platform: 'xiaohongshu' | 'douyin') => {
       if (!user) {
              toast({ variant: "destructive", title: "请先登录后再扫码" });
              return;
       }
       setIsAuthLoading(true);
       try {
              const { data, error } = await invokeFunction<any>('crawler-auth-start', {
                     body: { platform }
              }, true);
              if (error || !data) {
                     throw new Error(error?.message || "启动扫码失败");
              }
              if (data.status !== 'pending' || !data.qr_image_base64) {
                     throw new Error(data.error || "未获取到二维码");
              }
              setAuthFlowId(data.flow_id || '');
              setAuthPlatform(platform);
              setAuthQrImage(data.qr_image_base64);
              setAuthStatus('pending');
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
       } finally {
              setIsAuthLoading(false);
       }
  };

  const handleCheckCrawlerAuthStatus = async (silent = false) => {
       if (!authFlowId) return;
       setIsAuthLoading(true);
       try {
              const { data, error } = await invokeFunction<any>('crawler-auth-status', {
                     body: { flow_id: authFlowId }
              }, true);
              if (error || !data) {
                     throw new Error(error?.message || "检查状态失败");
              }
              const status = data.status || 'pending';
              const prevStatus = authStatus;
              setAuthStatus(status);
              if (status === 'authorized') {
                     if (prevStatus !== 'authorized') {
                            toast({
                                   title: "登录成功",
                                   description: "用户会话已保存，后续自爬将优先使用该账号",
                                   className: "bg-green-50 border-green-200 text-green-800"
                            });
                     }
                     setAuthFlowId('');
                     setAuthQrImage('');
                     await fetchCrawlerSessions(true);
              } else if (status === 'expired' || status === 'failed') {
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
              setIsAuthLoading(false);
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

  useEffect(() => {
       if (!open) return;
       if (!user) {
              setCrawlerSessions([]);
              return;
       }
       void fetchCrawlerSessions(true);
  }, [open, user?.id]);

  useEffect(() => {
       if (!open || !authFlowId || authStatus !== 'pending') return;
       const timer = window.setTimeout(() => {
              void handleCheckCrawlerAuthStatus(true);
       }, 4000);
       return () => window.clearTimeout(timer);
  }, [open, authFlowId, authStatus]);

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

                            {/* LLM Settings */}
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
                            </div>

                            <hr className="border-gray-100" />

                            {/* Tikhub Settings */}
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
                                   </div>

                                   <div className="space-y-3 pt-2">
                                          <Label className="text-sm text-muted-foreground">账号扫码登录（自爬优先）</Label>
                                          <div className="flex gap-2">
                                                 <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => handleStartCrawlerAuth('xiaohongshu')}
                                                        disabled={isAuthLoading}
                                                 >
                                                        小红书扫码
                                                 </Button>
                                                 <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => handleStartCrawlerAuth('douyin')}
                                                        disabled={isAuthLoading}
                                                 >
                                                        抖音扫码
                                                 </Button>
                                          </div>
                                          {authQrImage && (
                                                 <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                                                        <p className="text-xs text-muted-foreground">
                                                               当前会话：{authPlatform === 'xiaohongshu' ? '小红书' : '抖音'} | 状态：{authStatus || 'pending'}
                                                        </p>
                                                        <img
                                                               src={`data:image/png;base64,${authQrImage}`}
                                                               alt="crawler login qr"
                                                               className="w-44 h-44 object-contain bg-white rounded border"
                                                        />
                                                        <div className="flex gap-2">
                                                               <Button variant="outline" size="sm" onClick={() => handleCheckCrawlerAuthStatus(false)} disabled={isAuthLoading}>
                                                                      检查登录状态
                                                               </Button>
                                                               <Button variant="ghost" size="sm" onClick={handleCancelCrawlerAuth} disabled={isAuthLoading}>
                                                                      取消会话
                                                               </Button>
                                                        </div>
                                                 </div>
                                          )}
                                          <div className="rounded-lg border bg-muted/10 p-3 space-y-2">
                                                 <div className="flex items-center justify-between">
                                                        <p className="text-xs text-muted-foreground">已授权会话</p>
                                                        <Button
                                                               variant="ghost"
                                                               size="sm"
                                                               onClick={() => fetchCrawlerSessions(false)}
                                                               disabled={isSessionsLoading}
                                                        >
                                                               刷新
                                                        </Button>
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
                                                                                           {' · '}
                                                                                           {session.status}
                                                                                    </p>
                                                                                    <p className="text-[11px] text-muted-foreground">
                                                                                           {session.updated_at ? new Date(session.updated_at).toLocaleString() : '未知时间'}
                                                                                    </p>
                                                                             </div>
                                                                             <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    onClick={() => handleRevokeCrawlerSession((session.platform === 'douyin' ? 'douyin' : 'xiaohongshu'))}
                                                                             >
                                                                                    吊销
                                                                             </Button>
                                                                      </div>
                                                               ))}
                                                        </div>
                                                 )}
                                          </div>
                                   </div>

                                   <div className="space-y-3 pt-2">
                                          <Label className="text-sm text-muted-foreground">采集执行策略</Label>

                                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                                                 <div>
                                                        <p className="font-medium text-sm">启用自爬服务 (Self Crawler)</p>
                                                        <p className="text-xs text-muted-foreground">优先走本地/独立爬虫，降低 TikHub 成本</p>
                                                 </div>
                                                 <Switch
                                                        checked={localSettings.enableSelfCrawler}
                                                        onCheckedChange={(checked) => setLocalSettings(s => ({ ...s, enableSelfCrawler: checked }))}
                                                 />
                                          </div>

                                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                                                 <div>
                                                        <p className="font-medium text-sm">启用 TikHub 兜底</p>
                                                        <p className="text-xs text-muted-foreground">自爬样本不足时，自动回退 TikHub</p>
                                                 </div>
                                                 <Switch
                                                        checked={localSettings.enableTikhubFallback}
                                                        onCheckedChange={(checked) => setLocalSettings(s => ({ ...s, enableTikhubFallback: checked }))}
                                                 />
                                          </div>

                                          {!localSettings.enableSelfCrawler && !localSettings.enableTikhubFallback && (
                                                 <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                                        ⚠️ 已关闭所有采集执行链路，仅能使用缓存数据
                                                 </p>
                                          )}
                                   </div>

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
                                                               <p className="text-xs text-muted-foreground">短视频、流量爆款、年轻用户</p>
                                                        </div>
                                                 </div>
                                                 <Switch
                                                        checked={localSettings.enableDouyin}
                                                        onCheckedChange={(checked) => setLocalSettings(s => ({ ...s, enableDouyin: checked }))}
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

                            {/* Search Settings Section */}
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

                            <hr className="border-gray-100" />

                            {/* Image Generation Settings */}
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
                     </div>

                     <div className="flex flex-col gap-3 mt-4">
                            {/* Import/Export buttons */}
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
                            
                            {/* Main action buttons */}
                            <div className="flex justify-between">
                                   <Button variant="outline" onClick={handleReset} className="text-muted-foreground">
                                          <RotateCcw className="w-4 h-4 mr-2" />
                                          重置默认
                                   </Button>
                                   <Button onClick={handleSave} disabled={isSaving || isLoading}>
                                          {isSaving ? (
                                                 <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          ) : (
                                                 <Save className="w-4 h-4 mr-2" />
                                          )}
                                          {user ? "保存到云端" : "保存配置"}
                                   </Button>
                            </div>
                     </div>
              </DialogContent>
       </Dialog>
);
};
