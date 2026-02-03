import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from './GlassCard';
import { BrandLogo } from './BrandLogo';

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
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-muted/20">
          <div className="mb-8 scale-110">
            <BrandLogo size="lg" />
          </div>

          <GlassCard className="max-w-lg w-full p-8 text-center border-destructive/20 shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6 ring-8 ring-destructive/5">
              <AlertTriangle className="w-10 h-10 text-destructive" />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-3">
              遇到了一些问题
            </h2>

            <p className="text-muted-foreground mb-8 text-lg">
              抱歉，页面运行过程中发生了意外错误。<br />
              您可以尝试重试或返回首页。
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={this.handleRetry}
                size="lg"
                className="rounded-full shadow-lg shadow-primary/20"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                重新加载
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full"
                onClick={() => window.location.href = '/'}
              >
                <Home className="w-4 h-4 mr-2" />
                返回首页
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-8 text-left">
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium transition-colors">
                    查看错误详情 (Dev Mode)
                  </summary>
                  <div className="mt-2 p-4 bg-muted/50 rounded-xl overflow-auto max-h-60 border border-border/50">
                    <p className="font-mono text-xs text-destructive mb-2 font-bold">{this.state.error.message}</p>
                    <pre className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      {this.state.error.stack}
                    </pre>
                  </div>
                </details>
              </div>
            )}
          </GlassCard>
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
        <GlassCard className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center mx-auto max-w-3xl my-8">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            页面加载出错
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            抱歉，此区域内容暂时无法加载。
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => window.location.href = '/'}
            >
              返回首页
            </Button>
            <Button onClick={this.handleRetry} className="rounded-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        </GlassCard>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
