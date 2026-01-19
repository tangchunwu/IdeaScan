import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/useSettings";
import { Settings, Eye, EyeOff, Save, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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

export const SettingsDialog = () => {
       const {
              llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
              searchProvider, searchApiKey,
              updateSettings, resetSettings
       } = useSettings();

       const [open, setOpen] = useState(false);
       const [showKey, setShowKey] = useState(false);
       const [showTikhubToken, setShowTikhubToken] = useState(false);
       const [showSearchKey, setShowSearchKey] = useState(false);
       const { toast } = useToast();

       // Local state for form to avoid rapid updates/re-renders on global store
       const [localSettings, setLocalSettings] = useState({
              llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
              searchProvider, searchApiKey
       });

       // Sync local state when dialog opens or store changes
       useEffect(() => {
              if (open) {
                     setLocalSettings({
                            llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken,
                            searchProvider, searchApiKey
                     });
              }
       }, [open, llmProvider, llmBaseUrl, llmApiKey, llmModel, tikhubToken, searchProvider, searchApiKey]);

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

       const handleSave = () => {
              updateSettings(localSettings);
              toast({
                     title: "配置已保存",
                     description: "您的设置已更新并保存到本地。",
              });
              setOpen(false);
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
                            searchProvider: 'none',
                            searchApiKey: '',
                     });
                     toast({
                            title: "已重置",
                            description: "配置已恢复默认值。",
                     });
              }
       };

       return (
              <Dialog open={open} onOpenChange={setOpen}>
                     <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-full">
                                   <Settings className="w-5 h-5" />
                            </Button>
                     </DialogTrigger>
                     <DialogContent className="sm:max-w-[425px] overflow-y-auto max-h-[90vh]">
                            <DialogHeader>
                                   <DialogTitle>系统配置</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-6 py-4">

                                   {/* LLM Settings Section */}
                                   <div className="space-y-4">
                                          <h4 className="font-medium flex items-center gap-2">
                                                 🤖 大模型配置 (LLM)
                                          </h4>

                                          <div className="grid gap-2">
                                                 <Label>提供商 Provider</Label>
                                                 <Select
                                                        value={localSettings.llmProvider}
                                                        onValueChange={(val: any) => handleProviderChange(val)}
                                                 >
                                                        <SelectTrigger>
                                                               <SelectValue placeholder="Select provider" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                               {Object.entries(PROVIDERS).map(([key, config]) => (
                                                                      <SelectItem key={key} value={key}>
                                                                             {config.name}
                                                                      </SelectItem>
                                                               ))}
                                                        </SelectContent>
                                                 </Select>
                                          </div>

                                          <div className="grid gap-2">
                                                 <Label>API Base URL</Label>
                                                 <Input
                                                        value={localSettings.llmBaseUrl}
                                                        onChange={(e) => setLocalSettings(s => ({ ...s, llmBaseUrl: e.target.value }))}
                                                        placeholder="https://api.openai.com/v1"
                                                 />
                                          </div>

                                          <div className="grid gap-2">
                                                 <Label>API Key</Label>
                                                 <div className="relative">
                                                        <Input
                                                               type={showKey ? "text" : "password"}
                                                               value={localSettings.llmApiKey}
                                                               onChange={(e) => setLocalSettings(s => ({ ...s, llmApiKey: e.target.value }))}
                                                               placeholder="sk-..."
                                                               className="pr-10"
                                                        />
                                                        <button
                                                               type="button"
                                                               onClick={() => setShowKey(!showKey)}
                                                               className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                                        >
                                                               {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                        </button>
                                                 </div>
                                          </div>

                                          <div className="grid gap-2">
                                                 <Label>模型名称 Model Name</Label>
                                                 <Input
                                                        value={localSettings.llmModel}
                                                        onChange={(e) => setLocalSettings(s => ({ ...s, llmModel: e.target.value }))}
                                                        placeholder="gpt-4o"
                                                        list="model-suggestions"
                                                 />
                                                 <datalist id="model-suggestions">
                                                        {localSettings.llmProvider !== 'custom' &&
                                                               PROVIDERS[localSettings.llmProvider]?.models.map(m => (
                                                                      <option key={m} value={m} />
                                                               ))
                                                        }
                                                 </datalist>
                                          </div>
                                   </div>

                                   <hr className="border-gray-100" />

                                   {/* Tikhub Settings Section */}
                                   <div className="space-y-4">
                                          <h4 className="font-medium flex items-center gap-2">
                                                 📊 数据源配置 (Tikhub)
                                          </h4>

                                          <div className="grid gap-2">
                                                 <Label>Tikhub API Token</Label>
                                                 <div className="relative">
                                                        <Input
                                                               type={showTikhubToken ? "text" : "password"}
                                                               value={localSettings.tikhubToken}
                                                               onChange={(e) => setLocalSettings(s => ({ ...s, tikhubToken: e.target.value }))}
                                                               placeholder="Bearer ..."
                                                               className="pr-10"
                                                        />
                                                        <button
                                                               type="button"
                                                               onClick={() => setShowTikhubToken(!showTikhubToken)}
                                                               className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                                        >
                                                               {showTikhubToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                        </button>
                                                 </div>
                                                 <p className="text-xs text-muted-foreground">
                                                        用于获取真实小红书数据 (可选，未配置将使用模拟数据)
                                                 </p>
                                          </div>
                                   </div>

                                   <hr className="border-gray-100" />

                                   {/* Search Settings Section */}
                                   <div className="space-y-4">
                                          <h4 className="font-medium flex items-center gap-2">
                                                 🔍 竞品搜索配置
                                          </h4>

                                          <div className="grid gap-2">
                                                 <Label>搜索服务商 Provider</Label>
                                                 <Select
                                                        value={localSettings.searchProvider}
                                                        onValueChange={(val: any) => setLocalSettings(s => ({ ...s, searchProvider: val }))}
                                                 >
                                                        <SelectTrigger>
                                                               <SelectValue placeholder="选择搜索服务商" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                               <SelectItem value="none">不启用</SelectItem>
                                                               <SelectItem value="bocha">博查 (Bocha)</SelectItem>
                                                               <SelectItem value="you">You.com</SelectItem>
                                                        </SelectContent>
                                                 </Select>
                                          </div>

                                          {localSettings.searchProvider !== 'none' && (
                                                 <div className="grid gap-2">
                                                        <Label>Search API Key</Label>
                                                        <div className="relative">
                                                               <Input
                                                                      type={showSearchKey ? "text" : "password"}
                                                                      value={localSettings.searchApiKey}
                                                                      onChange={(e) => setLocalSettings(s => ({ ...s, searchApiKey: e.target.value }))}
                                                                      placeholder={localSettings.searchProvider === 'bocha' ? "sk-..." : "API Key..."}
                                                                      className="pr-10"
                                                               />
                                                               <button
                                                                      type="button"
                                                                      onClick={() => setShowSearchKey(!showSearchKey)}
                                                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                                               >
                                                                      {showSearchKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                               </button>
                                                        </div>
                                                 </div>
                                          )}
                                   </div>
                            </div>

                            <div className="flex justify-between mt-4">
                                   <Button variant="outline" onClick={handleReset} className="text-muted-foreground">
                                          <RotateCcw className="w-4 h-4 mr-2" />
                                          重置默认
                                   </Button>
                                   <Button onClick={handleSave}>
                                          <Save className="w-4 h-4 mr-2" />
                                          保存配置
                                   </Button>
                            </div>
                     </DialogContent>
              </Dialog>
       );
};
