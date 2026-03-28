import { type LucideIcon } from "lucide-react";

interface SectionHeadingProps {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  subtitle?: string;
  className?: string;
}

export const SectionHeading = ({ icon: Icon, emoji, title, subtitle, className = "" }: SectionHeadingProps) => (
  <div className={`flex items-center gap-3 mb-5 ${className}`}>
    {Icon ? (
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px] text-primary" />
      </div>
    ) : emoji ? (
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-base">{emoji}</span>
      </div>
    ) : null}
    <div className="border-l-[3px] border-l-primary/60 pl-3">
      <h3 className="font-bold text-lg leading-tight tracking-tight">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

export default SectionHeading;
