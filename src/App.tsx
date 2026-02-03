
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "@/hooks/useAuth";
import { SilentErrorBoundary, PageErrorBoundary, BrandLoader, PageTransition } from "@/components/shared";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy } from "react";
import FeedbackWidget from "@/components/shared/FeedbackWidget";
import { AnalyticsProvider } from "@/lib/posthog";

// Lazy load pages
const Index = lazy(() => import("./pages/Index"));
const Validate = lazy(() => import("./pages/Validate"));
const Report = lazy(() => import("./pages/Report"));
const History = lazy(() => import("./pages/History"));
const Compare = lazy(() => import("./pages/Compare"));
const Discover = lazy(() => import("./pages/Discover"));
const Hunter = lazy(() => import("./pages/Discover/Hunter"));
const Auth = lazy(() => import("./pages/Auth"));
const MVPGenerator = lazy(() => import("./pages/MVP/Generator"));
const PublicLandingPage = lazy(() => import("./pages/MVP/PublicLandingPage"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Pricing = lazy(() => import("./pages/Pricing"));
const FAQ = lazy(() => import("./pages/FAQ"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Index /></PageTransition>} />
        <Route path="/auth" element={<PageTransition><Auth /></PageTransition>} />
        <Route path="/validate" element={<PageTransition><Validate /></PageTransition>} />
        <Route path="/report/:id" element={<PageTransition><Report /></PageTransition>} />
        <Route path="/history" element={<PageTransition><History /></PageTransition>} />
        <Route path="/compare" element={<PageTransition><Compare /></PageTransition>} />
        <Route path="/discover" element={<PageTransition><Discover /></PageTransition>} />
        <Route path="/discover/hunter" element={<PageTransition><Hunter /></PageTransition>} />
        <Route path="/mvp/:id" element={<PageTransition><MVPGenerator /></PageTransition>} />
        <Route path="/p/:slug" element={<PageTransition><PublicLandingPage /></PageTransition>} />
        <Route path="/privacy" element={<PageTransition><Privacy /></PageTransition>} />
        <Route path="/terms" element={<PageTransition><Terms /></PageTransition>} />
        <Route path="/pricing" element={<PageTransition><Pricing /></PageTransition>} />
        <Route path="/faq" element={<PageTransition><FAQ /></PageTransition>} />
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AnalyticsProvider>
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
                  fallback={<BrandLoader fullScreen text="正在加载创意空间..." />}
                >
                  <AnimatedRoutes />
                  <FeedbackWidget />
                </Suspense>
              </PageErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </SilentErrorBoundary>
      </AuthProvider>
    </AnalyticsProvider>
  </QueryClientProvider>
);

export default App;
