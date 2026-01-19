import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SilentErrorBoundary, PageErrorBoundary } from "@/components/shared";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Suspense, lazy } from "react";

// Lazy load pages
const Index = lazy(() => import("./pages/Index"));
const Validate = lazy(() => import("./pages/Validate"));
const Report = lazy(() => import("./pages/Report"));
const History = lazy(() => import("./pages/History"));
const Compare = lazy(() => import("./pages/Compare"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      {/* TooltipProvider 使用静默错误边界 - 出错时降级而非白屏 */}
      <SilentErrorBoundary name="TooltipProvider">
        <TooltipProvider>
          {/* Toaster 组件使用静默错误边界 */}
          <SilentErrorBoundary name="Toaster">
            <Toaster />
          </SilentErrorBoundary>

          <SilentErrorBoundary name="Sonner">
            <Sonner />
          </SilentErrorBoundary>

          <BrowserRouter>
            {/* 页面路由使用页面级错误边界 */}
            <PageErrorBoundary name="Routes">
              <Suspense
                fallback={
                  <div className="flex h-screen w-full items-center justify-center">
                    <LoadingSpinner size="lg" />
                  </div>
                }
              >
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/validate" element={<Validate />} />
                  <Route path="/report/:id" element={<Report />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/compare" element={<Compare />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </PageErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </SilentErrorBoundary>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
