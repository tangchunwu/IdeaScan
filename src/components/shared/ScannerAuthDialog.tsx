import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode, Shield, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invokeFunction } from "@/lib/invokeFunction";

interface ScannerAuthDialogProps {
       open: boolean;
       onOpenChange: (open: boolean) => void;
       onSuccess: (sessionId: string) => void;
       userId: string;
}

export function ScannerAuthDialog({ open, onOpenChange, onSuccess, userId }: ScannerAuthDialogProps) {
       const { toast } = useToast();
       const [loadingQr, setLoadingQr] = useState(false);
       const [qrBase64, setQrBase64] = useState<string>("");
       const [flowId, setFlowId] = useState<string>("");
       const [authMessage, setAuthMessage] = useState<string>("等待拉取二维码...");
       const [isAuthorized, setIsAuthorized] = useState(false);

       // 挂载时立即请求二维码
       useEffect(() => {
              if (open && !flowId && !loadingQr) {
                     startAuthFlow();
              }

              if (!open) {
                     setQrBase64("");
                     setFlowId("");
                     setIsAuthorized(false);
              }
       }, [open]);

       const startAuthFlow = async () => {
              setLoadingQr(true);
              try {
              const result = await invokeFunction("crawler-auth-start", {
                     body: { platform: "xiaohongshu", user_id: userId },
              });
              if (result.error) {
                     toast({ title: "爬虫流启失败", description: result.error.message, variant: "destructive" });
                     onOpenChange(false);
                     return;
              }
              const data = result.data as any;
              if (data.status === "pending" || data.flow_id) {
                     setFlowId(data.flow_id);
                     setQrBase64(data.qr_image_base64);
                     setAuthMessage(data.message || "请打开小红书 APP 扫码");
              } else {
                     toast({ title: "爬虫流启失败", description: data.error, variant: "destructive" });
                     onOpenChange(false);
              }
              } catch (e) {
                     toast({ title: "爬虫服务未连接", description: "认证服务暂不可用，请稍后重试", variant: "destructive" });
                     onOpenChange(false);
              } finally {
                     setLoadingQr(false);
              }
       };

       // 轮询认证状态
       useEffect(() => {
              if (!flowId || isAuthorized || !open) return;

              const interval = setInterval(async () => {
                     try {
                            const result = await invokeFunction("crawler-auth-status", {
                                   body: { flow_id: flowId },
                            });
                            if (result.error) return;
                            const data = result.data as any;

                            if (data.status === "authorized" || data.session_saved) {
                                   setIsAuthorized(true);
                                   setAuthMessage("✅ 登录鉴权及 Cookie 持久化成功！");
                                   clearInterval(interval);
                                   setTimeout(() => {
                                          onSuccess(data.user_id || userId);
                                          onOpenChange(false);
                                   }, 1500);
                            } else if (data.status === "failed" || data.status === "expired") {
                                   toast({ title: "二维码已过期或失效", description: "请重新获取", variant: "destructive" });
                                   clearInterval(interval);
                                   setFlowId("");
                            } else {
                                   if (data.message) {
                                          setAuthMessage(data.message);
                                   }
                            }
                     } catch (e) {
                            console.error("查状态报错", e);
                     }
              }, 3000);

              return () => clearInterval(interval);
       }, [flowId, isAuthorized, open, onSuccess, onOpenChange, userId, toast]);

       return (
              <Dialog open={open} onOpenChange={onOpenChange}>
                     <DialogContent className="sm:max-w-[425px] glass-panel border-white/20">
                            <DialogHeader>
                                   <div className="mx-auto bg-primary/10 p-3 rounded-full mb-2">
                                          <Shield className="w-6 h-6 text-primary" />
                                   </div>
                                   <DialogTitle className="text-center text-xl">节点直连认证</DialogTitle>
                                   <DialogDescription className="text-center">
                                          为了确保您的账号安全与绝密数据的完整性，我们需要借用您本机的登录态进行慢速私密抓取。
                                   </DialogDescription>
                            </DialogHeader>

                            <div className="flex flex-col items-center justify-center p-6 space-y-6">
                                   <div className="relative w-48 h-48 bg-white/50 rounded-2xl border-2 border-dashed border-primary/30 flex items-center justify-center overflow-hidden shadow-inner">
                                          {isAuthorized ? (
                                                 <div className="flex flex-col items-center text-primary animate-scale-in">
                                                        <CheckCircle2 className="w-16 h-16 mb-2" />
                                                        <span className="font-semibold">鉴权通过</span>
                                                 </div>
                                          ) : loadingQr ? (
                                                 <div className="flex flex-col items-center text-muted-foreground animate-pulse">
                                                        <Loader2 className="w-8 h-8 animate-spin mb-2 text-primary" />
                                                        <span className="text-sm">正在建立安全信道...</span>
                                                 </div>
                                          ) : qrBase64 ? (
                                                 <div className="relative w-full h-full p-2 bg-white">
                                                        <img src={`data:image/png;base64,${qrBase64}`} alt="XHS Login QR" className="w-full h-full object-contain" />
                                                 </div>
                                          ) : (
                                                 <Button variant="ghost" className="flex flex-col items-center h-full w-full" onClick={startAuthFlow}>
                                                        <QrCode className="w-8 h-8 mb-2 opacity-50" />
                                                        <span>点击重试加载</span>
                                                 </Button>
                                          )}
                                   </div>

                                   <div className="text-center space-y-2 w-full">
                                          <p className={`font-medium ${isAuthorized ? 'text-primary' : 'text-foreground'}`}>
                                                 {authMessage}
                                          </p>
                                          {!isAuthorized && qrBase64 && (
                                                 <p className="text-xs text-muted-foreground bg-secondary/10 p-2 rounded-lg">
                                                        <span className="font-semibold">提示：</span>扫码后请在手机端点击【确认登录】。本次建立的安全连接仅供本次需求验证使用，阅后即焚不再复用。
                                                 </p>
                                          )}
                                   </div>
                            </div>
                     </DialogContent>
              </Dialog>
       );
}
