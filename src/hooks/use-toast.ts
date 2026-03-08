/**
 * Bridge: delegates to sonner for a unified toast system.
 * All legacy `useToast` / `toast({ title, description, variant })` calls
 * are transparently mapped to sonner's API.
 */
import { toast as sonnerToast } from "sonner";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive";
  action?: ToastAction | React.ReactElement;
  className?: string;
  [key: string]: unknown;
}

function extractAction(action: ToastOptions["action"]): { label: string; onClick: () => void } | undefined {
  if (!action) return undefined;
  // sonner-style { label, onClick }
  if (typeof action === "object" && "label" in action && "onClick" in action) {
    return action as ToastAction;
  }
  // React element (legacy ToastAction) – try to extract props
  if (typeof action === "object" && "props" in action) {
    const props = (action as any).props;
    return {
      label: props?.children || props?.altText || "操作",
      onClick: props?.onClick || (() => {}),
    };
  }
  return undefined;
}

function toast(opts: ToastOptions) {
  const title = typeof opts.title === "string" ? opts.title : "";
  const sonnerOpts: Record<string, unknown> = {};

  if (opts.description) sonnerOpts.description = opts.description;
  const act = extractAction(opts.action);
  if (act) sonnerOpts.action = act;

  if (opts.variant === "destructive") {
    sonnerToast.error(title, sonnerOpts);
  } else {
    sonnerToast(title, sonnerOpts);
  }
}

function useToast() {
  return { toast, toasts: [] as never[] };
}

export { useToast, toast };
