import { useTheme } from "@/hooks/useTheme";
import { getSkinCopy } from "@/lib/skinMessages";
import { toast } from "sonner";

/**
 * 皮肤感知 Toast — 自动使用当前皮肤的文案风格
 */
export const useSkinToast = () => {
  const { skin } = useTheme();
  const copy = getSkinCopy(skin);

  return {
    success: (detail?: string) => toast.success(copy.toastSuccess(detail)),
    error: (detail?: string) => toast.error(copy.toastError(detail)),
    info: (detail?: string) => toast(copy.toastInfo(detail)),
  };
};
