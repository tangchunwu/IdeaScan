export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card p-3 border border-border/50 shadow-xl backdrop-blur-md bg-card/80">
        {label && <p className="font-medium text-sm mb-2 text-foreground">{label}</p>}
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs mb-1 last:mb-0">
            <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: entry.color || entry.payload.fill }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">{entry.value}</span>
            {entry.unit && <span className="text-muted-foreground text-[10px]">{entry.unit}</span>}
          </div>
        ))}
      </div>
    );
  }
  return null;
};
