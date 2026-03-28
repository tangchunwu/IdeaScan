import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Check, Copy, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PairingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaired: () => void;
}

const BRIDGE_RAW_URL = "https://raw.githubusercontent.com/tangchunwu/IdeaScan/main/scripts/agent-bridge/bridge.py";

export function PairingDialog({ open, onOpenChange, onPaired }: PairingDialogProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;
  const pairCommand = `curl -fsSL ${BRIDGE_RAW_URL} -o bridge.py && pip install requests && python bridge.py pair --supabase-url ${supabaseUrl} --backend claude --work-dir .`;

  const copyCommand = async () => {
    await navigator.clipboard.writeText(pairCommand);
    setCopied(true);
    toast.success("命令已复制");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("openclaw-pair", {
        body: { action: "confirm_pair", code: code.toUpperCase() },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.message || "配对码无效或已过期");
        return;
      }
      setSuccess(true);
      toast.success("🎉 配对成功！设备已连接");
      setTimeout(() => {
        onPaired();
        onOpenChange(false);
        setCode("");
        setSuccess(false);
      }, 1500);
    } catch (e: any) {
      toast.error(`配对失败: ${e.message || "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setCode("");
      setSuccess(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            设备配对
          </DialogTitle>
          <DialogDescription>
            两步完成：先在终端运行命令，再输入配对码
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">🎉 配对成功！</p>
              <p className="text-xs text-muted-foreground">连接已建立，你的 Agent 已就绪</p>
            </div>
          ) : (
            <>
              {/* Step A: Run command */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-full">第 1 步</Badge>
                  <span className="text-sm font-medium text-foreground">在电脑终端运行命令</span>
                </div>
                <div className="relative">
                  <pre className="text-[10px] bg-muted/40 border border-border/30 p-3 pr-10 rounded-xl font-mono whitespace-pre-wrap break-all text-muted-foreground leading-relaxed">
                    {pairCommand}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1.5 right-1.5 h-7 w-7 p-0"
                    onClick={copyCommand}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <HelpCircle className="w-3 h-3 shrink-0" />
                  Mac 打开「终端」，Windows 打开 PowerShell，粘贴命令按回车
                </p>
              </div>

              {/* Step B: Enter code */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-full">第 2 步</Badge>
                  <span className="text-sm font-medium text-foreground">输入终端显示的 6 位码</span>
                </div>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={setCode}
                    disabled={loading}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  终端会显示类似 <code className="bg-muted/40 px-1 py-0.5 rounded font-mono font-bold text-primary">A3F7K2</code> 的配对码，5 分钟内有效
                </p>
              </div>

              <Button
                onClick={handleConfirm}
                disabled={code.length !== 6 || loading}
                className="w-full rounded-xl"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                确认配对
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
