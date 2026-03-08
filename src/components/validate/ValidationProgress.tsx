import { Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/shared";
import type { ValidationStep } from "@/hooks/useValidationStream";

interface ValidationProgressProps {
  progress: number;
  currentStep: number;
  progressMessage: string;
  validationSteps: ValidationStep[];
  currentValidationId: string | null;
  isCancelling: boolean;
  onCancelAndKeep: () => void;
}

export const ValidationProgress = ({
  progress,
  currentStep,
  progressMessage,
  validationSteps,
  currentValidationId,
  isCancelling,
  onCancelAndKeep,
}: ValidationProgressProps) => {
  return (
    <GlassCard className="space-y-6 animate-scale-in">
      {/* Main Progress Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">正在验证你的想法...</h3>
          <p className="text-sm text-muted-foreground mt-1">请稍候，这可能需要 15-30 秒</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">处理进度</span>
          <span className="font-mono text-primary font-medium">{Math.round(progress)}%</span>
        </div>
        <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary to-secondary rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
          </div>
        </div>
      </div>

      {/* Steps Timeline */}
      <div className="relative">
        <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-border" />
        <div className="space-y-4">
          {validationSteps.map((step, i) => {
            const Icon = step.icon;
            const isCompleted = currentStep > i;
            const isActive = currentStep === i;
            const isPending = currentStep < i;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-4 transition-all duration-500 ${isPending ? "opacity-40" : "opacity-100"}`}
              >
                <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-500 ${
                  isCompleted
                    ? "bg-primary border-primary text-primary-foreground scale-100"
                    : isActive
                      ? "bg-primary/10 border-primary text-primary scale-110 shadow-lg shadow-primary/20"
                      : "bg-background border-border text-muted-foreground"
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`font-medium transition-colors ${
                    isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {step.label}
                  </p>
                  {isActive && (
                    <p className="text-xs text-muted-foreground mt-0.5 animate-fade-in">
                      {progressMessage || step.description}
                    </p>
                  )}
                </div>
                {isCompleted && (
                  <span className="text-xs text-primary font-medium">完成</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cancel and keep partial results button */}
      {currentValidationId && (
        <div className="pt-4 border-t border-border/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelAndKeep}
            disabled={isCancelling}
            className="w-full text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl"
          >
            {isCancelling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                正在保存已采集数据...
              </>
            ) : (
              <>
                <X className="w-4 h-4 mr-2" />
                取消验证并保留部分结果
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground/60 text-center mt-1.5">
            将基于已采集到的数据生成降级报告
          </p>
        </div>
      )}
    </GlassCard>
  );
};
