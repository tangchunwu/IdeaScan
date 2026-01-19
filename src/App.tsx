import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SilentErrorBoundary, PageErrorBoundary } from "@/components/shared";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import Validate from "./pages/Validate";
import Report from "./pages/Report";
import History from "./pages/History";
import Compare from "./pages/Compare";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

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
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/validate" element={<Validate />} />
                <Route path="/report/:id" element={<Report />} />
                <Route path="/history" element={<History />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </PageErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </SilentErrorBoundary>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
