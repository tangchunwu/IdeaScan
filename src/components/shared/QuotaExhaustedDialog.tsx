import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Settings, ExternalLink } from "lucide-react";

interface QuotaExhaustedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
}

export function QuotaExhaustedDialog({
  open,
  onOpenChange,
  onOpenSettings,
}: QuotaExhaustedDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-warning/10 text-warning">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-xl">免费次数已用完</DialogTitle>
          </div>
          <DialogDescription className="text-base leading-relaxed">
            您的 1 次免费验证已使用完毕。要继续使用验证功能，请在设置中配置您自己的 TikHub API Token。
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-xl p-4 my-4">
          <h4 className="font-medium mb-2 text-sm">什么是 TikHub？</h4>
          <p className="text-sm text-muted-foreground">
            TikHub 是用于抓取小红书、抖音等社交媒体数据的 API 服务。配置您自己的 Token 后，可以无限次使用验证功能。
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={onOpenSettings} className="w-full rounded-xl">
            <Settings className="w-4 h-4 mr-2" />
            去配置 TikHub Token
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl"
            asChild
          >
            <a
              href="https://tikhub.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              获取 TikHub Token
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
