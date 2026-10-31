import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSkinToast } from "@/hooks/useSkinToast";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { useUserQuota } from "@/hooks/useUserQuota";
import { useBrowserNotification } from "@/hooks/useBrowserNotification";
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

export interface CompletionPreview {
  score: number;
  validationId: string;
}

export function useValidationStream(validationSteps: ValidationStep[]) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const skinToast = useSkinToast();
  const { user } = useAuth();
  const settings = useSettings();
  const { hasOwnTikhub, refetch: refetchQuota } = useUserQuota();
  const { notify } = useBrowserNotification();

  const [isValidating, setIsValidating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentValidationId, setCurrentValidationId] = useState<string | null>(null);
  const [stepTimestamps, setStepTimestamps] = useState<number[]>([]);
  const [completionPreview, setCompletionPreview] = useState<CompletionPreview | null>(null);
  const sseControllerRef = useRef<{ abort: () => void } | null>(null);
  const lastStepRef = useRef(-1);
  const generationRef = useRef(0);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    generationRef.current += 1;
    if (completionTimerRef.current !== null) clearTimeout(completionTimerRef.current);
    completionTimerRef.current = null;
    sseControllerRef.current?.abort();
    sseControllerRef.current = null;
  }, []);

  useEffect(() => {
    setIsValidating(false);
    setIsCancelling(false);
    setCompletionPreview(null);
    setCurrentValidationId(null);
    return cleanup;
  }, [user?.id, cleanup]);

  const dismissPreview = () => setCompletionPreview(null);

  const navigateToReport = (validationId: string) => {
    cleanup();
    setIsValidating(false);
    setCompletionPreview(null);
    navigate(`/report/${validationId}`);
  };

  const handleCancelAndKeep = async () => {
    if (!currentValidationId || isCancelling) return;
    setIsCancelling(true);
    cleanup();
    const cancelGeneration = generationRef.current;
    const isCurrentCancel = () => generationRef.current === cancelGeneration && userIdRef.current === user?.id;

    try {
      const { data, error } = await invokeFunction<{ success: boolean; validationId: string; overallScore: number }>(
        "cancel-validation",
        { body: { validationId: currentValidationId } },
        true,
      );

      if (!isCurrentCancel()) return;

      if (error) throw new Error(error.message || "取消失败");

      skinToast.success(`已保留部分结果: 基于已采集数据生成了降级报告（评分：${data.overallScore}分）`);

      void queryClient.prefetchQuery({
        queryKey: validationKeys.detail(currentValidationId, user?.id),
        queryFn: () => getValidation(currentValidationId!),
        staleTime: 1000 * 60 * 5,
      }).catch(() => undefined);
      if (!isCurrentCancel()) return;

      captureEvent('validation_cancelled_with_partial', {
        validation_id: currentValidationId,
        score: data.overallScore,
        progress_at_cancel: progress,
      });

      navigate(`/report/${currentValidationId}`);
    } catch (e) {
      if (isCurrentCancel()) skinToast.error(`取消失败: ${(e as Error).message}`);
    } finally {
      if (isCurrentCancel()) {
        setIsCancelling(false);
        setIsValidating(false);
        setProgress(0);
        setCurrentStep(0);
        setCurrentValidationId(null);
        setStepTimestamps([]);
      }
    }
  };

  const startValidation = (params: {
    idea: string;
    selectedTags: string[];
    validationMode: 'quick' | 'deep';
    resumeValidationId?: string;
  }) => {
    const { idea, selectedTags, validationMode, resumeValidationId } = params;
    if (!user?.id || sseControllerRef.current) return;
    cleanup();
    const generation = generationRef.current;
    const isCurrentRun = () => generationRef.current === generation && userIdRef.current === user.id;

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
    setStepTimestamps([Date.now()]);
    setCompletionPreview(null);
    lastStepRef.current = 0;

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
          tikhubToken: hasOwnTikhub ? settings.tikhubToken : "",
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
        if (!isCurrentRun()) return;
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
          const newStep = stageMap[event.stage];
          if (newStep > lastStepRef.current) {
            lastStepRef.current = newStep;
            setCurrentStep(newStep);
            setStepTimestamps(prev => {
              const next = [...prev];
              // Fill gaps
              while (next.length <= newStep) next.push(Date.now());
              return next;
            });
          }
        }
      },
      async (result) => {
        if (!isCurrentRun()) return;
        setProgress(100);
        setCurrentStep(validationSteps.length);
        setStepTimestamps(prev => [...prev, Date.now()]);

        captureEvent('validation_completed', {
          validation_id: result.validationId,
          score: result.overallScore,
          mode: validationMode,
        });

        skinToast.success(`验证完成！评分：${result.overallScore}分`);
        notify("✅ IdeaScan 验证完成", {
          body: `你的创意验证评分：${result.overallScore}分，点击查看完整报告`,
          tag: `validation-${result.validationId}`,
        });
        refetchQuota();

        void queryClient.invalidateQueries({ queryKey: validationKeys.lists(user.id) });
        void queryClient.prefetchQuery({
          queryKey: validationKeys.detail(result.validationId, user?.id),
          queryFn: () => getValidation(result.validationId),
          staleTime: 1000 * 60 * 5,
        }).catch(() => undefined);

        // Show completion preview instead of immediate redirect
        setCompletionPreview({ score: result.overallScore, validationId: result.validationId });

        // Auto-navigate after 4 seconds
        completionTimerRef.current = setTimeout(() => {
          if (!isCurrentRun()) return;
          completionTimerRef.current = null;
          setCompletionPreview(null);
          sseControllerRef.current = null;
          navigate(`/report/${result.validationId}`);
          setIsValidating(false);
          setProgress(0);
          setCurrentStep(0);
          setStepTimestamps([]);
        }, 4000);
      },
      (error) => {
        if (!isCurrentRun()) return;
        sseControllerRef.current = null;
        captureEvent('validation_failed', {
          error: error.substring(0, 100),
          mode: validationMode,
        });

        skinToast.error(`验证失败: ${error}`);
        setIsValidating(false);
        setProgress(0);
        setCurrentStep(0);
        setCurrentValidationId(null);
        setStepTimestamps([]);
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
    stepTimestamps,
    completionPreview,
    startValidation,
    handleCancelAndKeep,
    cleanup,
    navigateToReport,
    dismissPreview,
  };
}
