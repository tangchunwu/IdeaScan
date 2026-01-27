import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            页面出了点问题
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            抱歉，页面遇到了意外错误。您可以尝试刷新页面或返回首页。
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => window.location.href = '/'}
            >
              返回首页
            </Button>
            <Button onClick={this.handleRetry}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-6 text-left w-full max-w-2xl">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                错误详情 (仅开发环境可见)
              </summary>
              <pre className="mt-2 p-4 bg-muted rounded-lg text-xs overflow-auto text-red-500">
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Silent Error Boundary - gracefully degrades without UI
interface SilentErrorBoundaryProps {
  children: ReactNode;
  name?: string;
}

interface SilentErrorBoundaryState {
  hasError: boolean;
}

export class SilentErrorBoundary extends Component<SilentErrorBoundaryProps, SilentErrorBoundaryState> {
  public state: SilentErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): SilentErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn(`SilentErrorBoundary [${this.props.name || 'unknown'}] caught error:`, error.message);
  }

  public render() {
    if (this.state.hasError) {
      return null; // Silently fail
    }
    return this.props.children;
  }
}

// Page Error Boundary - shows error UI for page-level errors
interface PageErrorBoundaryProps {
  children: ReactNode;
  name?: string;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  public state: PageErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`PageErrorBoundary [${this.props.name || 'unknown'}] caught error:`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            页面加载出错
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            抱歉，页面遇到了意外错误。请尝试刷新或返回首页。
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => window.location.href = '/'}
            >
              返回首页
            </Button>
            <Button onClick={this.handleRetry}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
