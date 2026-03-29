import { useTheme } from "@/hooks/useTheme";
import { Switch } from "@/components/ui/switch";
import { CottonSwitch } from "./CottonSwitch";
import { BambooSwitch } from "./BambooSwitch";
import { StreetSwitch } from "./StreetSwitch";
import { DriftSwitch } from "./DriftSwitch";

interface SkinSwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 皮肤感知开关 — 自动根据当前皮肤渲染不同造型
 */
export const SkinSwitch = ({ checked, onCheckedChange, disabled, className }: SkinSwitchProps) => {
  const { skin } = useTheme();

  if (skin === "cotton") return <CottonSwitch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={className} />;
  if (skin === "bamboo") return <BambooSwitch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={className} />;
  if (skin === "street") return <StreetSwitch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={className} />;
  if (skin === "drift") return <DriftSwitch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={className} />;

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
