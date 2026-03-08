import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useUserQuota } from "@/hooks/useUserQuota";
import { validationKeys } from "@/hooks/useValidation";
import { createValidationStream, getValidation } from "@/services/validationService";
import { invokeFunction } from "@/lib/invokeFunction";
import { captureEvent } from "@/lib/posthog";

export interface ValidationStep {
  id: number;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  targetProgress: number;
}

export function useValidationStream(validationSteps: ValidationStep[]) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const settings = useSettings();
  const hasOwnTikhub = !!settings.tikhubToken;

  const [isValidating, setIsValidating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentValidationId, setCurrentValidationId] = useState<string | null>(null);
  const sseControllerRef = useRef<{ abort: () => void } | null>(null);

  // Cleanup SSE
  const cleanup = () => {
    sseControllerRef.current?.abort();
    sseControllerRef.current = null;
  };

  const handleCancelAndKeep = async () => {
    if (!currentValidationId || isCancelling) return;
    setIsCancelling(true);
    cleanup();

    try {
      const { data, error } = await invokeFunction<{ success: boolean; validationId: string; overallScore: number }>(
        "cancel-validation",
        { body: { validationId: currentValidationId } },
        true,
      );

      if (error) throw new Error(error.message || "取消失败");

      toast({
        title: "已保留部分结果",
        description: `基于已采集数据生成了降级报告（评分：${data.overallScore}分）`,
      });

      await queryClient.prefetchQuery({
        queryKey: validationKeys.detail(currentValidationId),
        queryFn: () => getValidation(currentValidationId!),
        staleTime: 1000 * 60 * 5,
      });

      captureEvent('validation_cancelled_with_partial', {
        validation_id: currentValidationId,
        score: data.overallScore,
        progress_at_cancel: progress,
      });

      navigate(`/report/${currentValidationId}`);
    } catch (e) {
      toast({
        title: "取消失败",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
      setIsValidating(false);
      setProgress(0);
      setCurrentStep(0);
      setCurrentValidationId(null);
    }
  };

  const startValidation = (params: {
    idea: string;
    selectedTags: string[];
    validationMode: 'quick' | 'deep';
    resumeValidationId?: string;
  }) => {
    const { idea, selectedTags, validationMode, resumeValidationId } = params;

    captureEvent('validation_started', {
      idea_length: idea.length,
      tags_count: selectedTags.length,
      mode: validationMode,
      has_own_tikhub: hasOwnTikhub,
    });

    setIsValidating(true);
    setProgress(0);
    setCurrentStep(0);
    setProgressMessage("");

    sseControllerRef.current = createValidationStream(
      {
        idea,
        tags: selectedTags,
        mode: validationMode,
        resumeValidationId,
        config: {
          mode: validationMode,
          llmProvider: settings.llmProvider,
          llmBaseUrl: settings.llmBaseUrl,
          llmApiKey: settings.llmApiKey,
          llmModel: settings.llmModel,
          llmFallbacks: settings.llmFallbacks,
          tikhubToken: hasOwnTikhub ? settings.tikhubToken : undefined,
          enableXiaohongshu: settings.enableXiaohongshu,
          enableDouyin: false,
          enableSelfCrawler: false,
          enableTikhubFallback: true,
          searchKeys: {
            bocha: settings.bochaApiKey,
            you: settings.youApiKey,
            tavily: settings.tavilyApiKey,
          },
        },
      },
      (event) => {
        if (event.progress !== undefined) setProgress(event.progress);
        if (event.message) setProgressMessage(event.message);

        if (event.meta?.validationId && typeof event.meta.validationId === 'string') {
          setCurrentValidationId(event.meta.validationId);
        }

        const stageMap: Record<string, number> = {
          init: 0, keywords: 1, cache_check: 1,
          crawl_start: 2, crawl_xhs: 2, crawl_dy: 2, crawl_done: 2, search: 2,
          jina_clean: 3, extract_competitors: 3, deep_search: 3,
          summarize_l1: 4, summarize_l2: 4,
          analyze: 5, save: 6, complete: 7,
        };
        if (event.stage && stageMap[event.stage] !== undefined) {
          setCurrentStep(stageMap[event.stage]);
        }
      },
      async (result) => {
        setProgress(100);
        setCurrentStep(validationSteps.length);

        captureEvent('validation_completed', {
          validation_id: result.validationId,
          score: result.overallScore,
          mode: validationMode,
        });

        toast({ title: "验证完成！", description: `评分：${result.overallScore}分` });

        await queryClient.prefetchQuery({
          queryKey: validationKeys.detail(result.validationId),
          queryFn: () => getValidation(result.validationId),
          staleTime: 1000 * 60 * 5,
        });

        setTimeout(() => navigate(`/report/${result.validationId}`), 500);
      },
      (error) => {
        captureEvent('validation_failed', {
          error: error.substring(0, 100),
          mode: validationMode,
        });

        toast({ title: "验证失败", description: error, variant: "destructive" });
        setIsValidating(false);
        setProgress(0);
        setCurrentStep(0);
        setCurrentValidationId(null);
      }
    );
  };

  return {
    isValidating,
    progress,
    currentStep,
    progressMessage,
    isCancelling,
    currentValidationId,
    hasOwnTikhub,
    startValidation,
    handleCancelAndKeep,
    cleanup,
  };
}
