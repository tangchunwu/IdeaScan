interface SectionHeadingProps {
  emoji: string;
  title: string;
  subtitle?: string;
  className?: string;
}

export const SectionHeading = ({ emoji, title, subtitle, className = "" }: SectionHeadingProps) => (
  <div className={`flex items-center gap-2.5 border-l-[3px] border-primary pl-3 py-1 mb-4 ${className}`}>
    <span className="text-lg">{emoji}</span>
    <div>
      <h3 className="font-bold text-base">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  </div>
);

export default SectionHeading;
