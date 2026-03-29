import { useTheme } from "@/hooks/useTheme";
import { Progress } from "@/components/ui/progress";
import { CottonProgress } from "./CottonProgress";
import { BambooProgress } from "./BambooProgress";
import { StreetProgress } from "./StreetProgress";
import { DriftProgress } from "./DriftProgress";

interface SkinProgressProps {
  value: number;
  className?: string;
  indicatorClassName?: string;
}

/**
 * 皮肤感知进度条 — 自动根据当前皮肤渲染不同造型
 */
export const SkinProgress = ({ value, className, indicatorClassName }: SkinProgressProps) => {
  const { skin } = useTheme();

  if (skin === "cotton") return <CottonProgress value={value} className={className} />;
  if (skin === "bamboo") return <BambooProgress value={value} className={className} />;
  if (skin === "street") return <StreetProgress value={value} className={className} />;
  if (skin === "drift") return <DriftProgress value={value} className={className} />;

  return <Progress value={value} className={className} indicatorClassName={indicatorClassName} />;
};

export default SkinProgress;
