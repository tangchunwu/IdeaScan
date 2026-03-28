import { useMemo } from "react";
import { CheckCircle2, Loader2, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SkillStep } from "@/lib/openclawSkills";

interface SkillProgressPanelProps {
  skillName: string;
  steps: SkillStep[];
  streamingContent: string;
  onStop: () => void;
}

export function SkillProgressPanel({ skillName, steps, streamingContent, onStop }: SkillProgressPanelProps) {
  const currentStepIdx = useMemo(() => {
    if (!streamingContent) return 0;
    const lower = streamingContent.toLowerCase();
    let lastMatched = 0;
    for (let i = 0; i < steps.length; i++) {
      const hasMatch = steps[i].keywords.some(kw => lower.includes(kw.toLowerCase()));
      if (hasMatch) lastMatched = i;
    }
    return lastMatched;
  }, [streamingContent, steps]);

  const progress = steps.length > 0
    ? Math.min(((currentStepIdx + 1) / steps.length) * 100, 100)
    : 0;

  return (
    <div className="mx-2 mb-3 rounded-xl border border-border/40 bg-muted/20 backdrop-blur-sm p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">{skillName} 进行中</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onStop}
          className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1"
        >
          <X className="w-3.5 h-3.5" />
          停止并保留
        </Button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="relative h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((step, i) => {
          const isCompleted = i < currentStepIdx;
          const isActive = i === currentStepIdx;
          const isPending = i > currentStepIdx;

          return (
            <div key={step.label} className="flex items-center gap-1">
              {i > 0 && (
                <div className={`w-4 h-px ${isCompleted || isActive ? 'bg-primary/40' : 'bg-border/40'}`} />
              )}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : isCompleted
                    ? 'text-primary/70'
                    : 'text-muted-foreground/50'
              }`}>
                {isCompleted ? (
                  <CheckCircle2 className="w-3 h-3 text-primary" />
                ) : isActive ? (
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
                <span>{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
