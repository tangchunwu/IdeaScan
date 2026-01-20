import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/useSettings";
import { Settings, Eye, Save, RotateCcw, ExternalLink, Cloud, CloudOff, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

export const SettingsDialog = ({ open: controlledOpen, onOpenChange: controlledOnOpenChange, trigger }: SettingsDialogProps) => {
       const {
              llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
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
       const { toast } = useToast();

       // Local state for form to avoid rapid updates/re-renders on global store
       const [localSettings, setLocalSettings] = useState({
              llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
              bochaApiKey, youApiKey, tavilyApiKey,
              imageGenBaseUrl, imageGenApiKey, imageGenModel
       });

       // Sync local state when dialog opens or store changes
       useEffect(() => {
              if (open) {
                     setLocalSettings({
                            llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
                            bochaApiKey, youApiKey, tavilyApiKey,
                            imageGenBaseUrl, imageGenApiKey, imageGenModel
                     });
              }
       }, [open, llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken, bochaApiKey, youApiKey, tavilyApiKey, imageGenBaseUrl, imageGenApiKey, imageGenModel]);

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

       const handleVerifyLLM = async () => {
              if (!localSettings.llmApiKey) {
                     toast({ variant: "destructive", title: "请输入 API Key" });
                     return;
              }
              const { data, error } = await supabase.functions.invoke('verify-config', {
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
       const { data, error } = await supabase.functions.invoke('verify-config', {
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
       const { data, error } = await supabase.functions.invoke('verify-config', {
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

                     <div className="flex justify-between mt-4">
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
              </DialogContent>
       </Dialog>
);
};
