import { useTheme } from "@/hooks/useTheme";
import { Switch } from "@/components/ui/switch";
import { CottonSwitch } from "./CottonSwitch";
import { BambooSwitch } from "./BambooSwitch";
import { ComponentPropsWithoutRef } from "react";

interface SkinSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 皮肤感知开关 — 自动根据当前皮肤渲染不同造型
 * cotton → 兔耳开关
 * bamboo → 竹扣开关
 * 其他 → 默认 Switch
 */
export const SkinSwitch = ({ checked, onCheckedChange, disabled, className }: SkinSwitchProps) => {
  const { skin } = useTheme();

  if (skin === "cotton") {
    return <CottonSwitch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={className} />;
  }

  if (skin === "bamboo") {
    return <BambooSwitch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={className} />;
  }

  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={className}
    />
  );
};

export default SkinSwitch;
