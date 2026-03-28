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
import { Loader2, Link2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PairingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaired: () => void;
}

export function PairingDialog({ open, onOpenChange, onPaired }: PairingDialogProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
            在你的电脑终端运行 bridge 脚本后，输入显示的 6 位配对码
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {success ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">配对成功，连接已建立！</p>
            </div>
          ) : (
            <>
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

              <div className="text-xs text-muted-foreground text-center space-y-1">
                <p>在终端执行以下命令获取配对码：</p>
                <code className="block bg-muted/30 px-3 py-1.5 rounded-lg text-[10px] font-mono">
                  python bridge.py pair --supabase-url ...
                </code>
              </div>

              <Button
                onClick={handleConfirm}
                disabled={code.length !== 6 || loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                确认配对
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
