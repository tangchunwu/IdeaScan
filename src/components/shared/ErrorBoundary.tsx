import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary 组件 - 捕获子组件渲染错误，防止整个应用崩溃
 * 当 UI 组件（如 Toaster、Tooltip）出错时，自动降级而非白屏
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ""}] 捕获错误:`, error);
    console.error("组件堆栈:", errorInfo.componentStack);
    
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      
      // 默认降级：静默失败（不显示任何内容）
      // 这对于 Toaster、Tooltip 等辅助组件很有用
      return null;
    }

    return this.props.children;
  }
}

/**
 * 静默 ErrorBoundary - 出错时不显示任何内容
 * 适用于：Toaster, Sonner, Tooltip 等非核心 UI
 */
export const SilentErrorBoundary = ({ 
  children, 
  name 
}: { 
  children: ReactNode; 
  name?: string;
}) => (
  <ErrorBoundary fallback={null} name={name}>
    {children}
  </ErrorBoundary>
);

/**
 * 带错误提示的 ErrorBoundary
 * 适用于：页面级组件，需要告知用户出错
 */
export const PageErrorBoundary = ({ 
  children,
  name 
}: { 
  children: ReactNode;
  name?: string;
}) => (
  <ErrorBoundary
    name={name}
    fallback={
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="glass-card p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <svg 
              className="w-8 h-8 text-destructive" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">页面加载出错</h2>
          <p className="text-muted-foreground mb-6">
            抱歉，页面遇到了问题。请尝试刷新页面。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
          >
            刷新页面
          </button>
        </div>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;
